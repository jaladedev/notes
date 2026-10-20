import { describe, expect, it } from "vitest";
import { orderQuestionsForAttempt, seededShuffle } from "@/lib/quizShuffle";

const items = Array.from({ length: 12 }, (_, i) => i);

describe("seededShuffle", () => {
  it("is deterministic for the same seed", () => {
    expect(seededShuffle(items, "attempt-1")).toEqual(seededShuffle(items, "attempt-1"));
  });
  it("differs between seeds", () => {
    expect(seededShuffle(items, "attempt-1")).not.toEqual(seededShuffle(items, "attempt-2"));
  });
  it("is a permutation and does not mutate the input", () => {
    const copy = [...items];
    const out = seededShuffle(items, "x");
    expect(items).toEqual(copy);
    expect([...out].sort((a, b) => a - b)).toEqual(items);
  });
  it("handles empty and single-item lists", () => {
    expect(seededShuffle([], "x")).toEqual([]);
    expect(seededShuffle([1], "x")).toEqual([1]);
  });
});

describe("orderQuestionsForAttempt", () => {
  const qs = [
    { id: "c", sequence_order: 2 },
    { id: "a", sequence_order: 0 },
    { id: "b", sequence_order: 1 },
  ];
  it("uses authored order when shuffling is off", () => {
    expect(orderQuestionsForAttempt(qs, "att", false).map((q) => q.id)).toEqual(["a", "b", "c"]);
  });
  it("is stable per attempt and keeps every question when shuffling is on", () => {
    const first = orderQuestionsForAttempt(qs, "att", true).map((q) => q.id);
    expect(orderQuestionsForAttempt(qs, "att", true).map((q) => q.id)).toEqual(first);
    expect([...first].sort()).toEqual(["a", "b", "c"]);
  });
});
