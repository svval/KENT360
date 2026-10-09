-- Phase 13: notification inbox – new in-app notification types.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REQUEST_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REQUEST_VERIFIED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REQUEST_UPDATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WORK_ORDER_RETURNED';

-- Idempotency of SLA alerts (one alert per request and type) and the inbox's
-- "unread first, newest first" read path.
CREATE INDEX IF NOT EXISTS "notifications_entity_id_type_idx" ON "notifications"("entity_id", "type");
