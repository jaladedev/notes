// Validation for posting or editing homework. Shared by the forms (instant
// feedback) and the server actions (the check that counts).

import { validateDueDate } from "@/lib/dueDate";

export const MAX_HOMEWORK_TITLE = 200;
export const MAX_HOMEWORK_INSTRUCTIONS = 5000;

export type HomeworkInput = {
  title: string;
  instructions?: string | null;
  /** ISO timestamp, or null/undefined for no due date. */
  dueAt?: string | null;
};

/**
 * Returns a message for the teacher, or null when the homework can be saved.
 *
 * `previousDueAt` is the due date already stored when editing. Leaving it
 * unchanged is always fine -- otherwise a teacher couldn't fix a typo in the
 * title of homework whose deadline had passed. Only a *new* due date has to
 * be tomorrow or later (see validateDueDate).
 */
export function validateHomework(
  input: HomeworkInput,
  now: Date,
  timeZone: string,
  previousDueAt?: string | null
): string | null {
  const title = input.title.trim();
  if (!title) return "Homework needs a title.";
  if (title.length > MAX_HOMEWORK_TITLE) return `The title can be at most ${MAX_HOMEWORK_TITLE} characters.`;
  if ((input.instructions ?? "").length > MAX_HOMEWORK_INSTRUCTIONS) {
    return `Instructions can be at most ${MAX_HOMEWORK_INSTRUCTIONS.toLocaleString()} characters.`;
  }
  if (input.dueAt) {
    const unchanged =
      previousDueAt != null && new Date(previousDueAt).getTime() === new Date(input.dueAt).getTime();
    if (!unchanged) return validateDueDate(input.dueAt, now, timeZone);
  }
  return null;
}
