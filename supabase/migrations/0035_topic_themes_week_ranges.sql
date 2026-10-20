-- 0035_topic_themes_week_ranges.sql
-- Ported from school_app's 20260801170000 (curriculum_themes_and_week_ranges),
-- adapted to this schema: here the table is `topics`, and week_number is
-- optional (a topic with no week is never gated -- see 0019).
--
-- NERDC schemes of work group several topics under a shared Theme (e.g.
-- "Number and Numeration"), and one topic commonly spans several weeks
-- (e.g. weeks 2-3). This adds both:
--   theme            free-text grouping label, nullable.
--   week_end_number  last week the topic covers, nullable. When set it is
--                    >= week_number, and it requires week_number to be set.
-- week_number keeps its meaning (START of the range), and it is still the
-- only column the week gate (0019) reads: a 2-3 topic is released in week 2.
-- Nothing that already reads week_number needs to change.
--
-- Deliberate difference from school_app: its week_end_number is NOT NULL
-- (every topic there has a week). Here a topic may have no week, so the end
-- is NULL in that case rather than a made-up value.

alter table topics
  add column theme text,
  add column week_end_number integer;

-- Existing topics with a week read as a single-week span, as before.
update topics
  set week_end_number = week_number
  where week_number is not null
    and week_end_number is null;

alter table topics
  add constraint topics_week_range_check check (
    week_end_number is null
    or (week_number is not null and week_end_number >= week_number)
  ),
  add constraint topics_theme_length_check check (
    theme is null or char_length(btrim(theme)) between 1 and 120
  );

comment on column topics.theme is
  'Optional grouping label matching NERDC scheme-of-work themes (e.g. "Number and Numeration"). Several topics can share a theme.';
comment on column topics.week_end_number is
  'Last week this topic covers; null when the topic has no week. Equal to week_number for a single-week topic. The week gate reads week_number (the start) only.';
