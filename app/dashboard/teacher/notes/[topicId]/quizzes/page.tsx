import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { assertSubjectRole } from "@/lib/actions/authGuards";
import { getSchoolTimeZone } from "@/lib/schoolSettings";
import { describeQuizWindow } from "@/lib/quizWindow";
import type { QuizQuestionInput, QuizQuestionType } from "@/lib/quizValidation";
import { QuizBuilderForm } from "@/components/quizzes/QuizBuilderForm";
import { EditQuizPanel } from "@/components/quizzes/EditQuizPanel";
import { QuizScheduleEditor } from "@/components/quizzes/QuizScheduleEditor";
import { PublishQuizToggle } from "@/components/quizzes/PublishQuizToggle";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export default async function TeacherQuizzesPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  const supabase = createClient();

  const { data: topic } = await supabase
    .from("topics")
    .select("id, title, subject_id, subjects(name)")
    .eq("id", topicId)
    .single();
  if (!topic) notFound();

  await assertSubjectRole(topic.subject_id, ["teacher", "reviewer"]);
  const timeZone = await getSchoolTimeZone();

  const { data: quizzes } = await supabase
    .from("quizzes")
    .select(
      "id, title, published, time_limit_seconds, opens_at, closes_at, shuffle_questions, " +
        "quiz_attempts(id, submitted_at, score, total_points, needs_grading), " +
        "quiz_questions(id, prompt, points, sequence_order, question_type, quiz_options(label, is_correct, match_text, sequence_order))"
    )
    .eq("topic_id", topicId)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <div>
        <Breadcrumbs
          items={[
            { label: "Subjects", href: "/dashboard" },
            { label: (topic as any).subjects?.name ?? "Subject", href: `/dashboard/teacher/subjects/${topic.subject_id}` },
            { label: topic.title, href: `/dashboard/teacher/notes/${topicId}` },
            { label: "Quizzes" },
          ]}
        />
        <h1 className="font-display text-xl font-semibold text-ink">Quizzes</h1>
      </div>

      <QuizBuilderForm topicId={topicId} timeZone={timeZone} />

      <div className="space-y-3">
        {(quizzes ?? []).map((q: any) => {
          const attempts: any[] = q.quiz_attempts ?? [];
          const submitted = attempts.filter((a) => a.submitted_at);
          const toGrade = submitted.filter((a) => a.needs_grading).length;
          const avg =
            submitted.length > 0
              ? submitted.reduce((sum: number, a: any) => sum + (a.score ?? 0) / (a.total_points || 1), 0) / submitted.length
              : null;
          const windowLabel = describeQuizWindow(q.opens_at, q.closes_at, new Date(), timeZone);
          const hasEssay = (q.quiz_questions ?? []).some((qq: any) => qq.question_type === "essay");

          // Editing is only offered while nobody has started the quiz.
          const initial =
            attempts.length === 0
              ? {
                  quizId: q.id,
                  title: q.title,
                  timeLimitSeconds: q.time_limit_seconds,
                  opensAt: q.opens_at,
                  closesAt: q.closes_at,
                  shuffleQuestions: q.shuffle_questions,
                  questions: [...(q.quiz_questions ?? [])]
                    .sort((a: any, b: any) => a.sequence_order - b.sequence_order)
                    .map(
                      (qq: any): QuizQuestionInput => ({
                        type: qq.question_type as QuizQuestionType,
                        prompt: qq.prompt,
                        points: Number(qq.points),
                        options: [...(qq.quiz_options ?? [])]
                          .sort((a: any, b: any) => a.sequence_order - b.sequence_order)
                          .map((o: any) => ({
                            label: o.label,
                            isCorrect: qq.question_type === "single_choice" ? o.is_correct : undefined,
                            matchText: qq.question_type === "matching" ? (o.match_text ?? "") : undefined,
                          })),
                      })
                    ),
                }
              : null;

          return (
            <div key={q.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rule bg-white p-3">
              <div>
                <p className="text-sm font-medium text-ink">
                  {q.title}
                  <span
                    className={`ml-2 rounded px-1.5 py-0.5 text-xs ${
                      q.published ? "bg-leaf-soft text-leaf" : "bg-paper text-ink-soft"
                    }`}
                  >
                    {q.published ? "Published" : "Draft"}
                  </span>
                  {toGrade > 0 && (
                    <span className="ml-2 rounded bg-marigold/20 px-1.5 py-0.5 text-xs text-ink">{toGrade} to grade</span>
                  )}
                </p>
                <p className="text-xs text-ink-soft">
                  {submitted.length} attempt{submitted.length === 1 ? "" : "s"}
                  {avg !== null && ` · avg ${(avg * 100).toFixed(0)}%`}
                  {windowLabel && ` · ${windowLabel}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {hasEssay && submitted.length > 0 && (
                  <Link
                    href={`/dashboard/teacher/notes/${topicId}/quizzes/${q.id}/grade`}
                    className="rounded-lg border border-marigold px-3 py-1.5 text-xs text-ink hover:bg-marigold-soft"
                  >
                    Grade essays
                  </Link>
                )}
                {initial && <EditQuizPanel topicId={topicId} timeZone={timeZone} initial={initial} />}
                <QuizScheduleEditor
                  quizId={q.id}
                  topicId={topicId}
                  timeZone={timeZone}
                  initial={{
                    opensAt: q.opens_at,
                    closesAt: q.closes_at,
                    shuffleQuestions: q.shuffle_questions,
                  }}
                />
                <PublishQuizToggle quizId={q.id} published={q.published} />
              </div>
            </div>
          );
        })}
        {(!quizzes || quizzes.length === 0) && <p className="text-sm text-ink-soft">No quizzes for this topic yet.</p>}
      </div>
    </div>
  );
}
