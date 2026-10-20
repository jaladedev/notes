"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertSubjectRole, requireUser } from "@/lib/actions/authGuards";
import { throwDbError } from "@/lib/errors/db";
import { toResult, type ActionResult } from "@/lib/actions/result";
import { getSchoolTimeZone } from "@/lib/actions/timetable";
import { validateHomework } from "@/lib/homeworkValidation";

export async function createHomework(
  ...args: Parameters<typeof createHomeworkImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof createHomeworkImpl>>>> {
  return toResult(() => createHomeworkImpl(...args));
}

async function createHomeworkImpl(input: {
  topicId: string;
  title: string;
  instructions?: string;
  dueAt?: string;
}) {
  const supabase = createClient();
  const { data: topic } = await supabase.from("topics").select("subject_id").eq("id", input.topicId).single();
  if (!topic) throw new Error("Topic not found.");

  const { id: userId } = await assertSubjectRole(topic.subject_id, ["teacher", "reviewer"]);

  // Checked on the server, not just by the form, which a stale tab or a
  // direct call can bypass.
  const problem = validateHomework(input, new Date(), await getSchoolTimeZone());
  if (problem) throw new Error(problem);

  const { error } = await supabase.from("homework").insert({
    topic_id: input.topicId,
    title: input.title.trim(),
    instructions: input.instructions?.trim() || null,
    due_at: input.dueAt ?? null,
    created_by: userId,
  });
  if (error) throwDbError(error);

  revalidatePath(`/dashboard/teacher/notes/${input.topicId}`);
}

export async function updateHomework(
  ...args: Parameters<typeof updateHomeworkImpl>
): Promise<ActionResult<void>> {
  return toResult(() => updateHomeworkImpl(...args));
}

/**
 * Edits a homework's title, instructions and due date. Submissions are
 * untouched. Allowed after students have submitted (a typo fix or an
 * extension shouldn't be blocked); an unchanged due date is never
 * re-validated, so homework whose deadline has passed stays editable.
 */
async function updateHomeworkImpl(input: {
  homeworkId: string;
  topicId: string;
  title: string;
  instructions?: string | null;
  dueAt?: string | null;
}) {
  const supabase = createClient();
  const { data: existing } = await supabase
    .from("homework")
    .select("id, topic_id, due_at, topics(subject_id)")
    .eq("id", input.homeworkId)
    .eq("topic_id", input.topicId)
    .maybeSingle();
  if (!existing) throw new Error("Homework not found.");

  await assertSubjectRole((existing as any).topics.subject_id, ["teacher", "reviewer"]);

  const problem = validateHomework(input, new Date(), await getSchoolTimeZone(), existing.due_at);
  if (problem) throw new Error(problem);

  // RLS (homework_write_staff) is the backstop for the role check above.
  const { error } = await supabase
    .from("homework")
    .update({
      title: input.title.trim(),
      instructions: input.instructions?.trim() || null,
      due_at: input.dueAt ?? null,
    })
    .eq("id", input.homeworkId);
  if (error) throwDbError(error);

  revalidatePath(`/dashboard/teacher/notes/${input.topicId}/homework`);
  revalidatePath(`/dashboard/student/topics/${input.topicId}/homework`);
}

export async function submitHomework(
  ...args: Parameters<typeof submitHomeworkImpl>
): Promise<ActionResult<void>> {
  return toResult(() => submitHomeworkImpl(...args));
}

const ALREADY_SUBMITTED = "You've already submitted this homework. Submissions are final and can't be changed.";
const ALREADY_GRADED = "This submission has already been graded. Grades are final and can't be changed.";

async function submitHomeworkImpl(input: { homeworkId: string; content?: string; fileUrl?: string }) {
  const { id: studentId } = await requireUser();
  const supabase = createClient();

  const content = input.content?.trim() || null;
  const fileUrl = input.fileUrl || null;
  // Final means final: an empty submission would lock the student out
  // with nothing handed in.
  if (!content && !fileUrl) throw new Error("Write your answer before submitting.");

  // A submission is final: one per student per homework. The database
  // enforces this as well (students only have an INSERT policy, see
  // 0022); this check just gives a clear message instead of a generic one.
  const { data: existing } = await supabase
    .from("homework_submissions")
    .select("id")
    .eq("homework_id", input.homeworkId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (existing) throw new Error(ALREADY_SUBMITTED);

  const { error } = await supabase.from("homework_submissions").insert({
    homework_id: input.homeworkId,
    student_id: studentId,
    content,
    file_url: fileUrl,
  });
  if (error) {
    // Two taps / two tabs racing past the check above.
    if (error.code === "23505") throw new Error(ALREADY_SUBMITTED);
    throwDbError(error);
  }
}

export async function gradeHomeworkSubmission(
  ...args: Parameters<typeof gradeHomeworkSubmissionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof gradeHomeworkSubmissionImpl>>>> {
  return toResult(() => gradeHomeworkSubmissionImpl(...args));
}

async function gradeHomeworkSubmissionImpl(input: {
  submissionId: string;
  grade: number;
  feedback?: string;
}) {
  const { id: graderId } = await requireUser();
  const supabase = createClient();

  if (!Number.isFinite(input.grade) || input.grade < 0) {
    throw new Error("Enter a grade of 0 or more.");
  }

  // Grades are final. RLS (0022) only lets staff update a submission that
  // has no graded_at yet, so the guard below is the friendly version of
  // the same rule; RLS also keeps non-staff out.
  const { data: existing } = await supabase
    .from("homework_submissions")
    .select("id, graded_at")
    .eq("id", input.submissionId)
    .maybeSingle();
  if (!existing) throw new Error("Submission not found.");
  if (existing.graded_at) throw new Error(ALREADY_GRADED);

  const { data: updated, error } = await supabase
    .from("homework_submissions")
    .update({
      grade: input.grade,
      feedback: input.feedback?.trim() || null,
      graded_at: new Date().toISOString(),
      graded_by: graderId,
    })
    .eq("id", input.submissionId)
    .is("graded_at", null)
    .select("id");
  if (error) throwDbError(error);
  // Zero rows: graded by someone else a moment ago, or not staff for this subject.
  if (!updated || updated.length === 0) {
    throw new Error("Couldn't save the grade. It may already be graded, or you may not have permission.");
  }
}
