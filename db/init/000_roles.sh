#!/bin/bash
# POSTGRES_USER (the superuser initdb creates) ALWAYS bypasses RLS — it is for
# migrations and admin work only, never for the app's runtime queries. This
# creates a dedicated, non-superuser application role that RLS policies apply to.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  do \$\$
  begin
    if not exists (select from pg_roles where rolname = 'kometio_app') then
      create role kometio_app login password '${POSTGRES_APP_PASSWORD}';
    end if;
  end
  \$\$;
EOSQL
