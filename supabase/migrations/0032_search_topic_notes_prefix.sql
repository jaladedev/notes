-- 0032_search_topic_notes_prefix.sql
-- Search-as-you-type: "photo" should find "photosynthesis". The existing
-- search (websearch_to_tsquery, see 0015) matches whole stemmed words only.
--
-- Each word becomes a prefix term (word:*). Two tsqueries are OR-ed
-- because the stored vector is stemmed ('photosynthesis' is stored as
-- 'photosynthesi'):
--   * 'english' handles whole words typed in full ("classes" -> 'class')
--   * 'simple'  handles half-typed words, which stemming would otherwise
--               mangle ("photosynth" must stay a literal prefix)
-- Multiple words are AND-ed. Input is reduced to letters/digits first, so
-- user text can never be interpreted as tsquery syntax.
--
-- SECURITY INVOKER: runs as the caller, so RLS on topic_notes
-- (notes_visible) still decides what is returned, exactly as for a plain
-- select. Results are best-first; the app fetches the rows for the ids.

create or replace function public.search_topic_notes_prefix(p_query text, p_limit integer default 25)
returns table(id uuid, rank real)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_terms text[];
  v_en tsquery;
  v_simple tsquery;
begin
  select coalesce(array_agg(t), '{}') into v_terms
  from (
    select t
    from regexp_split_to_table(
           lower(regexp_replace(coalesce(p_query, ''), '[^[:alnum:][:space:]]', ' ', 'g')),
           '\s+'
         ) as t
    where t <> ''
    limit 8
  ) q;

  if cardinality(v_terms) = 0 then
    return;
  end if;

  select to_tsquery('english', string_agg(t || ':*', ' & ')),
         to_tsquery('simple',  string_agg(t || ':*', ' & '))
    into v_en, v_simple
  from unnest(v_terms) as t;

  return query
    select n.id,
           greatest(ts_rank(n.search_vector, v_en), ts_rank(n.search_vector, v_simple))::real
    from topic_notes n
    where n.status = 'published'
      and n.search_vector @@ (v_en || v_simple)
    order by 2 desc, n.id
    limit greatest(1, least(coalesce(p_limit, 25), 50));
end;
$$;
