#!/usr/bin/env bash
# Applies supabase/migrations to a throwaway local Postgres and runs supabase/tests/*.sql.
# Stubs the Supabase roles (anon, authenticated, service_role) so RLS and grants can be checked
# without Docker. Usage: scripts/check-migrations.sh [path/to/postgres/bin]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${1:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
WORK="$(mktemp -d)"
PORT=54329
RUN=()
# Postgres refuses to run as root; drop to the postgres user when needed.
if [ "$(id -u)" = 0 ]; then RUN=(runuser -u postgres --); chown postgres "$WORK"; fi

cleanup() { "${RUN[@]}" "$PGBIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

"${RUN[@]}" "$PGBIN/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null
"${RUN[@]}" "$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null

PSQL=("${RUN[@]}" "$PGBIN/psql" -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -c "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;"

for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "migrate  $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
for f in "$ROOT"/supabase/tests/*.sql; do
  echo "test     $(basename "$f")"
  "${PSQL[@]}" -t -f "$f"
done
