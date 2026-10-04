import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, type RequestAnalysisResult, RecordStatus } from '@kent360/shared-types';
import { type AuthUser } from '../../common/auth/auth-user';
import { type RequestMeta } from '../../common/utils/request-meta';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AiService } from './ai.service';
import { type CategoryOption } from './domain/keyword-classifier';
import { maskPersonalData } from './domain/pii';
import { DuplicateService } from './duplicate.service';

interface CategoryRecord {
  id: string;
  name: string;
  department: { id: string; name: string } | null;
  parent: { id: string; name: string } | null;
}

/**
 * "AI önerisi" for a request: provider suggestion (category, department, priority,
 * confidence, short reasoning) + explainable duplicate candidates. Before saving it is
 * a preview (POST /requests/analyze, nothing stored); after a request is created the
 * analysis is stored (ai_analyses, duplicate_matches) without personal data.
 */
@Injectable()
export class RequestAnalysisService {
  private readonly logger = new Logger(RequestAnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ai: AiService,
    private readonly duplicates: DuplicateService,
  ) {}

  async preview(
    actor: AuthUser,
    input: { description: string; latitude?: number; longitude?: number; categoryId?: string },
  ): Promise<RequestAnalysisResult> {
    const { result, suggestion } = await this.suggest(actor.municipalityId, input.description);
    const possibleDuplicates =
      input.latitude !== undefined && input.longitude !== undefined
        ? await this.duplicates.find(actor, {
            latitude: input.latitude,
            longitude: input.longitude,
            description: input.description,
            categoryId: input.categoryId ?? suggestion.category?.id ?? null,
            mode: 'user',
          })
        : [];
    return {
      provider: result.provider,
      model: result.model,
      fallback: result.fallback,
      suggestion,
      possibleDuplicates,
      analyzedAt: new Date().toISOString(),
    };
  }

  /** Best effort after a request was created: never fails the request itself. */
  async recordForRequest(
    actor: AuthUser,
    request: {
      id: string;
      description: string;
      latitude: number;
      longitude: number;
      categoryId: string;
    },
    meta: RequestMeta,
  ): Promise<void> {
    try {
      const { result, suggestion } = await this.suggest(actor.municipalityId, request.description);
      const candidates = await this.duplicates.find(actor, {
        latitude: request.latitude,
        longitude: request.longitude,
        description: request.description,
        categoryId: request.categoryId,
        excludeRequestId: request.id,
        mode: 'system',
      });
      await this.prisma.$transaction(async (tx) => {
        const analysis = await tx.aIAnalysis.create({
          data: {
            requestId: request.id,
            provider: result.provider,
            model: result.model,
            suggestedCategoryId: suggestion.category?.id ?? null,
            suggestedDepartmentId: suggestion.department?.id ?? null,
            prioritySuggestion: suggestion.priority,
            // Codes and signals only – no description, no personal data.
            classification: {
              categoryCode: result.classification.categoryCode,
              matchedKeywords: result.classification.matchedKeywords,
              fallback: result.fallback,
            },
            summary: suggestion.summary.slice(0, 1000),
            confidence: suggestion.confidence,
            rawResponse: { reasoning: suggestion.reasoning },
            latencyMs: result.latencyMs,
            accepted: suggestion.category ? suggestion.category.id === request.categoryId : null,
          },
          select: { id: true },
        });
        if (candidates.length > 0) {
          await tx.duplicateMatch.createMany({
            data: candidates.map((c) => ({
              requestId: request.id,
              matchedRequestId: c.requestId,
              score: c.score,
              distanceMeters: c.distanceMeters,
              distanceScore: c.components.distance,
              categoryScore: c.components.category,
              timeScore: c.components.time,
              textScore: c.components.text,
            })),
            skipDuplicates: true,
          });
        }
        await tx.request.update({ where: { id: request.id }, data: { aiAnalyzed: true } });
        await this.audit.record(
          {
            action: AuditAction.REQUEST_AI_ANALYZED,
            entityType: 'Request',
            entityId: request.id,
            municipalityId: actor.municipalityId,
            userId: actor.id,
            after: {
              analysisId: analysis.id,
              provider: result.provider,
              model: result.model,
              fallback: result.fallback,
              suggestedCategoryId: suggestion.category?.id ?? null,
              priority: suggestion.priority,
              confidence: suggestion.confidence,
              possibleDuplicates: candidates.filter((c) => c.possibleDuplicate).length,
            },
            meta,
          },
          tx,
        );
      });
    } catch (error) {
      this.logger.warn(
        { requestId: request.id, error: error instanceof Error ? error.name : 'Unknown' },
        'Request analysis could not be stored',
      );
    }
  }

  private async suggest(municipalityId: string, description: string) {
    const records = await this.categories(municipalityId);
    const options: CategoryOption[] = records.map((c) => ({
      code: c.code,
      name: c.name,
      parentName: c.parent?.name ?? null,
      keywords: c.keywords,
      parentKeywords: c.parent?.keywords ?? [],
      defaultPriority: c.defaultPriority,
    }));
    // Personal data never leaves the system, and is never stored with the analysis.
    const masked = maskPersonalData(description);
    const result = await this.ai.analyze({ description: masked, categories: options });
    const chosen: CategoryRecord | undefined = records.find(
      (c) => c.code === result.classification.categoryCode,
    );
    return {
      result,
      suggestion: {
        category: chosen
          ? {
              id: chosen.id,
              name: chosen.name,
              parent: chosen.parent ? { id: chosen.parent.id, name: chosen.parent.name } : null,
            }
          : null,
        department: chosen?.department ?? null,
        priority: result.classification.priority,
        confidence: result.classification.confidence,
        reasoning: maskPersonalData(result.classification.reasoning),
        summary: maskPersonalData(result.classification.summary),
      },
    };
  }

  /** Selectable (leaf, active, routable) categories of the municipality. */
  private async categories(municipalityId: string) {
    const rows = await this.prisma.forTenant(municipalityId).requestCategory.findMany({
      where: {
        status: RecordStatus.ACTIVE,
        departmentId: { not: null },
        children: { none: {} },
        OR: [{ parentId: null }, { parent: { status: RecordStatus.ACTIVE } }],
      },
      select: {
        id: true,
        code: true,
        name: true,
        keywords: true,
        defaultPriority: true,
        department: { select: { id: true, name: true, status: true } },
        parent: { select: { id: true, name: true, keywords: true } },
      },
      orderBy: { code: 'asc' },
    });
    return rows
      .filter((r) => r.department?.status === RecordStatus.ACTIVE)
      .map((r) => ({
        ...r,
        department: r.department ? { id: r.department.id, name: r.department.name } : null,
      }));
  }
}
