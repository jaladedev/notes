-- Behavioural test for 0043 (platform replay guard).
--   psql -d notes_delivery_test -v ON_ERROR_STOP=1 -f supabase/tests/12_platform_replay.sql
-- A clean run ends with "PLATFORM REPLAY GUARD: ALL ASSERTIONS PASSED".
do $$
declare r boolean; v_denied boolean := false;
begin
  delete from platform_request_nonces;
  if not platform_claim_request('sig-a') then raise exception 'FAIL: first use of a signature was rejected'; end if;
  if platform_claim_request('sig-a') then raise exception 'FAIL: replay of a signature was accepted'; end if;
  if not platform_claim_request('sig-b') then raise exception 'FAIL: a different signature was rejected'; end if;

  -- expired entries are dropped, so an old signature is claimable again
  update platform_request_nonces set seen_at = now() - interval '16 minutes' where signature = 'sig-a';
  if not platform_claim_request('sig-a') then raise exception 'FAIL: expired entry was not cleaned up'; end if;
  raise notice 'ok 1: first use accepted, replay rejected, old entries cleaned';

  -- app users can neither call the function nor read the table
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  begin perform platform_claim_request('sig-x'); exception when insufficient_privilege then v_denied := true; end;
  if not v_denied then reset role; raise exception 'FAIL: authenticated can call platform_claim_request'; end if;
  v_denied := false;
  begin perform count(*) from platform_request_nonces; exception when insufficient_privilege then v_denied := true; end;
  reset role;
  if not v_denied then raise exception 'FAIL: authenticated can read platform_request_nonces'; end if;
  raise notice 'ok 2: authenticated users are locked out of the guard';

  delete from platform_request_nonces;
end $$;
select 'PLATFORM REPLAY GUARD: ALL ASSERTIONS PASSED' as result;
