-- 0033_conversation_state.sql
-- Archive / unarchive / delete a conversation, per member, plus a fix for
-- read-marking.
--
-- THE BUG THIS ALSO FIXES: conversation_members only ever had a SELECT
-- policy (0007), yet markConversationRead() UPDATEs last_read_at through
-- the user's own client. With no UPDATE policy, RLS filters that update to
-- zero rows without raising an error, so last_read_at never moved and the
-- unread badge could never clear. (Verified: an UPDATE as a member
-- affects 0 rows before this migration.)
--
-- Why column grants and not just an UPDATE policy: a policy on its own
-- would let a member rewrite conversation_id on their own row and so add
-- themselves to someone else's conversation. A member may now update
-- exactly three columns of their own row and nothing else.
--
-- Semantics (all per member -- the other person's inbox is never touched):
--   archived_at  hides the conversation from the inbox; it is listed under
--                "Archived" until restored. A new message un-archives it for
--                everyone (trigger below), so nothing important stays buried.
--   deleted_at   removes it from my view. Messages up to that moment stay
--                hidden from me for good; if the other person writes again
--                the conversation returns showing only newer messages.
--                The other member's copy and the messages themselves are
--                untouched (messages are shared rows, not mine to destroy).

alter table conversation_members
  add column archived_at timestamptz,
  add column deleted_at timestamptz;

revoke update on conversation_members from authenticated, anon;
grant update (last_read_at, archived_at, deleted_at) on conversation_members to authenticated;

create policy conversation_members_update_own on conversation_members
  for update to public
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- A new message brings an archived conversation back into every member's
-- inbox. SECURITY DEFINER because the sender may not update other
-- members' rows.
create or replace function public.messages_unarchive_conversation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update conversation_members
    set archived_at = null
    where conversation_id = new.conversation_id
      and archived_at is not null;
  return new;
end;
$$;

create trigger messages_unarchive_conversation
  after insert on messages
  for each row execute function messages_unarchive_conversation();
