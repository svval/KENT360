-- Runs once, when the Postgres data volume is first initialised.
-- Prisma migrations also declare these extensions; creating them here keeps
-- a freshly created database usable by psql / GIS tools before the first migration.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
