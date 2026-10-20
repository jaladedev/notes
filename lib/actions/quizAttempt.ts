"use server";

// create/edit/publish/schedule a quiz and grade essays (staff), and
// take/submit an attempt (student). Scoring happens server-side in
// submit_quiz_attempt() (0025) and essay grades in grade_essay_answer()
// (0027) -- never trust a client-submitted score. Creating and replacing
// questions go through single-transaction RPCs (0029, 0030) so a failure
// can't leave a half-built quiz.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertSubjectRole, requireUser } from "@/lib/actions/authGuards";
import { throwDbError } from "@/lib/errors/db";
import { toResult, type ActionResult } from "@/lib/actions/result";
import { writeAuditLog } from "@/lib/audit";
import { toRpcQuestions, validateQuiz, type QuizQuestionInput } from "@/lib/quizValidation";

export async function createQuizWithQuestions(
  ...args: Parameters<typeof createQuizWithQuestionsImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof createQuizWithQuestionsImpl>>>> {
  return toResult(() => createQuizWithQuestionsImpl(...args));
}

export type QuizDefinitionInput = {
  title: string;
  timeLimitSeconds?: number | null;
  opensAt?: string | null;
  closesAt?: string | null;
  shuffleQuestions?: boolean;
  questions: QuizQuestionInput[];
};

async function createQuizWithQuestionsImpl(input: QuizDefinitionInput & { topicId: string }) {
  const supabase = createClient();
  const { data: topic } = await supabase.from("topics").select("subject_id").eq("id", input.topicId).single();
  if (!topic) throw new Error("Topic not found.");
  await assertSubjectRole(topic.subject_id, ["teacher", "reviewer"]);

  const problem = validateQuiz(input);
  if (problem) throw new Error(problem);

  const { data: quizId, error } = await supabase.rpc("create_quiz_with_questions", {
    p_topic_id: input.topicId,
    p_title: input.title.trim(),
    p_time_limit_seconds: input.timeLimitSeconds ?? null,
    p_questions: toRpcQuestions(input.questions),
    p_opens_at: input.opensAt ?? null,
    p_closes_at: input.closesAt ?? null,
    p_shuffle_questions: input.shuffleQuestions ?? false,
  });
  if (error) throwDbError(error);

  revalidatePath(`/dashboard/teacher/notes/${input.topicId}`);
  revalidatePath(`/dashboard/teacher/notes/${input.topicId}/quizzes`);
  return { quizId: quizId as string };
}

export async function replaceQuizQuestions(
  ...args: Parameters<typeof replaceQuizQuestionsImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof replaceQuizQuestionsImpl>>>> {
  return toResult(() => replaceQuizQuestionsImpl(...args));
}

/** Edits a quiz's title, settings and whole question set. Refused by the database once any student has started it. */
async function replaceQuizQuestionsImpl(input: QuizDefinitionInput & { quizId: string; topicId: string }) {
  const { id: userId } = await requireUser();
  const supabase = createClient();

  const problem = validateQuiz(input);
  if (problem) throw new Error(problem);

  const { error } = await supabase.rpc("replace_quiz_questions", {
    p_quiz_id: input.quizId,
    p_title: input.title.trim(),
    p_time_limit_seconds: input.timeLimitSeconds ?? null,
    p_questions: toRpcQuestions(input.questions),
    p_opens_at: input.opensAt ?? null,
    p_closes_at: input.closesAt ?? null,
    p_shuffle_questions: input.shuffleQuestions ?? false,
  });
  if (error) throwDbError(error);

  await writeAuditLog({ actorId: userId, action: "quiz.edit", targetType: "quiz", targetId: input.quizId });
  revalidatePath(`/dashboard/teacher/notes/${input.topicId}/quizzes`);
  return { quizId: input.quizId };
}

export async function updateQuizSettings(
  ...args: Parameters<typeof updateQuizSettingsImpl>
): Promise<ActionResult<void>> {
  return toResult(() => updateQuizSettingsImpl(...args));
}

/** Window and shuffle settings -- safe to change at any time, even after attempts exist. */
async function updateQuizSettingsImpl(input: {
  quizId: string;
  topicId: string;
  opensAt: string | null;
  closesAt: string | null;
  shuffleQuestions: boolean;
}) {
  await requireUser();
  if (input.opensAt && input.closesAt && Date.parse(input.closesAt) <= Date.parse(input.opensAt)) {
    throw new Error("The quiz must close after it opens.");
  }
  const supabase = createClient();
  // RLS (quizzes_write_staff) restricts this to the quiz's subject staff.
  const { error } = await supabase
    .from("quizzes")
    .update({
      opens_at: input.opensAt,
      closes_at: input.closesAt,
      shuffle_questions: input.shuffleQuestions,
    })
    .eq("id", input.quizId);
  if (error) throwDbError(error);
  revalidatePath(`/dashboard/teacher/notes/${input.topicId}/quizzes`);
}

export async function setQuizPublished(
  ...args: Parameters<typeof setQuizPublishedImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof setQuizPublishedImpl>>>> {
  return toResult(() => setQuizPublishedImpl(...args));
}

async function setQuizPublishedImpl(quizId: string, published: boolean) {
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

export async function startQuizAttempt(
  ...args: Parameters<typeof startQuizAttemptImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof startQuizAttemptImpl>>>> {
  return toResult(() => startQuizAttemptImpl(...args));
}

async function startQuizAttemptImpl(quizId: string) {
  const { id: studentId } = await requireUser();
  const supabase = createClient();

  // One attempt per student per quiz (quiz_attempts_quiz_student_unique,
  // 0018) -- look up-or-resume rather than blindly inserting, since a
  // second insert would now hit that constraint.
  const { data: existing } = await supabase
    .from("quiz_attempts")
    .select("id, submitted_at")
    .eq("quiz_id", quizId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (existing) {
    if (existing.submitted_at) throw new Error("You've already completed this quiz.");
    return { attemptId: existing.id };
  }

  const { data: attempt, error } = await supabase
    .from("quiz_attempts")
    .insert({ quiz_id: quizId, student_id: studentId })
    .select("id")
    .single();
  if (error) throwDbError(error);
  return { attemptId: attempt!.id };
}

export async function answerQuizQuestion(
  ...args: Parameters<typeof answerQuizQuestionImpl>
): Promise<ActionResult<void>> {
  return toResult(() => answerQuizQuestionImpl(...args));
}

const MAX_TEXT_ANSWER = 20000;

/**
 * Saves one answer. Exactly the field for the question's type is stored and
 * the others are cleared, so switching between answers never leaves stale
 * data from another type on the row. The database trigger (0027) rejects
 * writes after submission or after the window closes, and discards any
 * grading columns -- this can only ever record the student's own answer.
 */
async function answerQuizQuestionImpl(input: {
  attemptId: string;
  questionId: string;
  optionId?: string | null;
  textAnswer?: string | null;
  matchingAnswer?: Record<string, string> | null;
}) {
  if (input.textAnswer != null && input.textAnswer.length > MAX_TEXT_ANSWER) {
    throw new Error(`Answers can be at most ${MAX_TEXT_ANSWER.toLocaleString()} characters.`);
  }
  const supabase = createClient();
  // RLS (quiz_answers_own) restricts writes to the attempt's own student.
  const { error } = await supabase.from("quiz_answers").upsert(
    {
      attempt_id: input.attemptId,
      question_id: input.questionId,
      option_id: input.optionId ?? null,
      text_answer: input.textAnswer ?? null,
      matching_answer: input.matchingAnswer ?? null,
    },
    { onConflict: "attempt_id,question_id" }
  );
  if (error) throwDbError(error);
}

export async function submitQuizAttempt(
  ...args: Parameters<typeof submitQuizAttemptImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof submitQuizAttemptImpl>>>> {
  return toResult(() => submitQuizAttemptImpl(...args));
}

async function submitQuizAttemptImpl(attemptId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("submit_quiz_attempt", { p_attempt_id: attemptId });
  if (error) throwDbError(error);
  return data?.[0] as { score: number; total_points: number; needs_grading: boolean } | undefined;
}

export async function gradeEssayAnswer(
  ...args: Parameters<typeof gradeEssayAnswerImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof gradeEssayAnswerImpl>>>> {
  return toResult(() => gradeEssayAnswerImpl(...args));
}

async function gradeEssayAnswerImpl(input: {
  attemptId: string;
  questionId: string;
  points: number;
  feedback?: string;
  topicId: string;
  quizId: string;
}) {
  const { id: userId } = await requireUser();
  if (!Number.isFinite(input.points) || input.points < 0) throw new Error("Enter a score of 0 or more.");
  const supabase = createClient();
  // The function checks the caller is staff for the quiz, the answer is an
  // essay, and 0 <= points <= the question's maximum, then rescores the attempt.
  const { data, error } = await supabase.rpc("grade_essay_answer", {
    p_attempt_id: input.attemptId,
    p_question_id: input.questionId,
    p_points: input.points,
    p_feedback: input.feedback ?? null,
  });
  if (error) throwDbError(error);
  await writeAuditLog({
    actorId: userId,
    action: "quiz.grade_essay",
    targetType: "quiz_attempt",
    targetId: input.attemptId,
  });
  revalidatePath(`/dashboard/teacher/notes/${input.topicId}/quizzes/${input.quizId}/grade`);
  revalidatePath(`/dashboard/teacher/notes/${input.topicId}/quizzes`);
  return data?.[0] as { score: number; total_points: number; needs_grading: boolean } | undefined;
}
