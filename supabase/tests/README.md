# RLS smoke test

Not pgTAP -- plain SQL with `DO $$ ... RAISE EXCEPTION ... END $$`
blocks, run against a real (if minimal) Postgres. This is what caught
every RLS bug found in the plan doc's Addendums 4 and 5, including one
(no INSERT policy on `spaces`/`space_members`) that meant nothing
could be created through the app at all -- none of this was visible
from reading the SQL, only from running it as a non-superuser role.

There's no Supabase CLI or Docker dependency here: `00_stubs.sql`
fakes just enough of the platform (an `auth` schema, `auth.uid()`
reading a settable session claim, the `supabase_realtime`
publication) to let `supabase/migrations/*.sql` apply as-is.

## Running it

```bash
# once, if you don't have local Postgres:
sudo apt-get install -y postgresql
sudo service postgresql start

sudo -u postgres psql -c "create database notes_delivery_test;"
sudo -u postgres psql -d notes_delivery_test -f supabase/tests/00_stubs.sql
sudo -u postgres psql -d notes_delivery_test -c "
  create role authenticated nologin;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;
"

for f in supabase/migrations/*.sql; do
  sudo -u postgres psql -d notes_delivery_test -v ON_ERROR_STOP=1 -f "$f" || break
done

# grants must come AFTER migrations create the tables
sudo -u postgres psql -d notes_delivery_test -c "
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant execute on all functions in schema public to authenticated;
  grant usage, select on all sequences in schema public to authenticated;
"

sudo -u postgres psql -d notes_delivery_test -v ON_ERROR_STOP=1 -f supabase/tests/01_seed.sql
sudo -u postgres psql -d notes_delivery_test -v ON_ERROR_STOP=1 -f supabase/tests/02_assertions.sql
```

A clean run ends with `ALL ASSERTIONS PASSED`. Any `DO` block failure
raises `FAIL: ...` and stops the script (`ON_ERROR_STOP`) -- read the
message, it names exactly what broke.

**Re-run this whenever a migration changes an RLS policy.** It's not
wired into CI (no Postgres available in most CI runners without extra
setup) -- that's the next thing worth doing here, not a reason to skip
running it locally before a policy change ships.

## What it checks

Six identities (admin, two teachers, two students, one parent) across
two isolated spaces:

- Cross-space read isolation (topics, quiz questions)
- Cross-space write isolation (homework submissions)
- `profiles` visibility (a non-admin sees only their own row; admin
  sees all)
- A space's *existing* admin can add/remove other members; a plain
  member (even in that same space) cannot
- A parent can read their own child's homework submission
- Quiz scoring is computed server-side by `submit_quiz_attempt()`
  (never trusts a client-supplied score) and rejects a double-submit
- Messaging: a user outside a conversation can neither read nor write
  into it
- `audit_log` is admin-only

**Not checked here:** Realtime actually firing, storage bucket
policies (provisioned separately), and anything needing the real
GoTrue/PostgREST stack rather than the `auth.uid()` stub.
