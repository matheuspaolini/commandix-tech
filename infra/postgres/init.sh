#!/bin/bash
set -euo pipefail
psql -v ON_ERROR_STOP=1 --username postgres --dbname commandix \
  --set=migration_password="$MIGRATION_PASSWORD" \
  --set=runtime_password="$RUNTIME_PASSWORD" <<'SQL'
CREATE ROLE commandix_migrator LOGIN PASSWORD :'migration_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE commandix_runtime LOGIN PASSWORD :'runtime_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER DATABASE commandix OWNER TO commandix_migrator;
ALTER SCHEMA public OWNER TO commandix_migrator;
REVOKE ALL ON DATABASE commandix FROM PUBLIC;
GRANT CONNECT ON DATABASE commandix TO commandix_runtime;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO commandix_runtime;
SQL
