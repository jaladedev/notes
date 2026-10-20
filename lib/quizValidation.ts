// Validation for a quiz definition, shared by the builder UI (friendly
// inline messages), the server actions (never trust the client) and --
// as a database-level safety net -- quiz_insert_questions() in 0029.
// Keep the three in step. Pure: no React, no Supabase.

export type QuizQuestionType = "single_choice" | "fill_blank" | "matching" | "essay";

export const QUESTION_TYPE_LABELS: Record<QuizQuestionType, string> = {
  single_choice: "Multiple choice",
  fill_blank: "Fill in the blank",
  matching: "Matching",
  essay: "Essay",
};

export type QuizOptionInput = {
  /** single_choice: the option text. fill_blank: an accepted answer. matching: the left-hand term. */
  label: string;
  /** single_choice only. */
  isCorrect?: boolean;
  /** matching only: the right-hand term that pairs with `label`. */
  matchText?: string;
};

export type QuizQuestionInput = {
  type: QuizQuestionType;
  prompt: string;
  points: number;
  options: QuizOptionInput[];
};

export type QuizInput = {
  title: string;
  timeLimitSeconds?: number | null;
  opensAt?: string | null;
  closesAt?: string | null;
  questions: QuizQuestionInput[];
};

export const MAX_OPTIONS = 6;
export const MAX_QUESTIONS = 100;
export const MAX_POINTS = 1000;

/** Same normalisation the database uses when auto-scoring (quiz_normalize_text). */
export function normalizeAnswer(text: string | null | undefined): string {
  return (text ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function hasDuplicates(values: string[]): boolean {
  const seen = new Set<string>();
  for (const v of values) {
    const key = normalizeAnswer(v);
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

/** Returns a human-readable problem with one question, or null if it is valid. */
export function validateQuestion(q: QuizQuestionInput, index: number): string | null {
  const n = index + 1;
  if (!q.prompt.trim()) return `Question ${n} needs a prompt.`;
  if (!Number.isFinite(q.points) || q.points <= 0) return `Question ${n} must be worth more than 0 points.`;
  if (q.points > MAX_POINTS) return `Question ${n} can be worth at most ${MAX_POINTS} points.`;

  switch (q.type) {
    case "single_choice": {
      if (q.options.length < 2) return `Question ${n} needs at least 2 options.`;
      if (q.options.length > MAX_OPTIONS) return `Question ${n} can have at most ${MAX_OPTIONS} options.`;
      if (q.options.some((o) => !o.label.trim())) return `Every option in question ${n} needs text.`;
      if (hasDuplicates(q.options.map((o) => o.label))) return `Question ${n} has two identical options.`;
      if (q.options.filter((o) => o.isCorrect).length !== 1) return `Question ${n} needs exactly one correct option.`;
      return null;
    }
    case "fill_blank": {
      if (q.options.length < 1) return `Question ${n} needs at least one accepted answer.`;
      if (q.options.length > MAX_OPTIONS) return `Question ${n} can have at most ${MAX_OPTIONS} accepted answers.`;
      if (q.options.some((o) => !o.label.trim())) return `Every accepted answer in question ${n} needs text.`;
      return null;
    }
    case "matching": {
      if (q.options.length < 2) return `Question ${n} needs at least 2 pairs.`;
      if (q.options.length > MAX_OPTIONS) return `Question ${n} can have at most ${MAX_OPTIONS} pairs.`;
      if (q.options.some((o) => !o.label.trim() || !(o.matchText ?? "").trim())) {
        return `Every pair in question ${n} needs both sides filled in.`;
      }
      // Duplicate terms make the key ambiguous: two left terms with the same
      // text, or two pairs sharing a right-hand term, can't be scored fairly.
      if (hasDuplicates(q.options.map((o) => o.label))) return `Question ${n} repeats a left-hand term.`;
      if (hasDuplicates(q.options.map((o) => o.matchText ?? ""))) return `Question ${n} repeats a right-hand term.`;
      return null;
    }
    case "essay":
      return null;
    default:
      return `Question ${n} has an unknown type.`;
  }
}

/** Returns the first problem with the whole quiz, or null if it can be saved. */
export function validateQuiz(input: QuizInput): string | null {
  if (!input.title.trim()) return "A quiz needs a title.";
  if (input.timeLimitSeconds != null && (!Number.isFinite(input.timeLimitSeconds) || input.timeLimitSeconds < 60)) {
    return "The time limit must be at least 1 minute.";
  }
  if (input.opensAt && input.closesAt) {
    const opens = Date.parse(input.opensAt);
    const closes = Date.parse(input.closesAt);
    if (Number.isNaN(opens) || Number.isNaN(closes)) return "That schedule isn't a valid date.";
    if (closes <= opens) return "The quiz must close after it opens.";
  }
  if (input.questions.length === 0) return "A quiz needs at least one question.";
  if (input.questions.length > MAX_QUESTIONS) return `A quiz can have at most ${MAX_QUESTIONS} questions.`;
  for (const [i, q] of input.questions.entries()) {
    const problem = validateQuestion(q, i);
    if (problem) return problem;
  }
  return null;
}

/** Shapes questions for the create_quiz_with_questions / replace_quiz_questions RPCs. */
export function toRpcQuestions(questions: QuizQuestionInput[]) {
  return questions.map((q) => ({
    type: q.type,
    prompt: q.prompt.trim(),
    points: q.points,
    options:
      q.type === "essay"
        ? []
        : q.options.map((o) => ({
            label: o.label.trim(),
            isCorrect: q.type === "single_choice" ? Boolean(o.isCorrect) : true,
            matchText: q.type === "matching" ? (o.matchText ?? "").trim() : undefined,
          })),
  }));
}

/** A blank question of the given type, for the builder. */
export function emptyQuestion(type: QuizQuestionType = "single_choice"): QuizQuestionInput {
  switch (type) {
    case "single_choice":
      return { type, prompt: "", points: 1, options: [{ label: "", isCorrect: true }, { label: "", isCorrect: false }] };
    case "fill_blank":
      return { type, prompt: "", points: 1, options: [{ label: "" }] };
    case "matching":
      return { type, prompt: "", points: 1, options: [{ label: "", matchText: "" }, { label: "", matchText: "" }] };
    case "essay":
      return { type, prompt: "", points: 5, options: [] };
  }
}
