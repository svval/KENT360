import Anthropic from '@anthropic-ai/sdk';
import { Priority } from '@kent360/shared-types';
import { z } from 'zod';
import { type AiProvider, type AnalyzeInput } from './ai-provider';
import { type Classification, summarise } from './domain/keyword-classifier';

const PRIORITIES = Object.values(Priority) as [Priority, ...Priority[]];

/** What Claude must return (structured output, validated again here). */
const ResultSchema = z.object({
  categoryCode: z.string().nullable(),
  priority: z.enum(PRIORITIES),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(400),
  summary: z.string().max(200),
});

const JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['categoryCode', 'priority', 'confidence', 'reasoning', 'summary'],
  properties: {
    categoryCode: { type: ['string', 'null'] },
    priority: { type: 'string', enum: PRIORITIES },
    confidence: { type: 'number' },
    reasoning: { type: 'string' },
    summary: { type: 'string' },
  },
} as const;

const SYSTEM = [
  'Bir belediyenin vatandaş talep sistemi için sınıflandırıcısın.',
  'Verilen kategori listesinden açıklamaya en uygun alt kategorinin kodunu seç; emin değilsen null döndür.',
  'Önceliği LOW, NORMAL, HIGH veya CRITICAL olarak öner: insan güvenliği riski varsa CRITICAL, yakın tehlike varsa HIGH.',
  'confidence 0 ile 1 arasında olsun. reasoning en fazla iki kısa Türkçe cümle olsun; summary tek cümlelik Türkçe özet olsun.',
  'Bu bir öneridir; nihai kararı belediye personeli verir.',
].join(' ');

/**
 * Claude via the official SDK (AI_PROVIDER=anthropic + AI_API_KEY). One short
 * classification call with structured JSON output; low effort (classification work).
 * Server-side refusal fallbacks are enabled ("default"); a remaining refusal, a timeout
 * or any API error makes AiService answer with the mock provider instead.
 */
export class AnthropicAiProvider implements AiProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
    timeoutMs: number,
  ) {
    this.client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 1 });
  }

  async analyzeRequest(input: AnalyzeInput): Promise<Classification> {
    const catalogue = input.categories
      .map(
        (c) =>
          `${c.code}: ${c.parentName ? `${c.parentName} › ` : ''}${c.name}` +
          (c.keywords.length ? ` (${c.keywords.join(', ')})` : ''),
      )
      .join('\n');
    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 1024,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: JSON_SCHEMA as unknown as Record<string, unknown> },
      },
      messages: [
        {
          role: 'user',
          content: `Kategoriler:\n${catalogue}\n\nTalep açıklaması:\n${input.description}`,
        },
      ],
    });
    if (response.stop_reason === 'refusal') {
      throw new Error('AI provider declined the request');
    }
    const text = response.content.find((block) => block.type === 'text');
    if (!text || text.type !== 'text') throw new Error('AI provider returned no text');
    const parsed = ResultSchema.parse(JSON.parse(text.text));
    const known = input.categories.some((c) => c.code === parsed.categoryCode);
    return {
      categoryCode: known ? parsed.categoryCode : null,
      priority: parsed.priority,
      confidence: Math.round(parsed.confidence * 100) / 100,
      matchedKeywords: [],
      reasoning: parsed.reasoning,
      summary: parsed.summary || summarise(input.description),
    };
  }

  async suggestCategory(input: AnalyzeInput) {
    const { categoryCode, confidence } = await this.analyzeRequest(input);
    return { categoryCode, confidence };
  }

  async suggestPriority(input: AnalyzeInput): Promise<Priority> {
    return (await this.analyzeRequest(input)).priority;
  }

  async summarize(description: string): Promise<string> {
    return (await this.analyzeRequest({ description, categories: [] })).summary;
  }
}
