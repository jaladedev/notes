"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertSpaceRole, requireUser } from "@/lib/actions/authGuards";
import { throwDbError } from "@/lib/errors/db";

export async function createHomework(input: {
  topicId: string;
  title: string;
  instructions?: string;
  dueAt?: string;
}) {
  const supabase = createClient();
  const { data: topic } = await supabase.from("topics").select("space_id").eq("id", input.topicId).single();
  if (!topic) throw new Error("Topic not found.");

  const { id: userId } = await assertSpaceRole(topic.space_id, ["teacher", "reviewer", "admin"]);

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

export async function submitHomework(input: { homeworkId: string; content?: string; fileUrl?: string }) {
  const { id: studentId } = await requireUser();
  const supabase = createClient();

  const { error } = await supabase.from("homework_submissions").upsert(
    {
      homework_id: input.homeworkId,
      student_id: studentId,
      content: input.content ?? null,
      file_url: input.fileUrl ?? null,
      submitted_at: new Date().toISOString(),
    },
    { onConflict: "homework_id,student_id" }
  );
  if (error) throwDbError(error);
}

export async function gradeHomeworkSubmission(input: {
  submissionId: string;
  grade: number;
  feedback?: string;
}) {
  const { id: graderId } = await requireUser();
  const supabase = createClient();

  // RLS (homework_submissions_own) already restricts this update to the
  // owning space's staff -- no separate assertSpaceRole call needed here.
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
