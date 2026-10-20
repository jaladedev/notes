// Decides how a search box value is searched. Pure so it can be tested.

/** True when the user typed phrase/operator syntax that prefix matching would destroy. */
export function usesPhraseSyntax(input: string): boolean {
  return input.includes('"') || /(^|\s)-\S/.test(input) || /\sor\s/i.test(input);
}

/**
 * Mirrors the term extraction in search_topic_notes_prefix() (0032): lower-
 * cased words made of letters/digits only, at most 8. Used to build the
 * result snippet around the same words that matched.
 */
export function extractSearchTerms(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
}
