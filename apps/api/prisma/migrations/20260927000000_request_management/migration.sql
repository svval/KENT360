-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 5 – request management.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) SLA snapshot -------------------------------------------------------------
-- slaDueAt already exists. slaAtRiskAt freezes the AT_RISK threshold at creation so
-- that changing a category SLA or the municipality ratio never rewrites history, and
-- so that "AT_RISK" filters are plain timestamp comparisons.
ALTER TABLE "requests" ADD COLUMN "sla_at_risk_at" TIMESTAMPTZ(3);

ALTER TABLE "requests"
  ADD CONSTRAINT requests_sla_window
    CHECK (sla_due_at IS NULL
           OR (sla_at_risk_at IS NOT NULL AND sla_at_risk_at <= sla_due_at AND sla_due_at > created_at));

-- 2) List indexes (default order: newest first) ---------------------------------
-- Whole municipality (admin) and department-scoped staff views; other filters are
-- served by the existing single-column indexes and the trigram indexes (search).
CREATE INDEX "requests_municipality_id_created_at_idx"
  ON "requests"("municipality_id", "created_at" DESC);

CREATE INDEX "requests_municipality_id_department_id_created_at_idx"
  ON "requests"("municipality_id", "department_id", "created_at" DESC);

-- 3) Same-tenant references -------------------------------------------------------
-- Category, department and neighbourhood of a request must belong to its municipality.
-- The service resolves all three through the tenant-scoped client; this is the backstop.
CREATE OR REPLACE FUNCTION kent360_request_tenant_check() RETURNS trigger AS $$
BEGIN
  IF NEW.category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM request_categories c WHERE c.id = NEW.category_id AND c.municipality_id = NEW.municipality_id
  ) THEN
    RAISE EXCEPTION 'requests: category % belongs to another municipality', NEW.category_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.department_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM departments d WHERE d.id = NEW.department_id AND d.municipality_id = NEW.municipality_id
  ) THEN
    RAISE EXCEPTION 'requests: department % belongs to another municipality', NEW.department_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.neighborhood_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM neighborhoods n WHERE n.id = NEW.neighborhood_id AND n.municipality_id = NEW.municipality_id
  ) THEN
    RAISE EXCEPTION 'requests: neighbourhood % belongs to another municipality', NEW.neighborhood_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER requests_tenant_check
  BEFORE INSERT OR UPDATE OF category_id, department_id, neighborhood_id, municipality_id ON "requests"
  FOR EACH ROW EXECUTE FUNCTION kent360_request_tenant_check();

-- 4) Immutable snapshots ------------------------------------------------------------
-- The public number, creation time, reporter and SLA snapshot never change after insert.
CREATE OR REPLACE FUNCTION kent360_request_immutable_fields() RETURNS trigger AS $$
BEGIN
  IF NEW.public_number IS DISTINCT FROM OLD.public_number
     OR NEW.municipality_id IS DISTINCT FROM OLD.municipality_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.sla_due_at IS DISTINCT FROM OLD.sla_due_at
     OR NEW.sla_at_risk_at IS DISTINCT FROM OLD.sla_at_risk_at
     OR (OLD.created_by_id IS NOT NULL AND NEW.created_by_id IS DISTINCT FROM OLD.created_by_id
         AND NEW.created_by_id IS NOT NULL) THEN
    RAISE EXCEPTION 'requests: public_number, municipality, created_at, reporter and SLA snapshot are immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER requests_immutable_fields
  BEFORE UPDATE ON "requests"
  FOR EACH ROW EXECUTE FUNCTION kent360_request_immutable_fields();
