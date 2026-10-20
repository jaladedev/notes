// Parsing and validation for the bulk parent CSV import. Pure, so it can be
// tested without Supabase. The CSV has one row per PARENT:
//
//   fullname, email, children
//   Mrs Obi, obi@example.com, ada@school.test; tunde@school.test
//
// `children` lists the linked students' login emails, separated by ";" (a
// comma would be read as a new CSV column). A parent with several children
// goes on ONE row: a second row with the same parent email would be
// refused because the account already exists.

export const MAX_CHILDREN_PER_PARENT = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Splits a children cell on ";" or "|", trims, lower-cases and removes repeats (order kept). */
export function parseChildEmails(cell: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of (cell ?? "").split(/[;|]/)) {
    const email = part.trim().toLowerCase();
    if (email && !seen.has(email)) {
      seen.add(email);
      out.push(email);
    }
  }
  return out;
}

export type ParentRowInput = { fullName: string; email: string; children?: string };

/** A message for the admin if this row can't be imported, else null. Does not touch the database. */
export function validateParentRow(row: ParentRowInput): string | null {
  if (!row.fullName.trim() || !row.email.trim()) return "Missing name or email.";
  if (!EMAIL_PATTERN.test(row.email.trim())) return `"${row.email.trim()}" isn't a valid email address.`;
  const children = parseChildEmails(row.children);
  if (children.length > MAX_CHILDREN_PER_PARENT) {
    return `A parent can have at most ${MAX_CHILDREN_PER_PARENT} children on one row.`;
  }
  const bad = children.find((c) => !EMAIL_PATTERN.test(c));
  if (bad) return `Child "${bad}" isn't a valid email address.`;
  if (children.includes(row.email.trim().toLowerCase())) return "A parent can't be listed as their own child.";
  return null;
}

/**
 * Indexes (0-based) of rows whose parent email already appeared earlier in
 * the file. The first occurrence is kept; later ones are reported so the
 * admin sees "duplicate in this file" rather than a confusing "email
 * already registered" for an account that was just created a line above.
 */
export function findDuplicateParentRows(rows: ParentRowInput[]): Set<number> {
  const seen = new Set<string>();
  const dupes = new Set<number>();
  rows.forEach((r, i) => {
    const email = r.email.trim().toLowerCase();
    if (!email) return;
    if (seen.has(email)) dupes.add(i);
    else seen.add(email);
  });
  return dupes;
}

/** Child emails the lookup could not match to a student, in the order given. */
export function unresolvedChildren(childEmails: string[], knownStudentEmails: Set<string>): string[] {
  return childEmails.filter((e) => !knownStudentEmails.has(e));
}
