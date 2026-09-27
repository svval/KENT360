-- The reporter of a request may only ever become NULL (ON DELETE SET NULL when the user
-- account is removed). The previous rule also allowed NULL → another user, which made a
-- two-step reporter change possible. Now any change to a non-NULL value is refused.
CREATE OR REPLACE FUNCTION kent360_request_immutable_fields() RETURNS trigger AS $$
BEGIN
  IF NEW.public_number IS DISTINCT FROM OLD.public_number
     OR NEW.municipality_id IS DISTINCT FROM OLD.municipality_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.sla_due_at IS DISTINCT FROM OLD.sla_due_at
     OR NEW.sla_at_risk_at IS DISTINCT FROM OLD.sla_at_risk_at
     OR (NEW.created_by_id IS DISTINCT FROM OLD.created_by_id AND NEW.created_by_id IS NOT NULL) THEN
    RAISE EXCEPTION 'requests: public_number, municipality, created_at, reporter and SLA snapshot are immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
