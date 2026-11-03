#!/usr/bin/env bash
# Checks supabase/migrations/20261103_role_permissions.sql on a throwaway
# Postgres cluster: loads the live policies, shows the matrix failing, applies
# the migration, then requires the matrix to pass.
# Usage: supabase/tests/run_role_permissions.sh   (needs Postgres 14+ binaries)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
bin="$(dirname "$(command -v pg_ctl 2>/dev/null || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")"
dir="$(mktemp -d)"; chmod 755 "$dir"
run_pg() { if [ "$(id -u)" = 0 ]; then su postgres -s /bin/sh -c "$*"; else sh -c "$*"; fi; }
[ "$(id -u)" = 0 ] && chown postgres "$dir"
run_pg "$bin/initdb -D $dir/data -A trust >/dev/null"
run_pg "$bin/pg_ctl -D $dir/data -o '-k $dir -c listen_addresses=' -l $dir/log start >/dev/null"
trap 'run_pg "$bin/pg_ctl -D $dir/data stop -m fast >/dev/null"; rm -rf "$dir"' EXIT
export PGOPTIONS="-c client_min_messages=warning"
psql() { "$bin/psql" -h "$dir" -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

psql -f "$here/role_permissions_setup.sql"
echo "== Before the migration (failures expected)"
psql -f "$here/role_permissions_matrix.sql" 2>&1 | sed 's/^/   /' || true
echo "== After the migration"
psql -f "$here/../migrations/20261103_role_permissions.sql"
psql -f "$here/role_permissions_matrix.sql"
echo "== Role permission matrix: all cells match"
