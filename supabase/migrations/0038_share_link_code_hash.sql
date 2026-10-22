-- 0038_share_link_code_hash.sql
-- Share-link access codes are no longer stored in plain text.
--
-- access_code_hash holds a salted scrypt hash (see lib/shareCode.ts). The app
-- stops writing access_code. Existing rows that still have a plain-text code
-- keep working, but fail closed until the code is next entered correctly:
-- on that first successful entry the app writes the hash and nulls the
-- plain-text column. A row with neither column set has no code.
--
-- has_access_code lets the teacher UI show "(code protected)" without
-- selecting either secret column.

alter table share_links add column if not exists access_code_hash text;

alter table share_links add column if not exists has_access_code boolean
  generated always as (access_code_hash is not null or access_code is not null) stored;

comment on column share_links.access_code is
  'Legacy plain-text code. Deprecated: no longer written; nulled when upgraded to access_code_hash.';
comment on column share_links.access_code_hash is
  'Salted scrypt hash of the access code (lib/shareCode.ts). Never the code itself.';
