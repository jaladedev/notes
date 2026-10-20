import { describe, expect, it } from "vitest";
import { extractSearchTerms, usesPhraseSyntax } from "@/lib/searchQuery";

describe("usesPhraseSyntax", () => {
  it("is false for plain words", () => {
    expect(usesPhraseSyntax("photo")).toBe(false);
    expect(usesPhraseSyntax("cell division")).toBe(false);
    expect(usesPhraseSyntax("well-known")).toBe(false); // hyphen inside a word is not an exclusion
  });
  it("detects quotes, exclusions and 'or'", () => {
    expect(usesPhraseSyntax('"cell wall"')).toBe(true);
    expect(usesPhraseSyntax("cell -animal")).toBe(true);
    expect(usesPhraseSyntax("mitosis or meiosis")).toBe(true);
  });
});

describe("extractSearchTerms", () => {
  it("lower-cases, strips punctuation and splits on whitespace", () => {
    expect(extractSearchTerms("  Photo,  SYNTH!  ")).toEqual(["photo", "synth"]);
  });
  it("keeps non-latin letters and digits", () => {
    expect(extractSearchTerms("é2 naïve")).toEqual(["é2", "naïve"]);
  });
  it("caps at 8 terms, like the database function", () => {
    expect(extractSearchTerms("a b c d e f g h i j")).toHaveLength(8);
  });
  it("returns nothing for punctuation only", () => {
    expect(extractSearchTerms("!!! ???")).toEqual([]);
  });
});
