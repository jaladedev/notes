#!/usr/bin/env bash
# Records (or lists) a school's paid academic session -- the manual half of
# per-session subscription gating (migration 0036). Vendor-side only: the
# session_subscriptions table has no write policy, so the school's own admin
# can't extend their subscription; this runs with the project's DB access.
#
# Gating is OFF while the table is empty and turns ON as soon as the first
# row is added. After that, access requires today (school time zone) to fall
# inside some session's start/end dates.
#
# Usage (run from the repo root, against an already-linked project --
# provision-school.sh links it):
#   ./scripts/set-subscription.sh add  <academic-year> <starts-on> <ends-on> [note]
#   ./scripts/set-subscription.sh list
#   ./scripts/set-subscription.sh remove <id>
#
# Example:
#   ./scripts/set-subscription.sh add 2026/2027 2026-09-01 2027-07-31 "Paid, ref 4471"
#
# To extend a subscription, `add` a new row covering the new dates (or
# `remove` the old one and add it again). Overlapping rows are harmless.

set -euo pipefail

cmd="${1:-}"
date_re='^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
uuid_re='^[0-9a-fA-F-]{36}$'

# Doubles single quotes so a value can sit inside a SQL string literal.
sql_quote() { printf "'%s'" "${1//\'/\'\'}"; }

case "$cmd" in
  add)
    year="${2:?Usage: $0 add <academic-year> <starts-on YYYY-MM-DD> <ends-on YYYY-MM-DD> [note]}"
    starts="${3:?Usage: $0 add <academic-year> <starts-on YYYY-MM-DD> <ends-on YYYY-MM-DD> [note]}"
    ends="${4:?Usage: $0 add <academic-year> <starts-on YYYY-MM-DD> <ends-on YYYY-MM-DD> [note]}"
    note="${5:-}"
    [[ "$starts" =~ $date_re && "$ends" =~ $date_re ]] || { echo "Dates must be YYYY-MM-DD." >&2; exit 1; }
    [[ "$ends" < "$starts" ]] && { echo "ends-on is before starts-on." >&2; exit 1; }
    note_sql="null"
    [ -n "$note" ] && note_sql="$(sql_quote "$note")"
    npx supabase db execute --sql \
      "insert into public.session_subscriptions (academic_year, starts_on, ends_on, note) values ($(sql_quote "$year"), '$starts', '$ends', $note_sql);"
    echo "Recorded ${year}: ${starts} to ${ends}. Gating is now enforced for this school."
    ;;
  list)
    npx supabase db execute --sql \
      "select id, academic_year, starts_on, ends_on, note from public.session_subscriptions order by ends_on desc;"
    ;;
  remove)
    id="${2:?Usage: $0 remove <id>}"
    [[ "$id" =~ $uuid_re ]] || { echo "id must be a uuid (see: $0 list)." >&2; exit 1; }
    npx supabase db execute --sql "delete from public.session_subscriptions where id = '$id';"
    echo "Removed. Note: removing the LAST row turns gating off again."
    ;;
  *)
    echo "Usage: $0 {add|list|remove} ..." >&2
    exit 1
    ;;
esac
