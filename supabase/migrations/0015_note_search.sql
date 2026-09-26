-- Full-text search over topic_notes.content. content is stored as the
-- rich-text editor's HTML, so the generated column strips tags with a
-- simple regexp before feeding to_tsvector -- good enough to keep
-- markup out of the ranked text; it isn't a full HTML parser and can
-- leave stray fragments on malformed markup.

alter table topic_notes
  add column search_vector tsvector
  generated always as (
    to_tsvector('english', regexp_replace(coalesce(content, ''), '<[^>]*>', ' ', 'g'))
  ) stored;

create index topic_notes_search_idx on topic_notes using gin (search_vector);

-- RLS already applies to a search query the same as any other select
-- (notes_visible -> topic_note_visible()), so no separate search
-- function is needed: a plain textSearch() through the request-scoped
-- client only ever returns rows the caller could already read.
