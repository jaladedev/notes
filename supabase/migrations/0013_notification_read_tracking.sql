-- Read tracking for the new notification badges: per-conversation
-- last_read_at for messages, using announcement_reads (already existed,
-- unused until now) for announcements.

alter table conversation_members add column last_read_at timestamptz not null default now();
