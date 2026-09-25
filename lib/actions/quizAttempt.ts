"use server";

// create/publish a quiz (staff) and take/submit an attempt (student).
// Scoring itself happens server-side in submit_quiz_attempt() (see
// 0007_feature_expansion.sql) -- never trust a client-submitted score.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertSpaceRole, requireUser } from "@/lib/actions/authGuards";
import { throwDbError } from "@/lib/errors/db";
import { writeAuditLog } from "@/lib/audit";

export async function createQuizWithQuestions(input: {
  topicId: string;
  title: string;
  timeLimitSeconds?: number;
  questions: { prompt: string; points?: number; options: { label: string; isCorrect: boolean }[] }[];
}) {
  const supabase = createClient();
  const { data: topic } = await supabase.from("topics").select("space_id").eq("id", input.topicId).single();
  if (!topic) throw new Error("Topic not found.");
  const { id: userId } = await assertSpaceRole(topic.space_id, ["teacher", "reviewer", "admin"]);

  const { data: quiz, error: quizError } = await supabase
    .from("quizzes")
    .insert({
      topic_id: input.topicId,
      title: input.title,
      time_limit_seconds: input.timeLimitSeconds ?? null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (quizError) throwDbError(quizError);

  for (const [qIndex, q] of input.questions.entries()) {
    const { data: question, error: qError } = await supabase
      .from("quiz_questions")
      .insert({
        quiz_id: quiz!.id,
        prompt: q.prompt,
        points: q.points ?? 1,
        sequence_order: qIndex,
      })
      .select("id")
      .single();
    if (qError) throwDbError(qError);

    const { error: optError } = await supabase.from("quiz_options").insert(
      q.options.map((opt, oIndex) => ({
        question_id: question!.id,
        label: opt.label,
        is_correct: opt.isCorrect,
        sequence_order: oIndex,
      }))
    );
    if (optError) throwDbError(optError);
  }

  revalidatePath(`/dashboard/teacher/notes/${input.topicId}`);
  return { quizId: quiz!.id };
}

export async function setQuizPublished(quizId: string, published: boolean) {
  const { id: userId } = await requireUser();
  const supabase = createClient();

  // RLS (quizzes_write_staff) already restricts this to the quiz's own
  // space staff or its creator.
  const { error } = await supabase.from("quizzes").update({ published }).eq("id", quizId);
  if (error) throwDbError(error);

  if (published) {
    await writeAuditLog({ actorId: userId, action: "quiz.publish", targetType: "quiz", targetId: quizId });
  }
}

export async function startQuizAttempt(quizId: string) {
  const { id: studentId } = await requireUser();
  const supabase = createClient();

  const { data: attempt, error } = await supabase
    .from("quiz_attempts")
    .insert({ quiz_id: quizId, student_id: studentId })
    .select("id")
    .single();
  if (error) throwDbError(error);
  return { attemptId: attempt!.id };
}

export async function answerQuizQuestion(input: { attemptId: string; questionId: string; optionId: string }) {
  const supabase = createClient();
  // RLS (quiz_answers_own) restricts writes to the attempt's own student.
  const { error } = await supabase.from("quiz_answers").upsert(
    { attempt_id: input.attemptId, question_id: input.questionId, option_id: input.optionId },
    { onConflict: "attempt_id,question_id" }
  );
  if (error) throwDbError(error);
}

export async function submitQuizAttempt(attemptId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("submit_quiz_attempt", { p_attempt_id: attemptId });
  if (error) throwDbError(error);
  return data?.[0] as { score: number; total_points: number } | undefined;
}
