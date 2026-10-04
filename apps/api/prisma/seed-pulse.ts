/**
 * Phase 10–11 demo signals – DEMO DATA, small and deliberate (not hundreds of rows).
 *
 * MahallePulse and duplicate detection need RECENT reports; the Phase 5 set ages with
 * time. This adds, once per municipality (marker `demoSeed: phase10-v1`), relative to
 * the moment the seed runs:
 *   • Karataş – 5 pothole reports within ~60 m of the story point over the last 6 days
 *     (a visible "yol çukuru" spike, and duplicate candidates for a new report there);
 *   • Güneykent – 4 garbage reports over the last 5 days.
 * Each gets a stored AI analysis from the same deterministic classifier the API uses
 * (MockAIProvider) and explainable duplicate matches between the cluster members.
 * Re-run `npm run db:seed` on a fresh database for a current-looking demo.
 */
import { formatPublicNumber, yearInTimeZone } from '../src/common/utils/public-number';
import { type PrismaClient } from '../src/generated/prisma/client';
import { duplicateScore } from '../src/modules/ai/domain/duplicate-score';
import { classifyByKeywords } from '../src/modules/ai/domain/keyword-classifier';

const SEED_MARKER = 'phase10-v1';
const HOUR = 3_600_000;
const STORY = { latitude: 37.0585, longitude: 37.371 };

const POTHOLES = [
  {
    text: 'Okul önündeki yolda derin bir çukur var, araçlar zarar görüyor.',
    ageHours: 6,
    dLat: 0,
    dLng: 0,
  },
  {
    text: 'Okulun karşısındaki yolda büyük çukur oluştu, çocuklar için tehlikeli.',
    ageHours: 20,
    dLat: 0.0003,
    dLng: 0.0002,
  },
  {
    text: 'Yağmurdan sonra asfalt göçtü, çukur her gün büyüyor.',
    ageHours: 52,
    dLat: -0.0002,
    dLng: 0.0004,
  },
  {
    text: 'Kavşakta asfalt çökmüş, derin bir çukur var.',
    ageHours: 96,
    dLat: 0.0004,
    dLng: -0.0003,
  },
  {
    text: 'Yolun ortasındaki çukur yüzünden lastiğim patladı.',
    ageHours: 130,
    dLat: -0.0004,
    dLng: -0.0002,
  },
];
const GARBAGE = [
  { text: 'Sokaktaki çöpler üç gündür toplanmadı, koku var.', ageHours: 10 },
  { text: 'Çöp poşetleri yola taşmış, kediler dağıtıyor.', ageHours: 30 },
  { text: 'Pazar yerinin çöpleri alınmadı.', ageHours: 70 },
  { text: 'Apartman önündeki çöpler birikti, toplanmıyor.', ageHours: 110 },
];

/** Great-circle distance in metres (seed-side twin of ST_DistanceSphere). */
function meters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export async function seedPulseSignals(
  prisma: PrismaClient,
  municipalityId: string,
): Promise<number> {
  const already = await prisma.requestHistory.findFirst({
    where: { request: { municipalityId }, metadata: { path: ['demoSeed'], equals: SEED_MARKER } },
    select: { id: true },
  });
  if (already) return 0;

  const [municipality, admin, categories, neighborhoods] = await Promise.all([
    prisma.municipality.findUniqueOrThrow({
      where: { id: municipalityId },
      select: { timezone: true },
    }),
    prisma.user.findFirst({
      where: { municipalityId, email: 'admin@kent360.local' },
      select: { id: true },
    }),
    prisma.requestCategory.findMany({
      where: {
        municipalityId,
        status: 'ACTIVE',
        parentId: { not: null },
        departmentId: { not: null },
      },
      select: {
        id: true,
        code: true,
        name: true,
        keywords: true,
        defaultPriority: true,
        defaultSlaMinutes: true,
        departmentId: true,
        department: { select: { name: true } },
        parent: { select: { name: true, keywords: true, defaultSlaMinutes: true } },
      },
    }),
    prisma.neighborhood.findMany({
      where: { municipalityId, code: { in: ['KARATAS', 'GUNEYKENT'] } },
      select: { id: true, code: true, name: true },
    }),
  ]);
  const pothole = categories.find((c) => c.code === 'ROAD_POTHOLE');
  const garbage = categories.find((c) => c.code === 'CLEANING_GARBAGE');
  const karatas = neighborhoods.find((n) => n.code === 'KARATAS');
  const guneykent = neighborhoods.find((n) => n.code === 'GUNEYKENT');
  if (!admin || !pothole || !garbage || !karatas || !guneykent) return 0;

  const options = categories.map((c) => ({
    code: c.code,
    name: c.name,
    parentName: c.parent?.name ?? null,
    keywords: c.keywords,
    parentKeywords: c.parent?.keywords ?? [],
    defaultPriority: c.defaultPriority,
  }));
  const now = Date.now();
  const plan = [
    ...POTHOLES.map((p) => ({
      ...p,
      category: pothole,
      neighborhood: karatas,
      latitude: STORY.latitude + p.dLat,
      longitude: STORY.longitude + p.dLng,
    })),
    ...GARBAGE.map((g, i) => ({
      ...g,
      category: garbage,
      neighborhood: guneykent,
      latitude: 37.056 + i * 0.0006,
      longitude: 37.394 - i * 0.0005,
    })),
  ].sort((x, y) => y.ageHours - x.ageHours); // oldest first → numbers follow time

  const created: {
    id: string;
    text: string;
    createdAt: number;
    latitude: number;
    longitude: number;
    categoryId: string;
  }[] = [];
  for (const item of plan) {
    const createdAt = new Date(now - item.ageHours * HOUR);
    const slaMinutes =
      item.category.defaultSlaMinutes ?? item.category.parent?.defaultSlaMinutes ?? 1440;
    const slaDueAt = new Date(createdAt.getTime() + slaMinutes * 60_000);
    const slaAtRiskAt = new Date(slaDueAt.getTime() - slaMinutes * 0.25 * 60_000);
    const classification = classifyByKeywords(item.text, options);
    const suggested = categories.find((c) => c.code === classification.categoryCode) ?? null;
    const id = await prisma.$transaction(async (tx) => {
      const year = yearInTimeZone(createdAt, municipality.timezone);
      const [row] = await tx.$queryRaw<{ value: number }[]>`
        INSERT INTO number_sequences (municipality_id, scope, year, last_value, updated_at)
        VALUES (${municipalityId}::uuid, 'REQUEST'::"SequenceScope", ${year}::int, 1, now())
        ON CONFLICT (municipality_id, scope, year)
        DO UPDATE SET last_value = number_sequences.last_value + 1, updated_at = now()
        RETURNING last_value AS value`;
      const publicNumber = formatPublicNumber('REQUEST', year, Number(row.value));
      const request = await tx.request.create({
        data: {
          municipalityId,
          publicNumber,
          createdById: admin.id,
          categoryId: item.category.id,
          departmentId: item.category.departmentId,
          neighborhoodId: item.neighborhood.id,
          title: `${item.category.name} – ${item.neighborhood.name}`,
          description: `${item.text} (Demo kaydı)`,
          status: item.ageHours > 48 ? 'UNDER_REVIEW' : 'NEW',
          priority: item.category.defaultPriority,
          source: 'CALL_CENTER',
          latitude: item.latitude,
          longitude: item.longitude,
          address: `${item.neighborhood.name} Mh. (demo)`,
          slaDueAt,
          slaAtRiskAt,
          aiAnalyzed: true,
          createdAt,
        },
        select: { id: true },
      });
      await tx.requestHistory.createMany({
        data: [
          {
            requestId: request.id,
            eventType: 'CREATED',
            newStatus: 'NEW',
            description: `Talep oluşturuldu (${publicNumber}).`,
            performedById: admin.id,
            createdAt,
            metadata: { demoSeed: SEED_MARKER },
          },
          {
            requestId: request.id,
            eventType: 'DEPARTMENT_ASSIGNED',
            description: `${item.category.department!.name} birimine yönlendirildi.`,
            createdAt,
            metadata: { demoSeed: SEED_MARKER },
          },
          ...(item.ageHours > 48
            ? [
                {
                  requestId: request.id,
                  eventType: 'STATUS_CHANGED' as const,
                  oldStatus: 'NEW' as const,
                  newStatus: 'UNDER_REVIEW' as const,
                  description: 'Durum: Yeni → İncelemede',
                  createdAt: new Date(createdAt.getTime() + 2 * HOUR),
                  metadata: { demoSeed: SEED_MARKER },
                },
              ]
            : []),
        ],
      });
      await tx.aIAnalysis.create({
        data: {
          requestId: request.id,
          provider: 'mock',
          model: 'keyword-rules-v1',
          suggestedCategoryId: suggested?.id ?? null,
          suggestedDepartmentId: suggested?.departmentId ?? null,
          prioritySuggestion: classification.priority,
          classification: {
            categoryCode: classification.categoryCode,
            matchedKeywords: classification.matchedKeywords,
            fallback: false,
          },
          summary: classification.summary,
          confidence: classification.confidence,
          rawResponse: { reasoning: classification.reasoning },
          latencyMs: 1,
          accepted: suggested ? suggested.id === item.category.id : null,
          createdAt,
        },
      });
      return request.id;
    });
    created.push({
      id,
      text: item.text,
      createdAt: createdAt.getTime(),
      latitude: item.latitude,
      longitude: item.longitude,
      categoryId: item.category.id,
    });
  }

  // Duplicate matches inside each cluster (newer → older), scored like the API.
  for (const [index, request] of created.entries()) {
    for (const earlier of created.slice(0, index)) {
      if (earlier.categoryId !== request.categoryId) continue;
      const distance = meters(request, earlier);
      if (distance > 150) continue;
      const [{ similarity }] = await prisma.$queryRaw<{ similarity: number }[]>`
        SELECT similarity(${request.text}, ${earlier.text}) AS similarity`;
      const { score, components } = duplicateScore({
        distanceMeters: distance,
        sameCategory: true,
        sameParent: true,
        textSimilarity: Number(similarity),
        ageMinutes: (request.createdAt - earlier.createdAt) / 60_000,
      });
      if (score < 0.35) continue;
      await prisma.duplicateMatch.create({
        data: {
          requestId: request.id,
          matchedRequestId: earlier.id,
          score,
          distanceMeters: Math.round(distance),
          distanceScore: components.distance,
          categoryScore: components.category,
          timeScore: components.time,
          textScore: components.text,
        },
      });
    }
  }
  return created.length;
}
