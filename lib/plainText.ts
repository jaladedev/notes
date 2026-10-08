/**
 * Markdown -> readable plain text, for places that show a note as a short
 * line of prose (search result snippets). Notes are stored as markdown --
 * headings, **bold**, tables, `[[resource:UUID]]` markers, `:::tip` callouts
 * -- and showing that source verbatim reads like code.
 *
 * Unlike stripMarkdownForDiff (lib/diff.ts), which keeps short labels so a
 * version diff can still see *which* resource changed, this drops markers
 * entirely: a snippet should contain only words a student would read.
 */

export function markdownToPlainText(source: string): string {
  // Stored notes have CRLF line endings; normalise so ^/$ anchors behave.
  let t = source.replace(/\r\n?/g, "\n");

  // Embedded resource / assessment / linked-topic markers: drop completely.
  t = t.replace(/\[\[(?:resource|assessment|topic):[^\]]*\]\]/g, " ");

  // Fenced code blocks: keep the code text, drop the fences and language tag.
  t = t.replace(/^```[^\n]*$/gm, " ");

  // Callout fences (":::tip" ... ":::"): drop the fence lines, keep content.
  t = t.replace(/^:::\w*\s*$/gm, " ");

  // Math. The LaTeX source is unreadable as prose, so leave it out.
  t = t.replace(/\$\$[\s\S]*?\$\$/g, " ");
  t = t.replace(/\$[^$\n]+\$/g, " ");

  // Raw HTML tags and the common entities.
  t = t.replace(/<[^>]*>/g, " ");
  t = t
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Tables: drop the |---|---| separator row, then turn pipes into " · ".
  t = t.replace(/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/gm, " ");
  t = t.replace(/^\s*\|(.*)\|\s*$/gm, (_m, row: string) =>
    row
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean)
      .join(" · ")
  );

  // Images are dropped (alt text is rarely prose); links keep their text.
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

  // Block-level markers.
  t = t.replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/^\s*>\s?/gm, "");
  t = t.replace(/^(\s*)[-*+]\s+\[[ xX]\]\s+/gm, "$1"); // task-list boxes
  t = t.replace(/^(\s*)[-*+]\s+/gm, "$1");
  t = t.replace(/^(\s*)\d+[.)]\s+/gm, "$1");
  t = t.replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, " ");

  // Inline emphasis. Asterisks may sit inside a word (c**a**t -> cat).
  // Underscores are only emphasis at word boundaries, so snake_case_names
  // and file_names.pdf survive intact.
  t = t.replace(/(\*\*\*|\*\*|\*)(?=\S)([\s\S]*?\S)\1/g, "$2");
  t = t.replace(/(^|[^\w])(___|__|_)(?=\S)([^_\n]*?\S)\2(?=[^\w]|$)/g, "$1$3");
  t = t.replace(/~~([^~]+)~~/g, "$1");
  t = t.replace(/`([^`]+)`/g, "$1");

  // Anything left over from unbalanced markers, then collapse whitespace.
  t = t.replace(/\*{2,}/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

/** Words worth highlighting from a websearch-style query ("a b" OR -c "d e"). */
export function queryTerms(query: string): string[] {
  return query
    .replace(/"/g, " ")
    .split(/\s+/)
    .filter((w) => w && w.toLowerCase() !== "or" && !w.startsWith("-"))
    .map((w) => w.toLowerCase())
    .filter((w) => w.length >= 2);
}

// Postgres' "english" text search stems words ("living" also matches "live",
// "lives"), so an exact substring test can miss the hit. Fall back to a
// shortened prefix so the snippet still lands on the matching passage.
function findMatchIndex(lowerText: string, terms: string[]): number {
  let best = -1;
  for (const term of terms) {
    let i = lowerText.indexOf(term);
    if (i === -1 && term.length > 4) {
      i = lowerText.indexOf(term.slice(0, Math.max(4, term.length - 3)));
    }
    if (i !== -1 && (best === -1 || i < best)) best = i;
  }
  return best;
}

/** A short plain-text excerpt of a note centred on the first match. */
export function buildSnippet(markdown: string, query: string, radius = 90): string {
  const plain = markdownToPlainText(markdown);
  const index = findMatchIndex(plain.toLowerCase(), queryTerms(query));
  if (index === -1) {
    return plain.length > radius * 2 ? `${plain.slice(0, radius * 2).trimEnd()}…` : plain;
  }
  let start = Math.max(0, index - radius);
  let end = Math.min(plain.length, index + radius);
  // Don't start or stop mid-word.
  if (start > 0) {
    const space = plain.indexOf(" ", start);
    if (space !== -1 && space < index) start = space + 1;
  }
  if (end < plain.length) {
    const space = plain.lastIndexOf(" ", end);
    if (space > index) end = space;
  }
  return `${start > 0 ? "…" : ""}${plain.slice(start, end).trim()}${end < plain.length ? "…" : ""}`;
}

/** Splits text into [{text, match}] runs so the UI can wrap matches in <mark>. */
export function splitForHighlight(text: string, query: string): { text: string; match: boolean }[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [{ text, match: false }];
  const escaped = terms
    .sort((a, b) => b.length - a.length)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // A capturing group makes split() put the matches at odd indices.
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  return text
    .split(re)
    .map((part, i) => ({ text: part, match: i % 2 === 1 }))
    .filter((part) => part.text !== "");
}
