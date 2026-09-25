/**
 * Word-level diff between two strings, using the classic LCS
 * (longest-common-subsequence) approach. No external dependency --
 * lesson-note bodies are short enough (a handful of paragraphs of
 * markdown, not whole documents) that an O(n*m) DP table is fine, and
 * pulling in a diff library for one feature felt like overkill.
 *
 * Tokenizing on `/(\s+)/` (a capturing split) keeps whitespace runs as
 * their own tokens interleaved with word tokens, so the diff is legible
 * for prose/markdown and the original spacing reconstructs exactly when
 * you concatenate all tokens back together.
 */

export type DiffToken = {
  type: "equal" | "added" | "removed";
  text: string;
};

/**
 * Converts a note's stored markdown source into plain, readable prose
 * before it's diffed -- so "Compare versions" shows what a teacher
 * actually wrote/changed, not markdown syntax (##, **, `[[resource:UUID]]`
 * markers, etc.) styled like source code. This runs *before*
 * computeWordDiff, not inside it: the diff algorithm itself stays exactly
 * as it was (and tests/diff.test.ts, which tests computeWordDiff
 * directly with plain strings, is unaffected either way) -- this is
 * purely "what text do we hand it", not a change to how diffing works.
 *
 * Deliberately not a full markdown-to-rendered-DOM pipeline (i.e. not
 * running this through react-markdown and diffing rendered output):
 * diffing two rendered trees is a meaningfully harder problem than
 * diffing two strings, and word-level text diffing on cleaned-up prose
 * already gets a teacher 95% of the way to "what changed" without that
 * complexity. Headings/bold/etc. lose their visual distinction in the
 * comparison view as a result -- acceptable tradeoff for "read what
 * changed", not meant to double as a formatted preview.
 */
export function stripMarkdownForDiff(text: string): string {
  let result = text;

  // Resource/assessment/topic markers ([[resource:UUID#suffix]] etc,
  // see lib/tiptap/resource-node.tsx and friends for the exact syntax
  // each embeds) -- replaced with a short readable label rather than
  // dropped entirely. Keeping the first 8 chars of the id means
  // swapping *which* resource/assessment/topic is embedded still shows
  // up as a real change instead of two different UUIDs collapsing into
  // an identical "[Resource]" placeholder that the diff would then
  // treat as unchanged.
  result = result.replace(
    /\[\[resource:([0-9a-fA-F-]{8})[0-9a-fA-F-]*(?:#[\w-]+)?\]\]/g,
    (_match, shortId) => `[Resource ${shortId}]`
  );
  result = result.replace(
    /\[\[assessment:([0-9a-fA-F-]{8})[0-9a-fA-F-]*\]\]/g,
    (_match, shortId) => `[Assessment ${shortId}]`
  );
  result = result.replace(
    /\[\[topic:([0-9a-fA-F-]{8})[0-9a-fA-F-]*\]\]/g,
    (_match, shortId) => `[Linked topic ${shortId}]`
  );

  // Math (see lib/tiptap/math-nodes.tsx's markdown serializers: inline
  // is `$latex$`, block is `\n$$\nlatex\n$$\n`) -- keep the LaTeX source
  // itself (rendering it through KaTeX for a text diff is out of scope)
  // but drop the $ / $$ delimiter noise around it.
  result = result.replace(
    /\$\$\n?([\s\S]*?)\n?\$\$/g,
    (_match, latex) => `[Math: ${latex.trim()}]`
  );
  result = result.replace(/\$([^$\n]+)\$/g, (_match, latex) => `[Math: ${latex.trim()}]`);

  // Headings -- drop the leading #'s, keep the text as a plain line.
  result = result.replace(/^#{1,6}\s+/gm, "");

  // Bold/italic -- order matters, strongest marker first, or "***x***"
  // would only have its outer ** stripped by the "**" rule and leave a
  // stray "*x*" behind for the "*" rule to (correctly, but confusingly)
  // clean up in a second pass instead of one.
  result = result.replace(/(\*\*\*|___)([^*_]+?)\1/g, "$2");
  result = result.replace(/(\*\*|__)([^*_]+?)\1/g, "$2");
  result = result.replace(/(\*|_)([^*_]+?)\1/g, "$2");

  // Inline code
  result = result.replace(/`([^`]+)`/g, "$1");

  // Images -- alt text only, url dropped (a signed/relative storage
  // path in a diff is noise, not something a teacher is comparing).
  result = result.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_match, alt) =>
    alt ? `[Image: ${alt}]` : "[Image]"
  );

  // Links -- link text only, url dropped, same reasoning as images.
  result = result.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

  // Blockquote markers
  result = result.replace(/^>\s?/gm, "");

  // Task list checkboxes -- must run before the plain bullet-list rule
  // below, or "- [ ] Do the thing" would only have its "- " stripped,
  // leaving a stray "[ ] " in the prose.
  result = result.replace(/^(\s*)[-*+]\s+\[[ xX]\]\s+/gm, "$1");

  // Bullet/numbered list markers
  result = result.replace(/^(\s*)[-*+]\s+/gm, "$1");
  result = result.replace(/^(\s*)\d+\.\s+/gm, "$1");

  // Horizontal rules
  result = result.replace(/^(?:-{3,}|\*{3,}|_{3,})\s*$/gm, "");

  // Collapse the runs of 3+ blank lines that stripped headings/rules/etc.
  // tend to leave behind, down to a single blank line between paragraphs.
  result = result.replace(/\n{3,}/g, "\n\n");

  return result;
}

function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((t) => t.length > 0);
}

export function computeWordDiff(oldText: string, newText: string): DiffToken[] {
  const a = tokenize(oldText);
  const b = tokenize(newText);

  // Word-level LCS is O(n*m) in both time and table memory. A lesson
  // note is normally a few paragraphs (low hundreds of tokens), but
  // nothing stops someone from pasting a huge document in -- cap the
  // word-level table size and fall back to a much cheaper line-level
  // diff rather than risk hanging the request or exhausting memory.
  if (a.length * b.length > 4_000_000) {
    return computeLineDiff(oldText, newText);
  }

  return diffTokens(a, b);
}

/** Coarser fallback for oversized inputs: whole lines as tokens instead of words. */
function computeLineDiff(oldText: string, newText: string): DiffToken[] {
  const a = oldText.split(/(\n)/).filter((t) => t.length > 0);
  const b = newText.split(/(\n)/).filter((t) => t.length > 0);
  return diffTokens(a, b);
}

function diffTokens(a: string[], b: string[]): DiffToken[] {
  const n = a.length;
  const m = b.length;

  // dp[i][j] = length of the LCS of a[i:] and b[j:]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const tokens: DiffToken[] = [];
  // Merge adjacent tokens of the same type as we walk the DP table, so
  // "removed" runs and "added" runs render as single contiguous spans
  // instead of one <span> per word.
  function push(type: DiffToken["type"], text: string) {
    const last = tokens[tokens.length - 1];
    if (last && last.type === type) {
      last.text += text;
    } else {
      tokens.push({ type, text });
    }
  }

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push("equal", a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push("removed", a[i]);
      i++;
    } else {
      push("added", b[j]);
      j++;
    }
  }
  while (i < n) {
    push("removed", a[i]);
    i++;
  }
  while (j < m) {
    push("added", b[j]);
    j++;
  }

  return tokens;
}
