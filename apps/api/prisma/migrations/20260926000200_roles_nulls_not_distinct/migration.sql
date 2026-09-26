-- ─────────────────────────────────────────────────────────────────────────────
-- System roles have municipality_id = NULL. PostgreSQL's default NULLS DISTINCT
-- semantics let the (municipality_id, code) unique index accept any number of
-- (NULL, 'SYSTEM_ADMIN') rows. NULLS NOT DISTINCT (PostgreSQL 15+) makes NULL
-- compare equal for this index only, so:
--   • a system role code exists at most once;
--   • municipality-specific roles may still reuse the same code across
--     different municipalities (non-NULL values behave as before).
-- The index keeps its Prisma name, so schema.prisma's @@unique stays in sync.
-- ─────────────────────────────────────────────────────────────────────────────

-- Fail loudly (instead of with an opaque index error) if duplicates already exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "roles" WHERE "municipality_id" IS NULL
    GROUP BY "code" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate system roles found; merge them before applying this migration.';
  END IF;
END $$;

DROP INDEX "roles_municipality_id_code_key";

CREATE UNIQUE INDEX "roles_municipality_id_code_key"
  ON "roles" ("municipality_id", "code") NULLS NOT DISTINCT;
