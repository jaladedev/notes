// Overdue-homework alerts. Plain server module (deliberately NOT "use
// server": it is imported by server components only, never callable as an
// endpoint). Everything is read through the caller's own RLS, so a teacher
// only ever sees their subject's homework and the class members of classes
// they teach (class_members_visible -> teaches_class), and a student only
// their own.

import { createClient } from "@/lib/supabase/server";
import { isOverdue, summarizeSubmissions, type OverdueSummary } from "@/lib/overdueHomework";

export type StaffOverdueItem = {
  homeworkId: string;
  title: string;
  topicId: string;
  topicTitle: string;
  dueAt: string;
  summary: OverdueSummary;
};

export type StudentOverdueItem = {
  homeworkId: string;
  title: string;
  topicId: string;
  topicTitle: string;
  dueAt: string;
};

/**
 * Overdue homework in one subject that still has outstanding students,
 * with submission details: how many handed in, how many were late, how
 * many are still to come. Most outstanding first.
 */
export async function getOverdueHomeworkForSubject(subjectId: string, limit = 8): Promise<StaffOverdueItem[]> {
  const supabase = createClient();
  const nowIso = new Date().toISOString();

  const { data: topics } = await supabase
    .from("topics")
    .select("id, title, education_level, level_number")
    .eq("subject_id", subjectId);
  if (!topics || topics.length === 0) return [];
  const topicById = new Map(topics.map((t) => [t.id as string, t]));

  const { data: homework } = await supabase
    .from("homework")
    .select("id, title, topic_id, due_at")
    .in("topic_id", [...topicById.keys()])
    .not("due_at", "is", null)
    .lt("due_at", nowIso);
  if (!homework || homework.length === 0) return [];

  const { data: submissions } = await supabase
    .from("homework_submissions")
    .select("homework_id, student_id, submitted_at")
    .in("homework_id", homework.map((h) => h.id));

  // Expected cohort per level: members of classes at the topic's level that
  // this user can see (their own classes, for a teacher).
  const levelKeys = new Set(topics.map((t) => `${t.education_level}:${t.level_number}`));
  const { data: classes } = await supabase.from("classes").select("id, education_level, level_number");
  const classLevel = new Map(
    (classes ?? [])
      .filter((c) => levelKeys.has(`${c.education_level}:${c.level_number}`))
      .map((c) => [c.id as string, `${c.education_level}:${c.level_number}`])
  );
  const { data: members } = classLevel.size
    ? await supabase.from("class_members").select("class_id, profile_id").in("class_id", [...classLevel.keys()])
    : { data: [] as { class_id: string; profile_id: string }[] };
  const cohort = new Map<string, Set<string>>();
  for (const m of members ?? []) {
    const key = classLevel.get(m.class_id);
    if (!key) continue;
    if (!cohort.has(key)) cohort.set(key, new Set());
    cohort.get(key)!.add(m.profile_id);
  }

  const items: StaffOverdueItem[] = [];
  for (const h of homework) {
    const topic = topicById.get(h.topic_id);
    if (!topic || !h.due_at) continue;
    const expected = cohort.get(`${topic.education_level}:${topic.level_number}`)?.size ?? 0;
    const summary = summarizeSubmissions(
      h.due_at,
      (submissions ?? []).filter((s) => s.homework_id === h.id),
      expected
    );
    if (summary.outstanding === 0) continue; // nothing left to chase
    items.push({
      homeworkId: h.id,
      title: h.title,
      topicId: h.topic_id,
      topicTitle: topic.title,
      dueAt: h.due_at,
      summary,
    });
  }
  return items.sort((a, b) => b.summary.outstanding - a.summary.outstanding).slice(0, limit);
}

/** The signed-in student's own overdue, unsubmitted homework (RLS limits homework to topics they can read). */
export async function getOverdueHomeworkForStudent(studentId: string, limit = 8): Promise<StudentOverdueItem[]> {
  const supabase = createClient();

  const { data: homework } = await supabase
    .from("homework")
    .select("id, title, topic_id, due_at, topics(title)")
    .not("due_at", "is", null)
    .lt("due_at", new Date().toISOString())
    .order("due_at", { ascending: false })
    .limit(100);
  if (!homework || homework.length === 0) return [];

  const { data: mine } = await supabase
    .from("homework_submissions")
    .select("homework_id")
    .eq("student_id", studentId)
    .in("homework_id", homework.map((h) => h.id));
  const done = new Set((mine ?? []).map((s) => s.homework_id as string));

  return homework
    .filter((h) => !done.has(h.id) && isOverdue(h.due_at))
    .slice(0, limit)
    .map((h: any) => ({
      homeworkId: h.id,
      title: h.title,
      topicId: h.topic_id,
      topicTitle: h.topics?.title ?? "Topic",
      dueAt: h.due_at,
    }));
}
