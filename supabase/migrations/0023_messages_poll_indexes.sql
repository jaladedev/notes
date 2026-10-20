-- 0023_messages_poll_indexes.sql
-- Messaging now polls instead of subscribing to Realtime (see
-- lib/hooks/usePolling.ts and lib/actions/messaging.ts#fetchMessagesSince).
-- Every poll is "messages in conversation X at or after cursor T, oldest
-- first", and the nav's unread count scans a member's conversations for
-- rows from other senders, so index for both access paths.

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

create index if not exists messages_conversation_sender_created_idx
  on public.messages (conversation_id, sender_id, created_at);
