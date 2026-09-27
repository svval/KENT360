-- Public numbers are sequenced per municipality + year (NumberSequence), so two tenants
-- legitimately both have KNT-2026-000001. Uniqueness is therefore per municipality.
-- The composite index also serves the exact-number search inside a tenant.


-- DropIndex
DROP INDEX "requests_public_number_key";

-- DropIndex
DROP INDEX "work_orders_public_number_key";

-- CreateIndex
CREATE UNIQUE INDEX "requests_municipality_id_public_number_key" ON "requests"("municipality_id", "public_number");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_municipality_id_public_number_key" ON "work_orders"("municipality_id", "public_number");

