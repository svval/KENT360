-- ─────────────────────────────────────────────────────────────────────────────
-- Hand-written database rules that Prisma's schema language cannot express.
-- Prisma ignores functions, triggers and CHECK constraints when detecting drift,
-- so these coexist safely with `prisma migrate dev`.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Spatial point maintenance ------------------------------------------------
-- Application code writes plain latitude/longitude; the geometry column used by
-- PostGIS queries (ST_DWithin, ST_Contains, clustering) is kept in sync here, so
-- the two representations can never disagree.
CREATE OR REPLACE FUNCTION kent360_sync_point_location() RETURNS trigger AS $$
BEGIN
  IF NEW.latitude IS NULL OR NEW.longitude IS NULL THEN
    NEW.location := NULL;
  ELSE
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER requests_sync_location
  BEFORE INSERT OR UPDATE OF latitude, longitude ON "requests"
  FOR EACH ROW EXECUTE FUNCTION kent360_sync_point_location();

CREATE TRIGGER work_orders_sync_location
  BEFORE INSERT OR UPDATE OF latitude, longitude ON "work_orders"
  FOR EACH ROW EXECUTE FUNCTION kent360_sync_point_location();

-- 2) Neighbourhood centre ------------------------------------------------------
-- ST_PointOnSurface (not ST_Centroid) guarantees the label point lies inside
-- concave polygons.
CREATE OR REPLACE FUNCTION kent360_sync_neighborhood_center() RETURNS trigger AS $$
BEGIN
  IF NEW.boundary IS NOT NULL THEN
    NEW.center := ST_PointOnSurface(NEW.boundary);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER neighborhoods_sync_center
  BEFORE INSERT OR UPDATE OF boundary ON "neighborhoods"
  FOR EACH ROW EXECUTE FUNCTION kent360_sync_neighborhood_center();

-- 3) Immutable audit trail ----------------------------------------------------
-- Audit rows are append-only for every database role the application uses.
-- Retention/archival must be done by a DBA with the trigger explicitly disabled.
CREATE OR REPLACE FUNCTION kent360_audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (% rejected)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION kent360_audit_log_immutable();

CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION kent360_audit_log_immutable();

-- 4) Integrity constraints ----------------------------------------------------
ALTER TABLE "requests"
  ADD CONSTRAINT requests_latitude_range CHECK (latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT requests_longitude_range CHECK (longitude BETWEEN -180 AND 180),
  ADD CONSTRAINT requests_supporter_count_non_negative CHECK (supporter_count >= 0);

ALTER TABLE "work_orders"
  ADD CONSTRAINT work_orders_latitude_range CHECK (latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT work_orders_longitude_range CHECK (longitude BETWEEN -180 AND 180);

ALTER TABLE "comments"
  ADD CONSTRAINT comments_single_parent
  CHECK ((request_id IS NOT NULL)::int + (work_order_id IS NOT NULL)::int = 1);

ALTER TABLE "duplicate_matches"
  ADD CONSTRAINT duplicate_matches_not_self CHECK (request_id <> matched_request_id),
  ADD CONSTRAINT duplicate_matches_score_range CHECK (score BETWEEN 0 AND 1);

ALTER TABLE "ai_analyses"
  ADD CONSTRAINT ai_analyses_confidence_range CHECK (confidence BETWEEN 0 AND 1);

ALTER TABLE "request_media"
  ADD CONSTRAINT request_media_size_positive CHECK (size_bytes > 0);

ALTER TABLE "work_order_media"
  ADD CONSTRAINT work_order_media_size_positive CHECK (size_bytes > 0);

ALTER TABLE "request_categories"
  ADD CONSTRAINT request_categories_sla_positive
  CHECK (default_sla_minutes IS NULL OR default_sla_minutes > 0);
