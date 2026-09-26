/**
 * Phase 4 demo data: departments, request category tree and DEMO neighbourhood
 * geometries for the demo municipality. Create-only and idempotent: records that
 * already exist (matched by code) are never overwritten, so edits made in the UI – or
 * real boundaries imported later – survive a re-run.
 */
import { type Priority } from '@kent360/shared-types';
import { type PrismaClient } from '../src/generated/prisma/client';

interface DemoCategory {
  code: string;
  name: string;
  department: string;
  priority: Priority;
  slaMinutes: number;
  icon?: string;
  keywords?: string[];
}

export const DEMO_DEPARTMENTS = [
  {
    code: 'PUBLIC_WORKS',
    name: 'Fen İşleri Müdürlüğü',
    description: 'Yol, kaldırım ve altyapı bakım-onarımı.',
  },
  {
    code: 'PARKS_AND_GARDENS',
    name: 'Park ve Bahçeler Müdürlüğü',
    description: 'Park, oyun alanı ve yeşil alan bakımı.',
  },
  {
    code: 'CLEANING_SERVICES',
    name: 'Temizlik İşleri Müdürlüğü',
    description: 'Çöp toplama, konteyner ve moloz hizmetleri.',
  },
  {
    code: 'MUNICIPAL_POLICE',
    name: 'Zabıta Müdürlüğü',
    description: 'İşgal, gürültü ve izinsiz ilan denetimi.',
  },
  {
    code: 'SOCIAL_SERVICES',
    name: 'Sosyal Yardım İşleri Müdürlüğü',
    description: 'İhtiyaç sahiplerine sosyal destek.',
  },
] as const;

/**
 * Root → sub-categories. Sub-categories are what citizens pick and what Phase 5 routes
 * (department required); roots carry display defaults.
 * SLA minutes: 240 = 4 saat · 720 = 12 saat · 1440 = 1 gün · 2880 = 2 gün · 4320 = 3 gün.
 */
export const DEMO_CATEGORY_TREE: (DemoCategory & { children: DemoCategory[] })[] = [
  {
    code: 'ROAD',
    name: 'Yol ve Kaldırım',
    department: 'PUBLIC_WORKS',
    priority: 'NORMAL',
    slaMinutes: 4320,
    icon: 'construction',
    children: [
      {
        code: 'ROAD_POTHOLE',
        name: 'Yol Çukuru',
        department: 'PUBLIC_WORKS',
        priority: 'HIGH',
        slaMinutes: 1440,
        keywords: ['çukur', 'yol', 'göçük', 'asfalt'],
      },
      {
        code: 'ROAD_ASPHALT',
        name: 'Asfalt Bozulması',
        department: 'PUBLIC_WORKS',
        priority: 'NORMAL',
        slaMinutes: 4320,
        keywords: ['asfalt', 'yama', 'bozulma', 'çatlak'],
      },
      {
        code: 'ROAD_SIDEWALK',
        name: 'Kaldırım Bozukluğu',
        department: 'PUBLIC_WORKS',
        priority: 'NORMAL',
        slaMinutes: 4320,
        keywords: ['kaldırım', 'parke', 'bordür'],
      },
    ],
  },
  {
    code: 'PARK',
    name: 'Park ve Yeşil Alan',
    department: 'PARKS_AND_GARDENS',
    priority: 'NORMAL',
    slaMinutes: 2880,
    icon: 'trees',
    children: [
      {
        code: 'PARK_PLAYGROUND',
        name: 'Oyun Grubu Arızası',
        department: 'PARKS_AND_GARDENS',
        priority: 'HIGH',
        slaMinutes: 1440,
        keywords: ['salıncak', 'kaydırak', 'oyun', 'kırık'],
      },
      {
        code: 'PARK_LIGHTING',
        name: 'Park Aydınlatması',
        department: 'PARKS_AND_GARDENS',
        priority: 'NORMAL',
        slaMinutes: 2880,
        keywords: ['lamba', 'aydınlatma', 'karanlık'],
      },
      {
        code: 'PARK_IRRIGATION',
        name: 'Sulama',
        department: 'PARKS_AND_GARDENS',
        priority: 'LOW',
        slaMinutes: 4320,
        keywords: ['sulama', 'fıskiye', 'kurumuş'],
      },
    ],
  },
  {
    code: 'CLEANING',
    name: 'Temizlik',
    department: 'CLEANING_SERVICES',
    priority: 'NORMAL',
    slaMinutes: 1440,
    icon: 'trash-2',
    children: [
      {
        code: 'CLEANING_GARBAGE',
        name: 'Çöp',
        department: 'CLEANING_SERVICES',
        priority: 'NORMAL',
        slaMinutes: 720,
        keywords: ['çöp', 'koku', 'toplanmamış'],
      },
      {
        code: 'CLEANING_CONTAINER',
        name: 'Konteyner',
        department: 'CLEANING_SERVICES',
        priority: 'NORMAL',
        slaMinutes: 1440,
        keywords: ['konteyner', 'kova', 'taşmış'],
      },
      {
        code: 'CLEANING_DEBRIS',
        name: 'Moloz',
        department: 'CLEANING_SERVICES',
        priority: 'LOW',
        slaMinutes: 2880,
        keywords: ['moloz', 'hafriyat', 'inşaat atığı'],
      },
    ],
  },
  {
    code: 'ENFORCEMENT',
    name: 'Zabıta',
    department: 'MUNICIPAL_POLICE',
    priority: 'NORMAL',
    slaMinutes: 1440,
    icon: 'shield',
    children: [
      {
        code: 'ENFORCEMENT_OCCUPATION',
        name: 'İşgal',
        department: 'MUNICIPAL_POLICE',
        priority: 'NORMAL',
        slaMinutes: 1440,
        keywords: ['işgal', 'kaldırım işgali', 'tezgah'],
      },
      {
        code: 'ENFORCEMENT_NOISE',
        name: 'Gürültü',
        department: 'MUNICIPAL_POLICE',
        priority: 'HIGH',
        slaMinutes: 240,
        keywords: ['gürültü', 'ses', 'müzik'],
      },
      {
        code: 'ENFORCEMENT_POSTER',
        name: 'İzinsiz Afiş',
        department: 'MUNICIPAL_POLICE',
        priority: 'LOW',
        slaMinutes: 2880,
        keywords: ['afiş', 'ilan', 'pankart'],
      },
    ],
  },
  {
    code: 'SOCIAL',
    name: 'Sosyal Destek',
    department: 'SOCIAL_SERVICES',
    priority: 'NORMAL',
    slaMinutes: 4320,
    icon: 'hand-heart',
    children: [
      {
        code: 'SOCIAL_ASSISTANCE',
        name: 'Sosyal Yardım Başvurusu',
        department: 'SOCIAL_SERVICES',
        priority: 'NORMAL',
        slaMinutes: 4320,
        keywords: ['yardım', 'destek', 'ihtiyaç'],
      },
    ],
  },
];

/** Closed GeoJSON ring of an axis-aligned rectangle, [lng, lat]. */
function rect(west: number, south: number, east: number, north: number): number[][] {
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
}

/**
 * DEMO GEOMETRY – NOT OFFICIAL BOUNDARIES. Real neighbourhood names, but the shapes are
 * simple, separated rectangles near Şahinbey centre so that maps, point-in-polygon
 * lookup and MahallePulse can be demonstrated. Replace them through the GeoJSON import
 * (POST /api/v1/neighborhoods/import) once official data is available.
 * The demo request location of docs/DEMO_SCENARIO.md (37.0585 N, 37.3710 E) is in Karataş.
 */
export const DEMO_NEIGHBORHOODS = [
  {
    code: 'KARATAS',
    name: 'Karataş',
    geometry: { type: 'Polygon', coordinates: [rect(37.36, 37.05, 37.372, 37.062)] },
  },
  {
    code: 'AKKENT',
    name: 'Akkent',
    geometry: { type: 'Polygon', coordinates: [rect(37.374, 37.05, 37.386, 37.062)] },
  },
  {
    code: 'GUNEYKENT',
    name: 'Güneykent',
    geometry: { type: 'Polygon', coordinates: [rect(37.388, 37.05, 37.4, 37.062)] },
  },
  {
    code: 'DUMLUPINAR',
    name: 'Dumlupınar',
    geometry: { type: 'Polygon', coordinates: [rect(37.36, 37.064, 37.372, 37.076)] },
  },
  {
    // Two parts – exercises MultiPolygon end to end.
    code: 'BINEVLER',
    name: 'Binevler',
    geometry: {
      type: 'MultiPolygon',
      coordinates: [[rect(37.374, 37.064, 37.386, 37.076)], [rect(37.388, 37.064, 37.394, 37.07)]],
    },
  },
] as const;

export async function seedMunicipalityDomain(
  prisma: PrismaClient,
  municipalityId: string,
): Promise<{ departments: number; categories: number; neighborhoods: number }> {
  const created = { departments: 0, categories: 0, neighborhoods: 0 };

  const departmentIds = new Map<string, string>();
  for (const department of DEMO_DEPARTMENTS) {
    const existing = await prisma.department.findUnique({
      where: { municipalityId_code: { municipalityId, code: department.code } },
      select: { id: true },
    });
    const row =
      existing ??
      (await prisma.department.create({
        data: { municipalityId, ...department },
        select: { id: true },
      }));
    if (!existing) created.departments += 1;
    departmentIds.set(department.code, row.id);
  }

  const ensureCategory = async (
    category: DemoCategory,
    parentId: string | null,
    sortOrder: number,
  ): Promise<string> => {
    const existing = await prisma.requestCategory.findUnique({
      where: { municipalityId_code: { municipalityId, code: category.code } },
      select: { id: true },
    });
    if (existing) return existing.id;
    created.categories += 1;
    const row = await prisma.requestCategory.create({
      data: {
        municipalityId,
        parentId,
        departmentId: departmentIds.get(category.department)!,
        code: category.code,
        name: category.name,
        icon: category.icon ?? null,
        defaultPriority: category.priority,
        defaultSlaMinutes: category.slaMinutes,
        keywords: category.keywords ?? [],
        sortOrder,
      },
      select: { id: true },
    });
    return row.id;
  };
  for (const [i, root] of DEMO_CATEGORY_TREE.entries()) {
    const rootId = await ensureCategory(root, null, (i + 1) * 10);
    for (const [j, child] of root.children.entries()) {
      await ensureCategory(child, rootId, (j + 1) * 10);
    }
  }

  for (const neighborhood of DEMO_NEIGHBORHOODS) {
    const existing = await prisma.neighborhood.findUnique({
      where: { municipalityId_code: { municipalityId, code: neighborhood.code } },
      select: { id: true },
    });
    if (existing) continue;
    created.neighborhoods += 1;
    const geometry = JSON.stringify(neighborhood.geometry);
    await prisma.$transaction(async (tx) => {
      const { id } = await tx.neighborhood.create({
        data: {
          municipalityId,
          code: neighborhood.code,
          name: neighborhood.name,
          district: 'Şahinbey',
        },
        select: { id: true },
      });
      await tx.$executeRaw`
        UPDATE neighborhoods
        SET boundary = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${geometry}::text), 4326))
        WHERE id = ${id}::uuid`;
    });
  }

  // Demo staff belong to Fen İşleri (docs/DEMO_SCENARIO.md); only empty values are filled.
  await prisma.user.updateMany({
    where: {
      municipalityId,
      departmentId: null,
      email: { in: ['manager@kent360.local', 'leader@kent360.local', 'field@kent360.local'] },
    },
    data: { departmentId: departmentIds.get('PUBLIC_WORKS')! },
  });

  return created;
}
