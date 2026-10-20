import { describe, expect, it } from "vitest";
import {
  emptyQuestion,
  normalizeAnswer,
  toRpcQuestions,
  validateQuestion,
  validateQuiz,
  type QuizQuestionInput,
} from "@/lib/quizValidation";

const mcq = (over: Partial<QuizQuestionInput> = {}): QuizQuestionInput => ({
  type: "single_choice",
  prompt: "Pick",
  points: 1,
  options: [
    { label: "A", isCorrect: true },
    { label: "B", isCorrect: false },
  ],
  ...over,
});

describe("normalizeAnswer", () => {
  it("trims, collapses whitespace and lower-cases (matches quiz_normalize_text)", () => {
    expect(normalizeAnswer("  Photo   SYNTHESIS \n")).toBe("photo synthesis");
    expect(normalizeAnswer(null)).toBe("");
  });
});

describe("single_choice", () => {
  it("accepts a well-formed question", () => {
    expect(validateQuestion(mcq(), 0)).toBeNull();
  });
  it("needs exactly one correct option", () => {
    expect(
      validateQuestion(mcq({ options: [{ label: "A", isCorrect: true }, { label: "B", isCorrect: true }] }), 0)
    ).toMatch(/exactly one correct/);
    expect(
      validateQuestion(mcq({ options: [{ label: "A", isCorrect: false }, { label: "B", isCorrect: false }] }), 0)
    ).toMatch(/exactly one correct/);
  });
  it("rejects blank, duplicate, too few or too many options", () => {
    expect(validateQuestion(mcq({ options: [{ label: "A", isCorrect: true }] }), 0)).toMatch(/at least 2/);
    expect(
      validateQuestion(mcq({ options: [{ label: "A", isCorrect: true }, { label: " ", isCorrect: false }] }), 0)
    ).toMatch(/needs text/);
    expect(
      validateQuestion(mcq({ options: [{ label: "A", isCorrect: true }, { label: " a ", isCorrect: false }] }), 0)
    ).toMatch(/identical/);
    const many = Array.from({ length: 7 }, (_, i) => ({ label: `o${i}`, isCorrect: i === 0 }));
    expect(validateQuestion(mcq({ options: many }), 0)).toMatch(/at most 6/);
  });
});

describe("fill_blank", () => {
  it("needs at least one non-blank accepted answer", () => {
    const base = emptyQuestion("fill_blank");
    expect(validateQuestion({ ...base, prompt: "x ___" }, 0)).toMatch(/needs text/);
    expect(validateQuestion({ ...base, prompt: "x ___", options: [{ label: "yes" }] }, 0)).toBeNull();
    expect(validateQuestion({ ...base, prompt: "x ___", options: [] }, 0)).toMatch(/at least one/);
  });
});

describe("matching", () => {
  const pair = (label: string, matchText: string) => ({ label, matchText });
  const m = (options: ReturnType<typeof pair>[]): QuizQuestionInput => ({
    type: "matching",
    prompt: "Match",
    points: 2,
    options,
  });
  it("accepts distinct pairs", () => {
    expect(validateQuestion(m([pair("Leaf", "Photosynthesis"), pair("Root", "Absorption")]), 0)).toBeNull();
  });
  it("needs 2+ complete pairs", () => {
    expect(validateQuestion(m([pair("Leaf", "Photosynthesis")]), 0)).toMatch(/at least 2/);
    expect(validateQuestion(m([pair("Leaf", ""), pair("Root", "Absorption")]), 0)).toMatch(/both sides/);
  });
  it("rejects a repeated term on either side (ambiguous key)", () => {
    expect(validateQuestion(m([pair("Leaf", "A"), pair("leaf", "B")]), 0)).toMatch(/left-hand/);
    expect(validateQuestion(m([pair("Leaf", "A"), pair("Root", " a ")]), 0)).toMatch(/right-hand/);
  });
});

describe("essay and shared rules", () => {
  it("an essay needs only a prompt and positive points", () => {
    expect(validateQuestion(emptyQuestion("essay"), 0)).toMatch(/prompt/);
    expect(validateQuestion({ ...emptyQuestion("essay"), prompt: "Discuss" }, 0)).toBeNull();
    expect(validateQuestion({ ...emptyQuestion("essay"), prompt: "Discuss", points: 0 }, 0)).toMatch(/more than 0/);
    expect(validateQuestion({ ...emptyQuestion("essay"), prompt: "Discuss", points: NaN }, 0)).toMatch(/more than 0/);
  });
  it("numbers messages from 1", () => {
    expect(validateQuestion(mcq({ prompt: "" }), 2)).toMatch(/Question 3/);
  });
});

describe("validateQuiz", () => {
  const ok = { title: "T", questions: [mcq()] };
  it("accepts a valid quiz", () => {
    expect(validateQuiz(ok)).toBeNull();
  });
  it("requires a title and at least one question", () => {
    expect(validateQuiz({ ...ok, title: "  " })).toMatch(/title/);
    expect(validateQuiz({ ...ok, questions: [] })).toMatch(/at least one question/);
  });
  it("rejects a time limit under a minute", () => {
    expect(validateQuiz({ ...ok, timeLimitSeconds: 30 })).toMatch(/1 minute/);
    expect(validateQuiz({ ...ok, timeLimitSeconds: 600 })).toBeNull();
  });
  it("requires the window to close after it opens", () => {
    expect(
      validateQuiz({ ...ok, opensAt: "2026-08-02T10:00:00Z", closesAt: "2026-08-02T09:00:00Z" })
    ).toMatch(/close after it opens/);
    expect(
      validateQuiz({ ...ok, opensAt: "2026-08-02T10:00:00Z", closesAt: "2026-08-02T10:00:00Z" })
    ).toMatch(/close after it opens/);
    expect(validateQuiz({ ...ok, opensAt: "2026-08-02T09:00:00Z", closesAt: "2026-08-02T10:00:00Z" })).toBeNull();
    expect(validateQuiz({ ...ok, opensAt: "2026-08-02T09:00:00Z" })).toBeNull();
  });
  it("reports the first bad question", () => {
    expect(validateQuiz({ ...ok, questions: [mcq(), mcq({ prompt: "" })] })).toMatch(/Question 2/);
  });
});

describe("toRpcQuestions", () => {
  it("shapes each type for the database function", () => {
    const rpc = toRpcQuestions([
      mcq({ prompt: "  Pick  " }),
      { type: "fill_blank", prompt: "f", points: 1, options: [{ label: " yes " }] },
      { type: "matching", prompt: "m", points: 1, options: [{ label: "L", matchText: " R " }] },
      { type: "essay", prompt: "e", points: 3, options: [{ label: "stray" }] },
    ]);
    expect(rpc[0].prompt).toBe("Pick");
    expect(rpc[0].options.map((o) => o.isCorrect)).toEqual([true, false]);
    expect(rpc[1].options).toEqual([{ label: "yes", isCorrect: true, matchText: undefined }]);
    expect(rpc[2].options).toEqual([{ label: "L", isCorrect: true, matchText: "R" }]);
    expect(rpc[3].options).toEqual([]); // essays never carry options
  });
});
