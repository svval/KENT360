/**
 * Phase 6 demo field operations – DEMO DATA.
 *
 *   • 5 field teams (Fen İşleri – Ekip 1/2, Park ve Bahçeler – Merkez Ekip, Temizlik –
 *     Ekip 1, Zabıta – Merkez Ekip) and their demo field staff (password: Kent360!Demo);
 *   • 45 work orders on the Phase 5 demo requests: 28 historic ones (VERIFIED, on requests
 *     that were already closed) and 17 open ones spread over CREATED … COMPLETED, so every
 *     screen has something to show. Requests move with them exactly as the API would move
 *     them (WORK_ORDER_CREATED / IN_PROGRESS / RESOLVED), with citizen-facing entries;
 *   • BEFORE / AFTER evidence photos, drawn programmatically (no downloaded images) and
 *     passed through the same normalizeImage() as real uploads.
 *
 * Deterministic (fixed order and seed) and idempotent: teams and users are created only
 * when missing; the work order set is created once per municipality (`demoSeed` marker
 * in the work order timeline) – later runs do nothing.
 */
import { randomUUID } from 'node:crypto';
import { formatPublicNumber, yearInTimeZone } from '../src/common/utils/public-number';
import { type PrismaClient } from '../src/generated/prisma/client';
import { type WorkOrderEventType } from '../src/generated/prisma/enums';
import { normalizeImage } from '../src/modules/storage/image-normalizer';
import sharp from 'sharp';
import { DEMO_PASSWORD } from './seed-data';

const SEED_MARKER = 'phase6-v1';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export type PutObject = (key: string, body: Buffer, contentType: string) => Promise<void>;

type Status =
  | 'CREATED'
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'EN_ROUTE'
  | 'ON_SITE'
  | 'IN_PROGRESS'
  | 'WAITING'
  | 'COMPLETED'
  | 'VERIFIED';

/** Demo field staff (development only – same public demo password as the other accounts). */
export const FIELD_DEMO_USERS = [
  {
    email: 'mehmet.yilmaz@kent360.local',
    firstName: 'Mehmet',
    lastName: 'Yılmaz',
    department: 'PUBLIC_WORKS',
  },
  {
    email: 'hasan.celik@kent360.local',
    firstName: 'Hasan',
    lastName: 'Çelik',
    department: 'PUBLIC_WORKS',
  },
  {
    email: 'ayse.koc@kent360.local',
    firstName: 'Ayşe',
    lastName: 'Koç',
    department: 'PARKS_AND_GARDENS',
  },
  {
    email: 'emre.aydin@kent360.local',
    firstName: 'Emre',
    lastName: 'Aydın',
    department: 'PARKS_AND_GARDENS',
  },
  {
    email: 'fatma.ozturk@kent360.local',
    firstName: 'Fatma',
    lastName: 'Öztürk',
    department: 'CLEANING_SERVICES',
  },
  {
    email: 'burak.kurt@kent360.local',
    firstName: 'Burak',
    lastName: 'Kurt',
    department: 'MUNICIPAL_POLICE',
  },
] as const;

/** Teams: code, name, department, members (first = team leader). */
export const DEMO_TEAMS = [
  {
    code: 'PW_TEAM_1',
    name: 'Fen İşleri – Ekip 1',
    department: 'PUBLIC_WORKS',
    members: ['leader@kent360.local', 'field@kent360.local'],
  },
  {
    code: 'PW_TEAM_2',
    name: 'Fen İşleri – Ekip 2',
    department: 'PUBLIC_WORKS',
    members: ['mehmet.yilmaz@kent360.local', 'hasan.celik@kent360.local'],
  },
  {
    code: 'PARKS_CENTRAL',
    name: 'Park ve Bahçeler – Merkez Ekip',
    department: 'PARKS_AND_GARDENS',
    members: ['ayse.koc@kent360.local', 'emre.aydin@kent360.local'],
  },
  {
    code: 'CLEANING_TEAM_1',
    name: 'Temizlik – Ekip 1',
    department: 'CLEANING_SERVICES',
    members: ['fatma.ozturk@kent360.local'],
  },
  {
    code: 'POLICE_CENTRAL',
    name: 'Zabıta – Merkez Ekip',
    department: 'MUNICIPAL_POLICE',
    members: ['burak.kurt@kent360.local'],
  },
] as const;

/**
 * Open work orders per department, in request-number order. `team`/`person` pick the
 * assignee (index into DEMO_TEAMS[].members); `from` adds an earlier assignment.
 */
const OPEN_PLAN: Record<
  string,
  { status: Status; member?: number; team?: string; from?: [string, number] }[]
> = {
  PUBLIC_WORKS: [
    { status: 'CREATED' },
    { status: 'ASSIGNED', team: 'PW_TEAM_1', member: 1 },
    { status: 'ACCEPTED', team: 'PW_TEAM_2', member: 0, from: ['PW_TEAM_1', 1] },
    { status: 'EN_ROUTE', team: 'PW_TEAM_1', member: 1 },
    { status: 'IN_PROGRESS', team: 'PW_TEAM_1', member: 1 },
    { status: 'COMPLETED', team: 'PW_TEAM_1', member: 1 },
  ],
  CLEANING_SERVICES: [
    { status: 'CREATED' },
    { status: 'ASSIGNED', team: 'CLEANING_TEAM_1', member: 0 },
    { status: 'ACCEPTED', team: 'CLEANING_TEAM_1', member: 0 },
    { status: 'ON_SITE', team: 'CLEANING_TEAM_1', member: 0 },
    { status: 'IN_PROGRESS', team: 'CLEANING_TEAM_1', member: 0 },
    { status: 'WAITING', team: 'CLEANING_TEAM_1', member: 0 },
    { status: 'COMPLETED', team: 'CLEANING_TEAM_1', member: 0 },
  ],
  PARKS_AND_GARDENS: [
    { status: 'ON_SITE', team: 'PARKS_CENTRAL', member: 1 },
    { status: 'WAITING', team: 'PARKS_CENTRAL', member: 0 },
  ],
  MUNICIPAL_POLICE: [
    { status: 'ASSIGNED', team: 'POLICE_CENTRAL', member: 0 },
    { status: 'IN_PROGRESS', team: 'POLICE_CENTRAL', member: 0 },
  ],
};
const HISTORIC_COUNT = 28;

const STEPS: Status[] = ['CREATED', 'ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE', 'IN_PROGRESS'];
const LABEL: Record<Status, string> = {
  CREATED: 'Oluşturuldu',
  ASSIGNED: 'Atandı',
  ACCEPTED: 'Kabul Edildi',
  EN_ROUTE: 'Yolda',
  ON_SITE: 'Sahada',
  IN_PROGRESS: 'Çalışılıyor',
  WAITING: 'Beklemede',
  COMPLETED: 'Tamamlandı',
  VERIFIED: 'Doğrulandı',
};
const STEP_EVENT: Partial<Record<Status, 'ACCEPTED' | 'EN_ROUTE' | 'ON_SITE' | 'STARTED'>> = {
  ACCEPTED: 'ACCEPTED',
  EN_ROUTE: 'EN_ROUTE',
  ON_SITE: 'ON_SITE',
  IN_PROGRESS: 'STARTED',
};
const STEP_STAMP: Partial<Record<Status, 'acceptedAt' | 'enRouteAt' | 'arrivedAt' | 'startedAt'>> =
  {
    ACCEPTED: 'acceptedAt',
    EN_ROUTE: 'enRouteAt',
    ON_SITE: 'arrivedAt',
    IN_PROGRESS: 'startedAt',
  };
const COMPLETION_TEXTS: Record<string, string> = {
  PUBLIC_WORKS: 'Hasarlı bölüm kesilip sıcak asfaltla kapatıldı, yüzey silindirle sıkıştırıldı.',
  PARKS_AND_GARDENS: 'Arızalı parça değiştirildi, alan güvenli hale getirildi.',
  CLEANING_SERVICES: 'Atıklar toplandı, konteyner yerine yenisi konuldu ve alan yıkandı.',
  MUNICIPAL_POLICE: 'Yerinde denetim yapıldı, işgal kaldırıldı ve tutanak düzenlendi.',
};

/** Simple drawn evidence photos (no text, no downloaded content). */
async function demoPhotos(): Promise<{ before: Buffer; after: Buffer }> {
  const svg = (body: string) =>
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">${body}</svg>`);
  const ground =
    '<rect width="800" height="600" fill="#6b7280"/>' +
    '<rect y="0" width="800" height="170" fill="#bfdbfe"/>' +
    '<rect x="0" y="560" width="800" height="40" fill="#9ca3af"/>' +
    '<rect x="380" y="300" width="40" height="120" fill="#f9fafb" opacity="0.7"/>';
  const before = svg(
    ground +
      '<ellipse cx="420" cy="420" rx="170" ry="70" fill="#1f2937"/>' +
      '<ellipse cx="410" cy="410" rx="110" ry="40" fill="#111827"/>' +
      '<polygon points="170,470 205,360 240,470" fill="#f97316"/>' +
      '<rect x="182" y="405" width="46" height="14" fill="#f9fafb"/>',
  );
  const after = svg(
    ground + '<rect x="240" y="350" width="360" height="140" rx="12" fill="#374151"/>',
  );
  const toJpeg = async (input: Buffer) =>
    (await normalizeImage(await sharp(input).jpeg({ quality: 82 }).toBuffer(), 'image/jpeg'))
      .buffer;
  return { before: await toJpeg(before), after: await toJpeg(after) };
}

export async function seedDemoWorkOrders(
  prisma: PrismaClient,
  municipalityId: string,
  hashPassword: (password: string) => Promise<string>,
  putObject: PutObject,
): Promise<{ teams: number; users: number; workOrders: number }> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo field staff must never be created with NODE_ENV=production.');
  }
  const created = { teams: 0, users: 0, workOrders: 0 };
  const departments = new Map(
    (
      await prisma.department.findMany({
        where: { municipalityId },
        select: { id: true, code: true },
      })
    ).map((d) => [d.code, d.id]),
  );
  if (!departments.has('PUBLIC_WORKS')) return created;

  // 1) Demo field staff ------------------------------------------------------------
  const fieldRole = await prisma.role.findFirstOrThrow({
    where: { municipalityId: null, code: 'FIELD_STAFF' },
  });
  let hash: string | undefined;
  for (const demo of FIELD_DEMO_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: demo.email } });
    if (existing) continue;
    hash ??= await hashPassword(DEMO_PASSWORD);
    await prisma.user.create({
      data: {
        municipalityId,
        departmentId: departments.get(demo.department)!,
        email: demo.email,
        firstName: demo.firstName,
        lastName: demo.lastName,
        passwordHash: hash,
        roles: { create: [{ roleId: fieldRole.id }] },
      },
    });
    created.users += 1;
  }
  const emails = [...new Set(DEMO_TEAMS.flatMap((team) => team.members))];
  const userIds = new Map(
    (
      await prisma.user.findMany({
        where: {
          municipalityId,
          email: { in: [...emails, 'manager@kent360.local', 'admin@kent360.local'] },
        },
        select: { id: true, email: true, firstName: true, lastName: true },
      })
    ).map((u) => [u.email, u]),
  );

  // 2) Teams and memberships -------------------------------------------------------------
  const teams = new Map<string, { id: string; name: string; members: string[] }>();
  for (const demo of DEMO_TEAMS) {
    const members = demo.members.map((email) => userIds.get(email)?.id).filter(Boolean) as string[];
    let team = await prisma.fieldTeam.findUnique({
      where: { municipalityId_code: { municipalityId, code: demo.code } },
      select: { id: true },
    });
    if (!team) {
      team = await prisma.fieldTeam.create({
        data: {
          municipalityId,
          departmentId: departments.get(demo.department)!,
          code: demo.code,
          name: demo.name,
          leaderId: members[0] ?? null,
        },
        select: { id: true },
      });
      await prisma.fieldTeamMember.createMany({
        data: members.map((userId, index) => ({
          teamId: team!.id,
          userId,
          role: index === 0 ? 'LEADER' : 'MEMBER',
        })),
        skipDuplicates: true,
      });
      created.teams += 1;
    }
    teams.set(demo.code, { id: team.id, name: demo.name, members });
  }

  // 3) Work orders (once) ---------------------------------------------------------------
  const already = await prisma.workOrderHistory.findFirst({
    where: {
      workOrder: { municipalityId },
      metadata: { path: ['demoSeed'], equals: SEED_MARKER },
    },
    select: { id: true },
  });
  if (already) return created;

  const municipality = await prisma.municipality.findUniqueOrThrow({
    where: { id: municipalityId },
    select: { timezone: true },
  });
  const manager = userIds.get('manager@kent360.local');
  const admin = userIds.get('admin@kent360.local');
  const requestSelect = {
    id: true,
    publicNumber: true,
    title: true,
    status: true,
    priority: true,
    latitude: true,
    longitude: true,
    address: true,
    slaDueAt: true,
    createdAt: true,
    resolvedAt: true,
    closedAt: true,
    departmentId: true,
    department: { select: { code: true } },
    workOrders: { select: { id: true } },
  } as const;
  const candidates = await prisma.request.findMany({
    where: {
      municipalityId,
      department: { code: { in: Object.keys(OPEN_PLAN) } },
      description: { endsWith: '(Demo kaydı)' },
    },
    select: requestSelect,
    orderBy: { publicNumber: 'asc' },
  });
  const free = candidates.filter((r) => r.workOrders.length === 0);

  type Planned = {
    request: (typeof free)[number];
    status: Status;
    team?: string;
    member?: number;
    from?: [string, number];
    historic: boolean;
    start: Date;
    end: Date;
  };
  const plans: Planned[] = [];
  const now = Date.now();
  // Open work orders: department queues, oldest routed requests first. Fen İşleri also
  // takes requests still under review (they are routed first, as a manager would do).
  for (const [department, items] of Object.entries(OPEN_PLAN)) {
    const pool = free.filter(
      (r) =>
        r.department?.code === department &&
        (r.status === 'ASSIGNED_TO_DEPARTMENT' ||
          (department === 'PUBLIC_WORKS' && r.status === 'UNDER_REVIEW')),
    );
    items.forEach((item, index) => {
      const request = pool[index];
      if (!request) return;
      const steps = item.status === 'CREATED' ? 1 : STEPS.indexOf(item.status as Status) + 3;
      const end = new Date(now - (20 + index * 7) * MINUTE);
      const earliest = request.createdAt.getTime() + 30 * MINUTE;
      const start = new Date(Math.max(earliest, end.getTime() - steps * 40 * MINUTE));
      plans.push({ request, ...item, historic: false, start, end });
    });
  }
  // Historic work orders: the most recently resolved closed requests, all teams.
  const closed = free
    .filter((r) => r.status === 'CLOSED' && r.resolvedAt && r.closedAt)
    .sort((x, y) => y.resolvedAt!.getTime() - x.resolvedAt!.getTime())
    .slice(0, HISTORIC_COUNT);
  closed.forEach((request, index) => {
    const department = request.department!.code;
    const team =
      DEMO_TEAMS.filter((t) => t.department === department)[index % 2] ??
      DEMO_TEAMS.find((t) => t.department === department)!;
    const span = request.resolvedAt!.getTime() - request.createdAt.getTime();
    plans.push({
      request,
      status: 'VERIFIED',
      team: team.code,
      member: team.members.length > 1 ? index % team.members.length : 0,
      historic: true,
      start: new Date(request.createdAt.getTime() + span * 0.3),
      end: request.resolvedAt!,
    });
  });
  plans.sort((x, y) => x.start.getTime() - y.start.getTime()); // numbers follow time

  const photos = await demoPhotos();
  for (const plan of plans) {
    const { request, status } = plan;
    const department = request.department!.code;
    const team = plan.team ? teams.get(plan.team) : undefined;
    const assigneeId = team && plan.member !== undefined ? team.members[plan.member] : undefined;
    const assignee = [...userIds.values()].find((u) => u.id === assigneeId);
    const creatorId = department === 'PUBLIC_WORKS' ? manager?.id : admin?.id;
    const verifierId = creatorId;

    // Timeline: evenly spread between start and end.
    const flow: Status[] =
      status === 'CREATED'
        ? ['CREATED']
        : status === 'WAITING'
          ? [...STEPS, 'WAITING']
          : status === 'COMPLETED' || status === 'VERIFIED'
            ? [...STEPS, 'COMPLETED']
            : STEPS.slice(0, STEPS.indexOf(status) + 1);
    const slots = flow.length + (plan.from ? 1 : 0);
    const gap = (plan.end.getTime() - plan.start.getTime()) / Math.max(1, slots);
    const at = (i: number) => new Date(plan.start.getTime() + gap * i);
    const workingStatus: Status =
      status === 'COMPLETED' || status === 'VERIFIED' ? 'IN_PROGRESS' : status;
    const needsPhotos = ['IN_PROGRESS', 'WAITING', 'COMPLETED', 'VERIFIED'].includes(status);

    await prisma.$transaction(async (tx) => {
      // Fen İşleri requests still under review are routed first (as the manager would).
      if (request.status === 'UNDER_REVIEW') {
        await tx.request.update({
          where: { id: request.id },
          data: { status: 'ASSIGNED_TO_DEPARTMENT' },
        });
        await tx.requestHistory.create({
          data: {
            requestId: request.id,
            eventType: 'STATUS_CHANGED',
            oldStatus: 'UNDER_REVIEW',
            newStatus: 'ASSIGNED_TO_DEPARTMENT',
            description: 'Durum: İncelemede → Müdürlüğe Atandı',
            performedById: manager?.id ?? null,
            metadata: { demoSeed: SEED_MARKER },
            createdAt: new Date(plan.start.getTime() - 10 * MINUTE),
          },
        });
      }
      const year = yearInTimeZone(plan.start, municipality.timezone);
      const [row] = await tx.$queryRaw<{ value: number }[]>`
        INSERT INTO number_sequences (municipality_id, scope, year, last_value, updated_at)
        VALUES (${municipalityId}::uuid, 'WORK_ORDER'::"SequenceScope", ${year}::int, 1, now())
        ON CONFLICT (municipality_id, scope, year)
        DO UPDATE SET last_value = number_sequences.last_value + 1, updated_at = now()
        RETURNING last_value AS value`;
      const publicNumber = formatPublicNumber('WORK_ORDER', year, Number(row.value));
      const stamps: Record<string, Date> = {};
      flow.forEach((step, i) => {
        const stamp = STEP_STAMP[step];
        if (stamp) stamps[stamp] = at(i + (plan.from ? 1 : 0));
      });
      const workOrder = await tx.workOrder.create({
        data: {
          municipalityId,
          publicNumber,
          requestId: request.id,
          departmentId: request.departmentId!,
          fieldTeamId: team?.id ?? null,
          assignedUserId: assigneeId ?? null,
          createdById: creatorId ?? null,
          title: request.title,
          description: status === 'CREATED' ? 'Ekip ataması bekleniyor.' : null,
          priority: request.priority,
          status: workingStatus,
          latitude: request.latitude,
          longitude: request.longitude,
          address: request.address,
          slaDueAt: request.slaDueAt,
          createdAt: plan.start,
          ...stamps,
        },
        select: { id: true },
      });

      // Internal timeline
      const history: {
        eventType: WorkOrderEventType;
        oldStatus?: Status;
        newStatus?: Status;
        description: string;
        createdAt: Date;
        performedById?: string | null;
      }[] = [
        {
          eventType: 'CREATED',
          newStatus: 'CREATED',
          description: `İş emri oluşturuldu (${publicNumber}) – kaynak talep ${request.publicNumber}.`,
          createdAt: plan.start,
          performedById: creatorId,
        },
      ];
      let index = 1;
      if (plan.from) {
        const previous = teams.get(plan.from[0])!;
        const previousUser = [...userIds.values()].find(
          (u) => u.id === previous.members[plan.from![1]],
        );
        await tx.workOrderAssignment.create({
          data: {
            workOrderId: workOrder.id,
            fieldTeamId: previous.id,
            assigneeId: previousUser?.id ?? null,
            assignedById: creatorId ?? null,
            assignedAt: at(1),
            unassignedAt: at(2),
          },
        });
        history.push({
          eventType: 'ASSIGNED',
          oldStatus: 'CREATED',
          newStatus: 'ASSIGNED',
          description: `Atandı: ${previous.name} / ${previousUser?.firstName} ${previousUser?.lastName}.`,
          createdAt: at(1),
          performedById: creatorId,
        });
        index = 2;
      }
      if (team) {
        await tx.workOrderAssignment.create({
          data: {
            workOrderId: workOrder.id,
            fieldTeamId: team.id,
            assigneeId: assigneeId ?? null,
            assignedById: creatorId ?? null,
            assignedAt: at(index),
          },
        });
        const who = [team.name, assignee && `${assignee.firstName} ${assignee.lastName}`]
          .filter(Boolean)
          .join(' / ');
        history.push({
          eventType: plan.from ? 'REASSIGNED' : 'ASSIGNED',
          oldStatus: plan.from ? undefined : 'CREATED',
          newStatus: plan.from ? undefined : 'ASSIGNED',
          description: `${plan.from ? 'Yeniden atandı' : 'Atandı'}: ${who}.`,
          createdAt: at(index),
          performedById: creatorId,
        });
      }
      flow.slice(2).forEach((step, i) => {
        const previous = flow[i + 1];
        const event =
          step === 'WAITING' ? 'WAITING' : step === 'COMPLETED' ? 'COMPLETED' : STEP_EVENT[step]!;
        history.push({
          eventType: event,
          oldStatus: previous,
          newStatus: step,
          description:
            `Durum: ${LABEL[previous]} → ${LABEL[step]}` +
            (step === 'WAITING' ? ' – Gerekçe: Malzeme bekleniyor (demo).' : '') +
            (step === 'ON_SITE' || step === 'IN_PROGRESS' ? ' – Konum doğrulandı (demo).' : ''),
          createdAt: at(i + 2 + (plan.from ? 1 : 0)),
          performedById: assigneeId,
        });
      });

      // Evidence photos (inserted while the work is still open – the DB refuses later).
      if (needsPhotos) {
        const types: ('BEFORE' | 'AFTER')[] =
          status === 'COMPLETED' || status === 'VERIFIED' ? ['BEFORE', 'AFTER'] : ['BEFORE'];
        for (const type of types) {
          const key = `municipalities/${municipalityId}/work-orders/${workOrder.id}/${type.toLowerCase()}/${randomUUID()}.jpg`;
          const body = type === 'BEFORE' ? photos.before : photos.after;
          await putObject(key, body, 'image/jpeg');
          const takenAt =
            type === 'BEFORE' ? at(flow.indexOf('IN_PROGRESS') + (plan.from ? 1 : 0)) : plan.end;
          await tx.workOrderMedia.create({
            data: {
              workOrderId: workOrder.id,
              type,
              storageKey: key,
              mimeType: 'image/jpeg',
              sizeBytes: body.length,
              uploadedById: assigneeId ?? null,
              createdAt: takenAt,
            },
          });
          history.push({
            eventType: 'MEDIA_ADDED',
            description: `Fotoğraf eklendi (${type === 'BEFORE' ? 'Önce' : 'Sonra'}).`,
            createdAt: takenAt,
            performedById: assigneeId,
          });
        }
      }
      if (status === 'COMPLETED' || status === 'VERIFIED') {
        const verifiedAt = new Date(plan.end.getTime() + 2 * HOUR);
        await tx.workOrder.update({
          where: { id: workOrder.id },
          data: {
            status,
            completedAt: plan.end,
            completionDescription: `${COMPLETION_TEXTS[department] ?? 'İş tamamlandı.'} (Demo kaydı)`,
            ...(status === 'VERIFIED' && { verifiedAt }),
          },
        });
        if (status === 'VERIFIED') {
          history.push({
            eventType: 'VERIFIED',
            oldStatus: 'COMPLETED',
            newStatus: 'VERIFIED',
            description: 'Durum: Tamamlandı → Doğrulandı',
            createdAt: verifiedAt,
            performedById: verifierId,
          });
        }
      }
      await tx.workOrderHistory.createMany({
        data: history.map((event) => ({
          workOrderId: workOrder.id,
          eventType: event.eventType,
          oldStatus: event.oldStatus ?? null,
          newStatus: event.newStatus ?? null,
          description: event.description,
          performedById: event.performedById ?? null,
          createdAt: event.createdAt,
          metadata: { demoSeed: SEED_MARKER },
        })),
      });

      // The request follows its work order (requests/domain/work-order-sync.ts).
      const requestEvents: {
        eventType: 'WORK_ORDER_CREATED' | 'STATUS_CHANGED';
        oldStatus: 'ASSIGNED_TO_DEPARTMENT' | 'WORK_ORDER_CREATED' | 'IN_PROGRESS';
        newStatus: 'WORK_ORDER_CREATED' | 'IN_PROGRESS' | 'RESOLVED';
        description: string;
        createdAt: Date;
      }[] = [
        {
          eventType: 'WORK_ORDER_CREATED',
          oldStatus: 'ASSIGNED_TO_DEPARTMENT',
          newStatus: 'WORK_ORDER_CREATED',
          description: 'Talebiniz için saha iş emri oluşturuldu.',
          createdAt: plan.start,
        },
      ];
      const started = stamps.startedAt;
      if (!plan.historic && started) {
        requestEvents.push({
          eventType: 'STATUS_CHANGED',
          oldStatus: 'WORK_ORDER_CREATED',
          newStatus: 'IN_PROGRESS',
          description: 'Saha ekibi çalışmaya başladı.',
          createdAt: started,
        });
        if (status === 'COMPLETED') {
          requestEvents.push({
            eventType: 'STATUS_CHANGED',
            oldStatus: 'IN_PROGRESS',
            newStatus: 'RESOLVED',
            description: 'Saha çalışması tamamlandı, sorun giderildi.',
            createdAt: plan.end,
          });
        }
      }
      await tx.requestHistory.createMany({
        data: requestEvents.map((event) => ({
          requestId: request.id,
          ...event,
          metadata: { demoSeed: SEED_MARKER, workOrderNumber: publicNumber },
        })),
      });
      if (!plan.historic) {
        const requestStatus =
          status === 'COMPLETED' ? 'RESOLVED' : started ? 'IN_PROGRESS' : 'WORK_ORDER_CREATED';
        await tx.request.update({
          where: { id: request.id },
          data: {
            status: requestStatus,
            ...(requestStatus === 'RESOLVED' && { resolvedAt: plan.end }),
          },
        });
      }
    });
    created.workOrders += 1;
  }
  return created;
}
