#!/usr/bin/env bash
# Provisioning script for a new school (plan doc phase P0b).
# New, not ported -- school_app has no equivalent (it's single-tenant
# by design; this app is one deployment per school, so this is the
# "new school" bootstrap).
#
# What it does:
#   1. Runs every migration in supabase/migrations/ against the given
#      project, in order, tracking what's already applied so re-runs
#      are safe.
#   2. Creates the private `topic-resources` storage bucket if missing.
#   3. Writes a per-school env file the deployment can load from.
#
# What it deliberately does NOT do (still manual, see README):
#   - Create the Supabase project itself (no API for that at time of
#     writing -- create it in the dashboard first).
#   - Deploy anywhere / set env vars on a hosting provider.
#   - Create the first user -- sign up via /login once deployed, then
#     visit /dashboard/admin/spaces.
#
# Usage:
#   ./scripts/provision-school.sh <school-slug> <supabase-project-ref> <db-password>
#
# Requires: supabase CLI (npx supabase, no global install needed) and
# the project's service role key + anon key + URL, which you'll be
# prompted for (not passed as CLI args, so they don't end up in shell
# history).

set -euo pipefail

SCHOOL_SLUG="${1:?Usage: $0 <school-slug> <supabase-project-ref> <db-password>}"
PROJECT_REF="${2:?Usage: $0 <school-slug> <supabase-project-ref> <db-password>}"
DB_PASSWORD="${3:?Usage: $0 <school-slug> <supabase-project-ref> <db-password>}"

ENV_DIR="deployments"
ENV_FILE="${ENV_DIR}/${SCHOOL_SLUG}.env"
STATUS_TABLE_SQL="create table if not exists public._schema_migrations (name text primary key, applied_at timestamptz not null default now());"

mkdir -p "$ENV_DIR"

if [ -f "$ENV_FILE" ]; then
  echo "Warning: ${ENV_FILE} already exists. Continuing will re-run migrations against"
  echo "whatever project it points to (safe -- already-applied ones are skipped) but"
  echo "won't overwrite the file's contents."
  read -rp "Continue? [y/N] " confirm
  [ "$confirm" = "y" ] || exit 1
fi

echo "==> Linking to Supabase project ${PROJECT_REF}"
npx supabase link --project-ref "$PROJECT_REF" --password "$DB_PASSWORD"

echo "==> Ensuring migration-tracking table exists"
npx supabase db execute --sql "$STATUS_TABLE_SQL"

echo "==> Applying migrations"
for migration in supabase/migrations/*.sql; do
  name="$(basename "$migration")"
  already_applied=$(npx supabase db execute --sql \
    "select 1 from public._schema_migrations where name = '${name}';" 2>/dev/null | grep -c "^1$" || true)

  if [ "$already_applied" -gt 0 ]; then
    echo "    skip  ${name} (already applied)"
    continue
  fi

  echo "    apply ${name}"
  npx supabase db execute --file "$migration"
  npx supabase db execute --sql \
    "insert into public._schema_migrations (name) values ('${name}');"
done

echo "==> Enabling Realtime on the messages table (idempotent)"
npx supabase db execute --sql \
  "alter publication supabase_realtime add table messages;" 2>/dev/null || \
  echo "    (already enabled, or failed -- check manually: Database > Replication)"

echo "==> Creating storage bucket 'topic-resources' (if missing)"
# The bucket is also created lazily by uploadTopicResource on first
# upload (see lib/actions/resources.ts) -- this just does it up front
# so it shows up in the dashboard immediately instead of after first use.
npx supabase storage buckets create topic-resources --private || \
  echo "    (bucket already exists, or creation failed -- check manually)"

if [ ! -f "$ENV_FILE" ]; then
  echo "==> Writing ${ENV_FILE}"
  echo "Paste this school's Supabase project URL, then press Enter:"
  read -r SUPABASE_URL
  echo "Paste the anon key:"
  read -r ANON_KEY
  echo "Paste the service role key (kept only in this local file, never committed):"
  read -rs SERVICE_ROLE_KEY
  echo

  cat > "$ENV_FILE" << ENVEOF
NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
ENVEOF
  chmod 600 "$ENV_FILE"
fi

echo ""
echo "Done. ${SCHOOL_SLUG} is migrated and its env file is at ${ENV_FILE}."
echo "Next:"
echo "  1. Set these as env vars on the deployment for this school and deploy."
echo "  2. Create the first admin manually (no self-signup in this app --"
echo "     see 0006_admin_accounts.sql's bootstrap comment):"
echo "       npx supabase auth admin create-user --email <admin email> ..."
echo "       then insert their profiles row with role='admin'."
echo "  3. Sign in as that admin and create every other account from"
echo "     /dashboard/admin/staff, /students, /parents."
