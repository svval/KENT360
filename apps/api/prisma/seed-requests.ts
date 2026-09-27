/**
 * Phase 5 demo requests – DEMO DATA, clearly marked ("(Demo kaydı)" in the description,
 * `demoSeed` in the timeline metadata).
 *
 * Deterministic: a fixed-seed PRNG decides categories, places, statuses and times, so the
 * content is the same on every machine. Idempotent: the set is created once per
 * municipality; later runs detect it and do nothing. Times are relative to the moment the
 * set is created, spread over the last 90 days (weighted towards recent weeks).
 *
 * Numbers come from the same atomic counter as real requests (no collisions later).
 * Historic requests are closed without work orders – those arrive with Phase 6.
 */
import { formatPublicNumber, yearInTimeZone } from '../src/common/utils/public-number';
import { type PrismaClient } from '../src/generated/prisma/client';
import { DEMO_NEIGHBORHOODS } from './seed-domain';

const SEED_MARKER = 'phase5-v1';
const COUNT = 120;
const DAY = 86_400_000;
const MINUTE = 60_000;

/** mulberry32 – tiny deterministic PRNG. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DESCRIPTIONS: Record<string, string[]> = {
  ROAD_POTHOLE: [
    'Yolun ortasında derin bir çukur oluştu, araçlar zarar görüyor.',
    'Okul önündeki yolda büyük bir çukur var, araçlar sürekli çarpıyor.',
    'Yağmurdan sonra asfalt çöktü, çukur giderek büyüyor.',
  ],
  ROAD_ASPHALT: ['Asfalt yer yer kalkmış, yol bozuk.', 'Yeni yapılan yama tekrar bozuldu.'],
  ROAD_SIDEWALK: ['Kaldırım taşları yerinden çıkmış, yayalar düşüyor.', 'Kaldırım bordürü kırık.'],
  PARK_PLAYGROUND: [
    'Parktaki salıncak zinciri kopmuş, çocuklar için tehlikeli.',
    'Kaydırakta keskin kırık var.',
  ],
  PARK_LIGHTING: [
    'Park aydınlatması yanmıyor, akşamları çok karanlık.',
    'Parktaki iki lamba arızalı.',
  ],
  PARK_IRRIGATION: ['Park çimleri kurumuş, sulama çalışmıyor.', 'Fıskiye sürekli su kaçırıyor.'],
  CLEANING_GARBAGE: [
    'Sokaktaki çöpler iki gündür toplanmadı.',
    'Çöp poşetleri yola taşmış, koku var.',
  ],
  CLEANING_CONTAINER: [
    'Çöp konteyneri kırık ve taşıyor.',
    'Konteynerin kapağı yok, çöpler dağılıyor.',
  ],
  CLEANING_DEBRIS: ['Boş arsaya inşaat molozu dökülmüş.', 'Kaldırıma hafriyat bırakılmış.'],
  ENFORCEMENT_OCCUPATION: [
    'Esnaf kaldırımı tamamen işgal etmiş.',
    'Seyyar tezgahlar yaya yolunu kapatıyor.',
  ],
  ENFORCEMENT_NOISE: [
    'Gece yarısı yüksek sesli müzik yapılıyor.',
    'İnşaat sabah çok erken saatte gürültü yapıyor.',
  ],
  ENFORCEMENT_POSTER: [
    'Duvarlara izinsiz afiş yapıştırılmış.',
    'Elektrik direklerine ilan asılmış.',
  ],
  SOCIAL_ASSISTANCE: [
    'Yaşlı komşumuzun ihtiyaçları için destek istiyoruz.',
    'Kış için yakacak yardımı talebi.',
  ],
};

const STREETS = [
  'Atatürk Cd.',
  'İnönü Cd.',
  'Gazi Muhtar Paşa Blv.',
  'Menderes Sk.',
  'Çiçek Sk.',
  'Okul Sk.',
  'Park Sk.',
  'Cumhuriyet Cd.',
];

export async function seedDemoRequests(
  prisma: PrismaClient,
  municipalityId: string,
): Promise<number> {
  const already = await prisma.requestHistory.findFirst({
    where: {
      request: { municipalityId },
      metadata: { path: ['demoSeed'], equals: SEED_MARKER },
    },
    select: { id: true },
  });
  if (already) return 0;

  const municipality = await prisma.municipality.findUniqueOrThrow({
    where: { id: municipalityId },
    select: { timezone: true, settings: true },
  });
  const users = new Map(
    (
      await prisma.user.findMany({
        where: {
          municipalityId,
          email: { in: ['admin@kent360.local', 'manager@kent360.local', 'citizen@kent360.local'] },
        },
        select: { id: true, email: true },
      })
    ).map((u) => [u.email.split('@')[0], u.id]),
  );
  const managerDepartmentId = (
    await prisma.user.findFirst({
      where: { municipalityId, email: 'manager@kent360.local' },
      select: { departmentId: true },
    })
  )?.departmentId;
  const leaves = await prisma.requestCategory.findMany({
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
      departmentId: true,
      defaultPriority: true,
      defaultSlaMinutes: true,
      parent: { select: { defaultSlaMinutes: true } },
      department: { select: { name: true } },
    },
    orderBy: { code: 'asc' },
  });
  const neighborhoods = await prisma.neighborhood.findMany({
    where: {
      municipalityId,
      status: 'ACTIVE',
      code: { in: DEMO_NEIGHBORHOODS.map((n) => n.code) },
    },
    select: { id: true, code: true, name: true },
  });
  if (leaves.length === 0 || neighborhoods.length === 0 || !users.get('admin')) return 0;

  const random = prng(20260927);
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
  const ratio = 0.25;
  const now = Date.now();

  // Chronological plan first, so numbers follow creation time.
  const plan = Array.from({ length: COUNT }, (_, i) => {
    const category = leaves[Math.floor(random() * leaves.length)];
    const slaMinutes = category.defaultSlaMinutes ?? category.parent?.defaultSlaMinutes ?? 1440;
    // Weighted towards recent weeks; the first few are placed to show every SLA state.
    let ageMs = Math.pow(random(), 1.6) * 90 * DAY;
    if (i < 4)
      ageMs = slaMinutes * MINUTE * (0.8 + 0.04 * i); // at risk
    else if (i < 8)
      ageMs = slaMinutes * MINUTE * (1.3 + 0.1 * i); // overdue, still open
    else if (i < 14) ageMs = slaMinutes * MINUTE * 0.2 * (i - 7); // fresh, on time
    return { i, category, slaMinutes, createdAt: new Date(now - ageMs) };
  }).sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime());

  let created = 0;
  for (const item of plan) {
    const { category, slaMinutes, createdAt } = item;
    const ageMinutes = (now - createdAt.getTime()) / MINUTE;
    const outside = random() < 0.1;
    const nbIndex = Math.floor(random() * DEMO_NEIGHBORHOODS.length);
    const demo = DEMO_NEIGHBORHOODS[nbIndex];
    const ring = (
      demo.geometry.type === 'Polygon'
        ? demo.geometry.coordinates[0]
        : demo.geometry.coordinates[0][0]
    ) as readonly (readonly number[])[];
    const [w, s] = ring[0];
    const [e, n] = ring[2];
    const latitude = outside ? 37.1 + random() * 0.01 : s + (n - s) * (0.1 + 0.8 * random());
    const longitude = outside ? 37.3 + random() * 0.01 : w + (e - w) * (0.1 + 0.8 * random());
    const neighborhood = outside ? null : (neighborhoods.find((x) => x.code === demo.code) ?? null);

    // Reporter & channel
    // Citizens report online; the call centre (admin) logs calls for every department; the
    // Fen İşleri manager only files reports for his own department.
    const managerChannel = category.departmentId === managerDepartmentId && random() < 0.5;
    const channel = item.i % 15 === 0 ? 'citizen' : managerChannel ? 'manager' : 'admin';
    const source =
      channel === 'citizen' ? 'WEB' : channel === 'admin' ? 'CALL_CENTER' : 'MUNICIPAL_STAFF';
    const createdById = users.get(channel) ?? users.get('admin')!;

    // Status according to age (forced SLA showcases stay open)
    const roll = random();
    const forcedOpen = item.i < 14;
    let status: 'NEW' | 'UNDER_REVIEW' | 'ASSIGNED_TO_DEPARTMENT' | 'CLOSED' | 'REJECTED';
    if (forcedOpen)
      status =
        item.i % 3 === 0 ? 'NEW' : item.i % 3 === 1 ? 'UNDER_REVIEW' : 'ASSIGNED_TO_DEPARTMENT';
    else if (ageMinutes < slaMinutes * 0.3) status = roll < 0.5 ? 'NEW' : 'UNDER_REVIEW';
    else if (roll < 0.08) status = 'REJECTED';
    else if (roll < 0.78) status = 'CLOSED';
    else status = roll < 0.9 ? 'ASSIGNED_TO_DEPARTMENT' : 'UNDER_REVIEW';

    const slaDueAt = new Date(createdAt.getTime() + slaMinutes * MINUTE);
    const slaAtRiskAt = new Date(slaDueAt.getTime() - slaMinutes * ratio * MINUTE);
    const at = (fraction: number) => new Date(createdAt.getTime() + slaMinutes * MINUTE * fraction);
    const resolvedAt = status === 'CLOSED' ? at(0.3 + random() * 1.1) : null; // ~20 % late
    const closedAt =
      status === 'CLOSED'
        ? new Date(resolvedAt!.getTime() + 6 * 3_600_000)
        : status === 'REJECTED'
          ? at(0.1)
          : null;
    const priority =
      category.defaultPriority === 'HIGH' && random() < 0.15
        ? 'CRITICAL'
        : category.defaultPriority;

    await prisma.$transaction(async (tx) => {
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
          createdById,
          categoryId: category.id,
          departmentId: category.departmentId,
          neighborhoodId: neighborhood?.id ?? null,
          title: neighborhood ? `${category.name} – ${neighborhood.name}` : category.name,
          description: `${pick(DESCRIPTIONS[category.code] ?? ['Bildirim.'])} (Demo kaydı)`,
          status,
          priority,
          source,
          latitude,
          longitude,
          address: `${pick(STREETS)} No: ${1 + Math.floor(random() * 80)}`,
          slaDueAt,
          slaAtRiskAt,
          createdAt,
          resolvedAt,
          closedAt,
          rejectionReason: status === 'REJECTED' ? 'Mükerrer bildirim (demo).' : null,
        },
        select: { id: true },
      });

      const events: {
        eventType: 'CREATED' | 'DEPARTMENT_ASSIGNED' | 'STATUS_CHANGED';
        description: string;
        createdAt: Date;
        oldStatus?: 'NEW' | 'UNDER_REVIEW' | 'ASSIGNED_TO_DEPARTMENT' | 'RESOLVED';
        newStatus?:
          'NEW' | 'UNDER_REVIEW' | 'ASSIGNED_TO_DEPARTMENT' | 'RESOLVED' | 'CLOSED' | 'REJECTED';
        performedById?: string;
      }[] = [
        {
          eventType: 'CREATED',
          description: `Talep oluşturuldu (${publicNumber}).`,
          createdAt,
          newStatus: 'NEW',
          performedById: createdById,
        },
        {
          eventType: 'DEPARTMENT_ASSIGNED',
          description: `${category.department!.name} birimine yönlendirildi.`,
          createdAt,
        },
      ];
      const manager = users.get('manager');
      if (status !== 'NEW') {
        const reviewAt = at(0.05);
        if (status === 'REJECTED') {
          events.push({
            eventType: 'STATUS_CHANGED',
            description: 'Durum: Yeni → Reddedildi – Gerekçe: Mükerrer bildirim (demo).',
            createdAt: closedAt!,
            oldStatus: 'NEW',
            newStatus: 'REJECTED',
            performedById: manager,
          });
        } else {
          events.push({
            eventType: 'STATUS_CHANGED',
            description: 'Durum: Yeni → İncelemede',
            createdAt: reviewAt,
            oldStatus: 'NEW',
            newStatus: 'UNDER_REVIEW',
            performedById: manager,
          });
          if (status === 'ASSIGNED_TO_DEPARTMENT' || status === 'CLOSED') {
            events.push({
              eventType: 'STATUS_CHANGED',
              description: 'Durum: İncelemede → Müdürlüğe Atandı',
              createdAt: at(0.1),
              oldStatus: 'UNDER_REVIEW',
              newStatus: 'ASSIGNED_TO_DEPARTMENT',
              performedById: manager,
            });
          }
          if (status === 'CLOSED') {
            events.push({
              eventType: 'STATUS_CHANGED',
              description:
                'Talep çözüldü (demo geçmiş kaydı; iş emri kayıtları Phase 6 ile gelir).',
              createdAt: resolvedAt!,
              oldStatus: 'ASSIGNED_TO_DEPARTMENT',
              newStatus: 'RESOLVED',
            });
            events.push({
              eventType: 'STATUS_CHANGED',
              description: 'Durum: Çözüldü → Kapandı',
              createdAt: closedAt!,
              oldStatus: 'RESOLVED',
              newStatus: 'CLOSED',
            });
          }
        }
      }
      await tx.requestHistory.createMany({
        data: events.map((event) => ({
          requestId: request.id,
          ...event,
          metadata: { demoSeed: SEED_MARKER },
        })),
      });
    });
    created += 1;
  }
  return created;
}
