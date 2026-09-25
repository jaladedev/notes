import { describe, expect, it } from "vitest";
import { computeWordDiff, stripMarkdownForDiff } from "@/lib/diff";

function reconstruct(tokens: ReturnType<typeof computeWordDiff>, keep: ("equal" | "added")[]) {
  return tokens
    .filter((t) => keep.includes(t.type as any))
    .map((t) => t.text)
    .join("");
}

describe("computeWordDiff", () => {
  it("returns a single equal token for identical text", () => {
    const tokens = computeWordDiff("the quick fox", "the quick fox");
    expect(tokens).toEqual([{ type: "equal", text: "the quick fox" }]);
  });

  it("marks an inserted word as added without disturbing the rest", () => {
    const tokens = computeWordDiff("the fox jumps", "the quick fox jumps");
    expect(tokens.some((t) => t.type === "added" && t.text.includes("quick"))).toBe(true);
    // Reconstructing from equal+added tokens should give back the new text exactly.
    expect(reconstruct(tokens, ["equal", "added"])).toBe("the quick fox jumps");
  });

  it("marks a removed word as removed", () => {
    const tokens = computeWordDiff("the quick fox jumps", "the fox jumps");
    expect(tokens.some((t) => t.type === "removed" && t.text.includes("quick"))).toBe(true);
  });

  it("handles a full word replacement (both words removed, both words added)", () => {
    const tokens = computeWordDiff("hello world", "goodbye moon");
    // The single space between the two words is identical on both
    // sides, so it correctly comes back as "equal" -- only the actual
    // words should be removed/added.
    expect(tokens.some((t) => t.type === "removed" && t.text.includes("hello"))).toBe(true);
    expect(tokens.some((t) => t.type === "removed" && t.text.includes("world"))).toBe(true);
    expect(tokens.some((t) => t.type === "added" && t.text.includes("goodbye"))).toBe(true);
    expect(tokens.some((t) => t.type === "added" && t.text.includes("moon"))).toBe(true);
    expect(reconstruct(tokens, ["equal", "added"])).toBe("goodbye moon");
  });

  it("handles empty strings without throwing", () => {
    expect(computeWordDiff("", "")).toEqual([]);
    expect(computeWordDiff("", "new text")).toEqual([{ type: "added", text: "new text" }]);
    expect(computeWordDiff("old text", "")).toEqual([{ type: "removed", text: "old text" }]);
  });

  it("preserves original spacing so concatenating equal+added tokens round-trips exactly", () => {
    const oldText = "line one\n\nline two with  double space";
    const newText = "line one\n\nline two with  double space, extended";
    const tokens = computeWordDiff(oldText, newText);
    expect(reconstruct(tokens, ["equal", "added"])).toBe(newText);
  });
});

describe("stripMarkdownForDiff", () => {
  it("drops heading markers but keeps the heading text", () => {
    expect(stripMarkdownForDiff("## States of matter")).toBe("States of matter");
  });

  it("unwraps bold, italic, and bold-italic text", () => {
    expect(stripMarkdownForDiff("**bold** and *italic* and ***both***")).toBe(
      "bold and italic and both"
    );
    expect(stripMarkdownForDiff("__bold__ and _italic_")).toBe("bold and italic");
  });

  it("unwraps inline code", () => {
    expect(stripMarkdownForDiff("run `npm install` first")).toBe("run npm install first");
  });

  it("keeps link/image text and drops the url", () => {
    expect(stripMarkdownForDiff("see [the docs](https://example.com/docs)")).toBe("see the docs");
    expect(stripMarkdownForDiff("![a diagram](https://example.com/img.png)")).toBe(
      "[Image: a diagram]"
    );
    expect(stripMarkdownForDiff("![](https://example.com/img.png)")).toBe("[Image]");
  });

  it("drops blockquote and list markers without losing the content", () => {
    expect(stripMarkdownForDiff("> a quoted line")).toBe("a quoted line");
    expect(stripMarkdownForDiff("- first\n- second")).toBe("first\nsecond");
    expect(stripMarkdownForDiff("1. first\n2. second")).toBe("first\nsecond");
    expect(stripMarkdownForDiff("- [ ] todo\n- [x] done")).toBe("todo\ndone");
  });

  it("drops horizontal rules", () => {
    expect(stripMarkdownForDiff("above\n\n---\n\nbelow")).toBe("above\n\nbelow");
  });

  it("keeps LaTeX source but drops the $ / $$ delimiters", () => {
    expect(stripMarkdownForDiff("the formula $x^2 + y^2 = z^2$ here")).toBe(
      "the formula [Math: x^2 + y^2 = z^2] here"
    );
    expect(stripMarkdownForDiff("\n$$\nx^2 + y^2 = z^2\n$$\n")).toBe("\n[Math: x^2 + y^2 = z^2]\n");
  });

  it("replaces resource/assessment/topic markers with a short readable label", () => {
    expect(stripMarkdownForDiff("[[resource:8f14e45fceea167a5a36dedd4bea2543]]")).toBe(
      "[Resource 8f14e45f]"
    );
    expect(stripMarkdownForDiff("[[resource:8f14e45fceea167a5a36dedd4bea2543#full]]")).toBe(
      "[Resource 8f14e45f]"
    );
    expect(stripMarkdownForDiff("[[assessment:8f14e45fceea167a5a36dedd4bea2543]]")).toBe(
      "[Assessment 8f14e45f]"
    );
    expect(stripMarkdownForDiff("[[topic:8f14e45fceea167a5a36dedd4bea2543]]")).toBe(
      "[Linked topic 8f14e45f]"
    );
  });

  it("still shows a resource swap as a change, since different ids keep different short labels", () => {
    const before = stripMarkdownForDiff("[[resource:8f14e45fceea167a5a36dedd4bea2543]]");
    const after = stripMarkdownForDiff("[[resource:aaaaaaaaceea167a5a36dedd4bea2543]]");
    expect(before).not.toBe(after);
  });

  it("leaves plain prose completely untouched", () => {
    const prose = "Photosynthesis converts light energy into chemical energy.";
    expect(stripMarkdownForDiff(prose)).toBe(prose);
  });
});
