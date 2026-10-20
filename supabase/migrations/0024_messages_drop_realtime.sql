-- 0024_messages_drop_realtime.sql
-- Nothing subscribes to postgres_changes on `messages` any more (0007
-- added it to the publication; polling replaced it). Remove it so every
-- insert stops being decoded and broadcast for no listener. Guarded so
-- re-running, or running where the table was never added, is a no-op.

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime drop table public.messages;
  end if;
end
$$;
