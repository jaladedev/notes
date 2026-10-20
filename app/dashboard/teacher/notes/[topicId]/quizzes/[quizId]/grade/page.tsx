// Essay grading queue for one quiz: every submitted attempt's essay
// answers, ungraded first. Names come through the admin client because
// profiles RLS only lets a user read their own row.

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSubjectRole } from "@/lib/actions/authGuards";
import { EssayGradingForm } from "@/components/quizzes/EssayGradingForm";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export default async function GradeEssaysPage({
  params,
}: {
  params: Promise<{ topicId: string; quizId: string }>;
}) {
  const { topicId, quizId } = await params;
  const supabase = createClient();

  const { data: topic } = await supabase
    .from("topics")
    .select("id, title, subject_id, subjects(name)")
    .eq("id", topicId)
    .single();
  if (!topic) notFound();
  await assertSubjectRole(topic.subject_id, ["teacher", "reviewer"]);

  const { data: quiz } = await supabase.from("quizzes").select("id, title").eq("id", quizId).eq("topic_id", topicId).maybeSingle();
  if (!quiz) notFound();

  const { data: essayQuestions } = await supabase
    .from("quiz_questions")
    .select("id, prompt, points, sequence_order")
    .eq("quiz_id", quizId)
    .eq("question_type", "essay")
    .order("sequence_order", { ascending: true });

  const { data: attempts } = await supabase
    .from("quiz_attempts")
    .select("id, student_id, submitted_at, score, total_points, needs_grading, quiz_answers(question_id, text_answer, points_awarded, feedback)")
    .eq("quiz_id", quizId)
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: true });

  const studentIds = Array.from(new Set((attempts ?? []).map((a: any) => a.student_id)));
  const { data: students } = studentIds.length
    ? await createAdminClient().from("profiles").select("id, full_name").in("id", studentIds)
    : { data: [] as { id: string; full_name: string }[] };
  const nameById = new Map((students ?? []).map((s) => [s.id, s.full_name]));

  // Ungraded attempts first, then oldest submission first.
  const sorted = [...(attempts ?? [])].sort(
    (a: any, b: any) => Number(b.needs_grading) - Number(a.needs_grading) || a.submitted_at.localeCompare(b.submitted_at)
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <div>
        <Breadcrumbs
          items={[
            { label: "Subjects", href: "/dashboard" },
            { label: (topic as any).subjects?.name ?? "Subject", href: `/dashboard/teacher/subjects/${topic.subject_id}` },
            { label: topic.title, href: `/dashboard/teacher/notes/${topicId}` },
            { label: "Quizzes", href: `/dashboard/teacher/notes/${topicId}/quizzes` },
            { label: "Grade essays" },
          ]}
        />
        <h1 className="font-display text-xl font-semibold text-ink">{quiz.title} — essay grading</h1>
      </div>

      {sorted.length === 0 && <p className="text-sm text-ink-soft">No one has submitted this quiz yet.</p>}

      {sorted.map((attempt: any) => (
        <section key={attempt.id} className="space-y-3 rounded-xl border border-rule bg-paper p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">{nameById.get(attempt.student_id) ?? "Student"}</h2>
            <span className="text-xs text-ink-soft">
              {attempt.score} / {attempt.total_points}
              {attempt.needs_grading ? " (provisional)" : ""}
            </span>
          </div>
          {(essayQuestions ?? []).map((eq: any) => {
            const ans = (attempt.quiz_answers ?? []).find((a: any) => a.question_id === eq.id);
            if (!ans?.text_answer?.trim()) {
              return (
                <p key={eq.id} className="text-sm text-ink-soft">
                  {eq.prompt} — <em>no answer written (scored 0)</em>
                </p>
              );
            }
            return (
              <EssayGradingForm
                key={eq.id}
                attemptId={attempt.id}
                questionId={eq.id}
                quizId={quizId}
                topicId={topicId}
                prompt={eq.prompt}
                answer={ans.text_answer}
                maxPoints={Number(eq.points)}
                initialPoints={ans.points_awarded === null ? null : Number(ans.points_awarded)}
                initialFeedback={ans.feedback}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}
