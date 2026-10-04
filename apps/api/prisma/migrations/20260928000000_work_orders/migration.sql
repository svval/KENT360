-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 6 – work orders and field operations.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Work order timeline events (ARCHITECTURE §6.2) ---------------------------
-- One event per field step, so the internal timeline reads without decoding
-- STATUS_CHANGED rows. PostgreSQL ≥ 12 allows several ADD VALUE in one migration.
ALTER TYPE "WorkOrderEventType" ADD VALUE 'ACCEPTED';
ALTER TYPE "WorkOrderEventType" ADD VALUE 'EN_ROUTE';
ALTER TYPE "WorkOrderEventType" ADD VALUE 'ON_SITE';
ALTER TYPE "WorkOrderEventType" ADD VALUE 'STARTED';
ALTER TYPE "WorkOrderEventType" ADD VALUE 'WAITING';
ALTER TYPE "WorkOrderEventType" ADD VALUE 'RESUMED';
ALTER TYPE "WorkOrderEventType" ADD VALUE 'COMPLETED';
ALTER TYPE "WorkOrderEventType" ADD VALUE 'VERIFIED';
ALTER TYPE "WorkOrderEventType" ADD VALUE 'RETURNED';
ALTER TYPE "WorkOrderEventType" ADD VALUE 'CANCELLED';

-- 2) List indexes -------------------------------------------------------------------
-- Default order (newest first) for the municipality (admin) and a department
-- (manager); field staff use (assigned_user_id, status), team views and team
-- counters (field_team_id, status), which replaces the single-column team index.
DROP INDEX "work_orders_field_team_id_idx";

CREATE INDEX "work_orders_municipality_id_created_at_idx"
  ON "work_orders"("municipality_id", "created_at" DESC);

CREATE INDEX "work_orders_municipality_id_department_id_created_at_idx"
  ON "work_orders"("municipality_id", "department_id", "created_at" DESC);

CREATE INDEX "work_orders_field_team_id_status_idx" ON "work_orders"("field_team_id", "status");

-- 3) One active work order per request ----------------------------------------------
-- A request gets a new work order only after the previous one was cancelled or
-- verified. The service serialises creation on the request row; this is the backstop.
CREATE UNIQUE INDEX "work_orders_one_active_per_request"
  ON "work_orders"("request_id")
  WHERE request_id IS NOT NULL AND status NOT IN ('VERIFIED', 'CANCELLED');

-- 4) Same-tenant references -------------------------------------------------------
-- The services resolve every reference through the tenant-scoped client; these
-- triggers are the database backstop against cross-municipality links.
CREATE OR REPLACE FUNCTION kent360_field_team_tenant_check() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM departments d WHERE d.id = NEW.department_id AND d.municipality_id = NEW.municipality_id
  ) THEN
    RAISE EXCEPTION 'field_teams: department % belongs to another municipality', NEW.department_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.leader_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = NEW.leader_id AND u.municipality_id = NEW.municipality_id
  ) THEN
    RAISE EXCEPTION 'field_teams: leader % belongs to another municipality', NEW.leader_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER field_teams_tenant_check
  BEFORE INSERT OR UPDATE OF department_id, leader_id, municipality_id ON "field_teams"
  FOR EACH ROW EXECUTE FUNCTION kent360_field_team_tenant_check();

CREATE OR REPLACE FUNCTION kent360_field_team_member_tenant_check() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM field_teams t JOIN users u ON u.municipality_id = t.municipality_id
    WHERE t.id = NEW.team_id AND u.id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'field_team_members: user % belongs to another municipality', NEW.user_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER field_team_members_tenant_check
  BEFORE INSERT OR UPDATE OF team_id, user_id ON "field_team_members"
  FOR EACH ROW EXECUTE FUNCTION kent360_field_team_member_tenant_check();

CREATE OR REPLACE FUNCTION kent360_work_order_tenant_check() RETURNS trigger AS $$
BEGIN
  IF NEW.request_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM requests r WHERE r.id = NEW.request_id AND r.municipality_id = NEW.municipality_id
  ) THEN
    RAISE EXCEPTION 'work_orders: request % belongs to another municipality', NEW.request_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM departments d WHERE d.id = NEW.department_id AND d.municipality_id = NEW.municipality_id
  ) THEN
    RAISE EXCEPTION 'work_orders: department % belongs to another municipality', NEW.department_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  -- A field team must belong to the work order's department (and so to its municipality).
  IF NEW.field_team_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM field_teams t
    WHERE t.id = NEW.field_team_id AND t.municipality_id = NEW.municipality_id
      AND t.department_id = NEW.department_id
  ) THEN
    RAISE EXCEPTION 'work_orders: field team % is not a team of the work order department', NEW.field_team_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.assigned_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = NEW.assigned_user_id AND u.municipality_id = NEW.municipality_id
  ) THEN
    RAISE EXCEPTION 'work_orders: assignee % belongs to another municipality', NEW.assigned_user_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER work_orders_tenant_check
  BEFORE INSERT OR UPDATE OF request_id, department_id, field_team_id, assigned_user_id, municipality_id
  ON "work_orders"
  FOR EACH ROW EXECUTE FUNCTION kent360_work_order_tenant_check();

-- 5) Immutable snapshots and completion evidence --------------------------------------
-- Number, tenant, source request, creation time and the location snapshot never change
-- (moving the request must not move the work order). Once COMPLETED or VERIFIED the
-- completion note is frozen; a supervisor who sends the work back (COMPLETED →
-- IN_PROGRESS) keeps the old note until the next completion. VERIFIED and CANCELLED
-- are final.
CREATE OR REPLACE FUNCTION kent360_work_order_immutable_fields() RETURNS trigger AS $$
BEGIN
  IF NEW.public_number IS DISTINCT FROM OLD.public_number
     OR NEW.municipality_id IS DISTINCT FROM OLD.municipality_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.latitude IS DISTINCT FROM OLD.latitude
     OR NEW.longitude IS DISTINCT FROM OLD.longitude
     OR (NEW.request_id IS DISTINCT FROM OLD.request_id AND NEW.request_id IS NOT NULL) THEN
    RAISE EXCEPTION 'work_orders: number, municipality, request, created_at and location are immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status IN ('COMPLETED', 'VERIFIED')
     AND NEW.completion_description IS DISTINCT FROM OLD.completion_description THEN
    RAISE EXCEPTION 'work_orders: completion description of a completed work order is immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status IN ('VERIFIED', 'CANCELLED') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'work_orders: % is a final status', OLD.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER work_orders_immutable_fields
  BEFORE UPDATE ON "work_orders"
  FOR EACH ROW EXECUTE FUNCTION kent360_work_order_immutable_fields();

ALTER TABLE "work_orders"
  ADD CONSTRAINT work_orders_completed_has_description
    CHECK (status NOT IN ('COMPLETED', 'VERIFIED') OR length(btrim(completion_description)) > 0);

-- Evidence photos are append-only: never edited, and nothing is added once the work
-- order is completed, verified or cancelled.
CREATE OR REPLACE FUNCTION kent360_work_order_media_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'work_order_media: evidence photos cannot be modified'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM work_orders w
    WHERE w.id = NEW.work_order_id AND w.status IN ('COMPLETED', 'VERIFIED', 'CANCELLED')
  ) THEN
    RAISE EXCEPTION 'work_order_media: work order % no longer accepts photos', NEW.work_order_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER work_order_media_guard
  BEFORE INSERT OR UPDATE ON "work_order_media"
  FOR EACH ROW EXECUTE FUNCTION kent360_work_order_media_guard();
