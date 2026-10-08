"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertSubjectRole, requireUser } from "@/lib/actions/authGuards";
import { throwDbError } from "@/lib/errors/db";
import { toResult, type ActionResult } from "@/lib/actions/result";
import { getSchoolTimeZone } from "@/lib/actions/timetable";
import { validateDueDate } from "@/lib/dueDate";

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

  // Checked on the server, not just by the form's min attribute, which a
  // browser can't enforce for a stale tab or a direct call.
  if (input.dueAt) {
    const problem = validateDueDate(input.dueAt, new Date(), await getSchoolTimeZone());
    if (problem) throw new Error(problem);
  }

  const { error } = await supabase.from("homework").insert({
    topic_id: input.topicId,
    title: input.title,
    instructions: input.instructions ?? null,
    due_at: input.dueAt ?? null,
    created_by: userId,
  });
  if (error) throwDbError(error);

  revalidatePath(`/dashboard/teacher/notes/${input.topicId}`);
}

export async function submitHomework(
  ...args: Parameters<typeof submitHomeworkImpl>
): Promise<ActionResult<void>> {
  return toResult(() => submitHomeworkImpl(...args));
}

async function submitHomeworkImpl(input: { homeworkId: string; content?: string; fileUrl?: string }) {
  const { id: studentId } = await requireUser();
  const supabase = createClient();

  // Resubmitting must clear any prior grade -- otherwise a teacher's
  // grade/feedback for the old content stays attached to whatever the
  // student just replaced it with, silently mismatched.
  const { error } = await supabase.from("homework_submissions").upsert(
    {
      homework_id: input.homeworkId,
      student_id: studentId,
      content: input.content ?? null,
      file_url: input.fileUrl ?? null,
      submitted_at: new Date().toISOString(),
      grade: null,
      feedback: null,
      graded_at: null,
      graded_by: null,
    },
    { onConflict: "homework_id,student_id" }
  );
  if (error) throwDbError(error);
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

  // RLS (homework_submissions_own) already restricts this update to the
  // owning subject.s staff -- no separate assertSubjectRole call needed here.
  const { error } = await supabase
    .from("homework_submissions")
    .update({
      grade: input.grade,
      feedback: input.feedback ?? null,
      graded_at: new Date().toISOString(),
      graded_by: graderId,
    })
    .eq("id", input.submissionId);
  if (error) throwDbError(error);
}
