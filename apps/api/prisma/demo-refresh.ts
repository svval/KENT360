/**
 * `npm run demo:refresh` – DEVELOPMENT / DEMO ONLY.
 *
 * The demo data is generated relative to the moment `db:seed` ran, so after a few days
 * "today", the last 7 days (MahallePulse anomalies) and the SLA mix (at risk / breached)
 * go stale. This moves the demo municipality's operational timeline forward so that its
 * latest record is "now" again: every timestamp of requests, work orders and their
 * history / media / analyses / notifications shifts by the same amount, so durations,
 * order and SLA windows stay exactly as seeded. Nothing is deleted or re-created.
 *
 * Safety:
 *   • refuses NODE_ENV=production, a non-local database host and *_test databases;
 *   • prints the target database and the shift; changes nothing without `--yes`;
 *   • one transaction; the immutability triggers of requests / work orders / evidence photos are disabled
 *     only inside it (DDL is transactional in PostgreSQL);
 *   • audit_logs (append-only) are never touched – they keep the real history.
 *
 *   npm run demo:refresh            # dry run: shows what would change
 *   npm run demo:refresh -- --yes   # apply
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

loadEnv({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
loadEnv({ quiet: true });

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'postgres']);
const DEMO_SLUG = 'sahinbey';
const MIN_SHIFT_MS = 60 * 60_000;

function fail(message: string): never {
  console.error(`demo:refresh reddedildi – ${message}`);
  process.exit(1);
}

function describe(ms: number): string {
  const hours = Math.round(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  return days > 0 ? `${days} gün ${hours % 24} saat` : `${hours} saat`;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') fail('NODE_ENV=production.');
  const url = process.env.DATABASE_URL;
  if (!url) fail('DATABASE_URL tanımlı değil.');
  const target = new URL(url);
  const database = target.pathname.replace(/^\//, '');
  if (!LOCAL_HOSTS.has(target.hostname)) {
    fail(`yalnızca yerel geliştirme veritabanında çalışır (host: ${target.hostname}).`);
  }
  if (/_test$|test|prod/i.test(database))
    fail(`"${database}" bir demo veritabanı gibi görünmüyor.`);
  const apply = process.argv.includes('--yes');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const municipality = await prisma.municipality.findUnique({
      where: { slug: DEMO_SLUG },
      select: { id: true, name: true },
    });
    if (!municipality) fail('demo belediyesi bulunamadı – önce `npm run db:seed` çalıştırın.');
    const mid = municipality.id;
    const latest = await prisma.request.aggregate({
      where: { municipalityId: mid },
      _max: { createdAt: true },
      _count: true,
    });
    const anchor = latest._max.createdAt;
    if (!anchor) fail('demo talepleri yok – önce `npm run db:seed` çalıştırın.');
    const shiftMs = Math.floor((Date.now() - anchor.getTime()) / 60_000) * 60_000;

    console.log(`Hedef veritabanı : ${database} @ ${target.hostname}:${target.port || 5432}`);
    console.log(`Belediye         : ${municipality.name} (${latest._count} talep)`);
    console.log(`En son kayıt     : ${anchor.toISOString()}`);
    if (shiftMs < MIN_SHIFT_MS) {
      console.log('Demo verisi zaten güncel (1 saatten az geride); değişiklik yok.');
      return;
    }
    console.log(`Kaydırma         : +${describe(shiftMs)} (tüm talep / iş emri zaman damgaları)`);
    if (!apply) {
      console.log('\nKuru çalıştırma – hiçbir şey değişmedi. Uygulamak için:');
      console.log('  npm run demo:refresh -- --yes');
      return;
    }

    const secs = shiftMs / 1000;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`ALTER TABLE requests DISABLE TRIGGER requests_immutable_fields`;
      const shift = await tx.$executeRaw`
        UPDATE requests SET
          created_at = created_at + make_interval(secs => ${secs}),
          updated_at = updated_at + make_interval(secs => ${secs}),
          sla_due_at = sla_due_at + make_interval(secs => ${secs}),
          sla_at_risk_at = sla_at_risk_at + make_interval(secs => ${secs}),
          resolved_at = resolved_at + make_interval(secs => ${secs}),
          closed_at = closed_at + make_interval(secs => ${secs})
        WHERE municipality_id = ${mid}::uuid`;
      await tx.$executeRaw`ALTER TABLE requests ENABLE TRIGGER requests_immutable_fields`;
      await tx.$executeRaw`
        UPDATE request_history h SET created_at = h.created_at + make_interval(secs => ${secs})
        FROM requests r WHERE r.id = h.request_id AND r.municipality_id = ${mid}::uuid`;
      await tx.$executeRaw`
        UPDATE request_media m SET created_at = m.created_at + make_interval(secs => ${secs})
        FROM requests r WHERE r.id = m.request_id AND r.municipality_id = ${mid}::uuid`;
      await tx.$executeRaw`
        UPDATE request_followers f SET created_at = f.created_at + make_interval(secs => ${secs})
        FROM requests r WHERE r.id = f.request_id AND r.municipality_id = ${mid}::uuid`;
      await tx.$executeRaw`
        UPDATE ai_analyses a SET created_at = a.created_at + make_interval(secs => ${secs})
        FROM requests r WHERE r.id = a.request_id AND r.municipality_id = ${mid}::uuid`;
      await tx.$executeRaw`
        UPDATE duplicate_matches d SET
          created_at = d.created_at + make_interval(secs => ${secs}),
          decided_at = d.decided_at + make_interval(secs => ${secs})
        FROM requests r WHERE r.id = d.request_id AND r.municipality_id = ${mid}::uuid`;
      await tx.$executeRaw`ALTER TABLE work_orders DISABLE TRIGGER work_orders_immutable_fields`;
      await tx.$executeRaw`
        UPDATE work_orders SET
          created_at = created_at + make_interval(secs => ${secs}),
          updated_at = updated_at + make_interval(secs => ${secs}),
          sla_due_at = sla_due_at + make_interval(secs => ${secs}),
          planned_at = planned_at + make_interval(secs => ${secs}),
          accepted_at = accepted_at + make_interval(secs => ${secs}),
          en_route_at = en_route_at + make_interval(secs => ${secs}),
          arrived_at = arrived_at + make_interval(secs => ${secs}),
          started_at = started_at + make_interval(secs => ${secs}),
          completed_at = completed_at + make_interval(secs => ${secs}),
          verified_at = verified_at + make_interval(secs => ${secs}),
          cancelled_at = cancelled_at + make_interval(secs => ${secs})
        WHERE municipality_id = ${mid}::uuid`;
      await tx.$executeRaw`ALTER TABLE work_orders ENABLE TRIGGER work_orders_immutable_fields`;
      await tx.$executeRaw`
        UPDATE work_order_history h SET created_at = h.created_at + make_interval(secs => ${secs})
        FROM work_orders w WHERE w.id = h.work_order_id AND w.municipality_id = ${mid}::uuid`;
      await tx.$executeRaw`ALTER TABLE work_order_media DISABLE TRIGGER work_order_media_guard`;
      await tx.$executeRaw`
        UPDATE work_order_media m SET
          created_at = m.created_at + make_interval(secs => ${secs}),
          captured_at = m.captured_at + make_interval(secs => ${secs})
        FROM work_orders w WHERE w.id = m.work_order_id AND w.municipality_id = ${mid}::uuid`;
      await tx.$executeRaw`ALTER TABLE work_order_media ENABLE TRIGGER work_order_media_guard`;
      await tx.$executeRaw`
        UPDATE work_order_assignments a SET
          assigned_at = a.assigned_at + make_interval(secs => ${secs}),
          unassigned_at = a.unassigned_at + make_interval(secs => ${secs})
        FROM work_orders w WHERE w.id = a.work_order_id AND w.municipality_id = ${mid}::uuid`;
      await tx.$executeRaw`
        UPDATE comments c SET
          created_at = c.created_at + make_interval(secs => ${secs}),
          updated_at = c.updated_at + make_interval(secs => ${secs})
        FROM requests r WHERE r.id = c.request_id AND r.municipality_id = ${mid}::uuid`;
      await tx.$executeRaw`
        UPDATE comments c SET
          created_at = c.created_at + make_interval(secs => ${secs}),
          updated_at = c.updated_at + make_interval(secs => ${secs})
        FROM work_orders w
        WHERE c.request_id IS NULL AND w.id = c.work_order_id AND w.municipality_id = ${mid}::uuid`;
      await tx.$executeRaw`
        UPDATE notifications SET
          created_at = created_at + make_interval(secs => ${secs}),
          read_at = read_at + make_interval(secs => ${secs})
        WHERE municipality_id = ${mid}::uuid`;
      console.log(`\nTamam: ${shift} talep ve bağlı kayıtlar +${describe(shiftMs)} kaydırıldı.`);
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
