"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/actions/authGuards";

export type ChildDigest = {
  id: string;
  fullName: string;
  upcomingHomework: { id: string; title: string; dueAt: string | null; topicId: string }[];
  recentGrades: { homeworkTitle: string; grade: number; feedback: string | null; gradedAt: string }[];
  notesReadLast7Days: number;
};

/**
 * One digest per linked child: homework due soon, recently graded work,
 * and how many distinct topics they've opened in the last week. All
 * reads go through the request-scoped client -- is_parent_of() RLS
 * (homework_submissions_own, quiz_attempts_own, and now
 * reads_visible_staff/topic_reads, 0014) already scopes everything to
 * children the caller is actually linked to via guardian_links.
 */
export async function getParentDigest(): Promise<ChildDigest[]> {
  const { id: parentId } = await requireUser();
  const supabase = createClient();
  const admin = createAdminClient();

  const { data: links } = await supabase
    .from("guardian_links")
    .select("student_id")
    .eq("parent_id", parentId);
  const childIds = (links ?? []).map((l) => l.student_id);
  if (childIds.length === 0) return [];

  // Names: profiles RLS only lets a user read their own row, so this
  // needs the admin client -- gated above by "linked as my child", not
  // by exposing every profile in the school.
  const { data: childProfiles } = await admin
    .from("profiles")
    .select("id, full_name")
    .in("id", childIds);
  const nameById = new Map((childProfiles ?? []).map((p) => [p.id, p.full_name]));

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const digests = await Promise.all(
    childIds.map(async (studentId) => {
      const { data: classRows } = await admin
        .from("class_members")
        .select("class_id")
        .eq("profile_id", studentId);
      const classIds = (classRows ?? []).map((c) => c.class_id);
      const { data: spaceRows } = classIds.length
        ? await admin.from("spaces").select("id").in("class_id", classIds)
        : { data: [] };
      const spaceIds = (spaceRows ?? []).map((s) => s.id);

      const { data: topicRows } = spaceIds.length
        ? await admin.from("topics").select("id").in("space_id", spaceIds)
        : { data: [] };
      const topicIds = (topicRows ?? []).map((t) => t.id);

      const { data: homeworkRows } = topicIds.length
        ? await admin
            .from("homework")
            .select("id, title, due_at, topic_id")
            .in("topic_id", topicIds)
            .not("due_at", "is", null)
            .order("due_at", { ascending: true })
        : { data: [] };

      const { data: mySubmissions } = await supabase
        .from("homework_submissions")
        .select("homework_id, grade, feedback, graded_at")
        .eq("student_id", studentId);
      const submittedHomeworkIds = new Set((mySubmissions ?? []).map((s) => s.homework_id));

      const upcomingHomework = (homeworkRows ?? [])
        .filter((h) => !submittedHomeworkIds.has(h.id))
        .slice(0, 5)
        .map((h) => ({ id: h.id, title: h.title, dueAt: h.due_at, topicId: h.topic_id }));

      const homeworkTitleById = new Map((homeworkRows ?? []).map((h) => [h.id, h.title]));
      const recentGrades = (mySubmissions ?? [])
        .filter((s) => s.grade != null && s.graded_at)
        .sort((a, b) => (b.graded_at ?? "").localeCompare(a.graded_at ?? ""))
        .slice(0, 5)
        .map((s) => ({
          homeworkTitle: homeworkTitleById.get(s.homework_id) ?? "Homework",
          grade: s.grade as number,
          feedback: s.feedback,
          gradedAt: s.graded_at as string,
        }));

      const { data: recentReads } = await supabase
        .from("topic_reads")
        .select("topic_id")
        .eq("student_id", studentId)
        .gte("last_read_at", sevenDaysAgo);
      const notesReadLast7Days = new Set((recentReads ?? []).map((r) => r.topic_id)).size;

      return {
        id: studentId,
        fullName: nameById.get(studentId) ?? "Your child",
        upcomingHomework,
        recentGrades,
        notesReadLast7Days,
      };
    })
  );

  return digests;
}
