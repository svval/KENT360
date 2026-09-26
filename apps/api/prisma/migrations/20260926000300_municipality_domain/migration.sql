-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 4 – municipality domain (departments, neighbourhoods, request categories).
-- Part 1 is generated from schema.prisma; part 2 holds rules Prisma cannot express.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Schema ---------------------------------------------------------------------
-- Neighbourhoods are deactivated instead of deleted.
ALTER TABLE "neighborhoods" ADD COLUMN "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE';

-- 2) Neighbourhood geometry integrity -----------------------------------------------
-- The column type already pins MultiPolygon + SRID 4326. These checks keep invalid
-- (self-intersecting), empty or out-of-range geometries out, whatever the write path.
ALTER TABLE "neighborhoods"
  ADD CONSTRAINT neighborhoods_boundary_valid
    CHECK (boundary IS NULL OR (ST_IsValid(boundary) AND NOT ST_IsEmpty(boundary))),
  ADD CONSTRAINT neighborhoods_boundary_lonlat_range
    CHECK (boundary IS NULL OR (
      ST_XMin(boundary) >= -180 AND ST_XMax(boundary) <= 180 AND
      ST_YMin(boundary) >= -90  AND ST_YMax(boundary) <= 90));

-- 3) Machine-friendly codes -----------------------------------------------------------
ALTER TABLE "departments"
  ADD CONSTRAINT departments_code_format CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$');
ALTER TABLE "request_categories"
  ADD CONSTRAINT request_categories_code_format CHECK (code ~ '^[A-Z][A-Z0-9_]{1,59}$');
ALTER TABLE "neighborhoods"
  ADD CONSTRAINT neighborhoods_code_format CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$');

-- 4) SLA bounds: 1 minute … 365 days (canonical unit: minutes) -------------------------
ALTER TABLE "request_categories" DROP CONSTRAINT request_categories_sla_positive;
ALTER TABLE "request_categories"
  ADD CONSTRAINT request_categories_sla_range
    CHECK (default_sla_minutes IS NULL OR default_sla_minutes BETWEEN 1 AND 525600);

-- 5) Same-tenant references -------------------------------------------------------------
-- A category's parent and routing department must belong to the category's own
-- municipality, and the tree has exactly two levels (root → sub-category), which also
-- makes cycles impossible. The service layer checks the same rules and answers with
-- friendly errors; this trigger is the last line of defence.
CREATE OR REPLACE FUNCTION kent360_request_category_rules() RETURNS trigger AS $$
DECLARE
  parent_row request_categories%ROWTYPE;
BEGIN
  IF NEW.department_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM departments d
    WHERE d.id = NEW.department_id AND d.municipality_id = NEW.municipality_id
  ) THEN
    RAISE EXCEPTION 'request_categories: department % belongs to another municipality', NEW.department_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.parent_id IS NOT NULL THEN
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'request_categories: a category cannot be its own parent'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO parent_row FROM request_categories WHERE id = NEW.parent_id;
    IF NOT FOUND OR parent_row.municipality_id <> NEW.municipality_id THEN
      RAISE EXCEPTION 'request_categories: parent % belongs to another municipality', NEW.parent_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF parent_row.parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'request_categories: the category tree has two levels only'
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM request_categories c WHERE c.parent_id = NEW.id) THEN
      RAISE EXCEPTION 'request_categories: a category with sub-categories cannot become a sub-category'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER request_categories_tenant_check
  BEFORE INSERT OR UPDATE OF parent_id, department_id, municipality_id ON "request_categories"
  FOR EACH ROW EXECUTE FUNCTION kent360_request_category_rules();

-- Users may only be attached to a department of their own municipality.
CREATE OR REPLACE FUNCTION kent360_user_department_tenant() RETURNS trigger AS $$
BEGIN
  IF NEW.department_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM departments d
    WHERE d.id = NEW.department_id AND d.municipality_id = NEW.municipality_id
  ) THEN
    RAISE EXCEPTION 'users: department % belongs to another municipality', NEW.department_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_department_tenant_check
  BEFORE INSERT OR UPDATE OF department_id, municipality_id ON "users"
  FOR EACH ROW EXECUTE FUNCTION kent360_user_department_tenant();
