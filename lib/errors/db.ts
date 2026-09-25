/**
 * Maps raw Postgres/PostgREST errors (from Supabase) into short,
 * user-facing messages instead of leaking internal DB text
 * (constraint names, column names, SQL wording) into the UI.
 *
 * Server actions should replace:
 *   if (error) throw new Error(error.message);
 * with:
 *   if (error) throwDbError(error);
 */

import { logger } from "@/lib/logger";

type DbErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

const DEFAULT_FALLBACK = "Something went wrong. Please try again.";

/**
 * Named constraints that get a specific, hand-written message.
 * Add an entry here whenever a migration introduces a new named
 * unique/check constraint that end users might realistically hit.
 */
const KNOWN_CONSTRAINTS: Record<string, string> = {
  quiz_answers_attempt_question_unique: "You've already answered this question in this attempt.",
  homework_submissions_lesson_id_student_id_key:
    "This student has already submitted this homework.",
  invoice_installments_invoice_sequence_unique:
    "An installment with this sequence number already exists for this invoice.",
  report_card_remarks_student_term_year_unique:
    "A report card remark already exists for this student, term, and year.",
  enrollments_unique_student_term: "This student is already enrolled for this term.",
  guardian_links_unique_parent_student: "This guardian is already linked to this student.",
  timetable_entries_class_period_unique: "That class already has a lesson in this period.",
  timetable_entries_teacher_period_unique: "That teacher is already teaching another class in this period.",
  timetable_entries_space_class_fkey: "That space isn't linked to this class.",
  timetable_entries_period_number_fkey: "Remove this period's lessons from the timetable first.",
};

function extractConstraintName(message: string | null | undefined): string | null {
  if (!message) return null;
  const match = message.match(/constraint "([^"]+)"/i);
  return match ? match[1] : null;
}

/** Turns a snake_case constraint/column identifier into readable words. */
function humanizeIdentifier(name: string): string {
  return name
    .replace(/_fkey$|_key$|_unique$|_check$/i, "")
    .replace(/_/g, " ")
    .trim();
}

/**
 * Maps a Supabase/Postgres error to a short, user-facing string.
 * Never throws — safe to call even with a partial/unknown error shape.
 */
function mapDbError(
  error: DbErrorLike | null | undefined,
  fallback: string = DEFAULT_FALLBACK
): string {
  if (!error) return fallback;

  const constraintName = extractConstraintName(error.message);
  if (constraintName && KNOWN_CONSTRAINTS[constraintName]) {
    return KNOWN_CONSTRAINTS[constraintName];
  }

  switch (error.code) {
    case "23505": // unique_violation
      return constraintName
        ? `This ${humanizeIdentifier(constraintName)} already exists.`
        : "This record already exists.";
    case "23503": // foreign_key_violation
      return "This action references a record that doesn't exist or has already been removed.";
    case "23502": // not_null_violation
      return "A required field is missing.";
    case "23514": // check_violation
      return constraintName
        ? `That value isn't allowed (${humanizeIdentifier(constraintName)}).`
        : "That value isn't allowed.";
    case "22P02": // invalid_text_representation
      return "One of the values entered is in the wrong format.";
    case "42501": // insufficient_privilege (RLS policy blocked the write)
      return "You don't have permission to do that.";
    case "40001": // serialization_failure
    case "40P01": // deadlock_detected
      return "That couldn't be completed due to a conflicting update. Please try again.";
    default:
      return fallback;
  }
}

/**
 * Logs the original DB error for diagnosis, then throws a user-facing
 * Error built from it. Drop-in replacement for:
 *   if (error) throwDbError(error);
 */
export function throwDbError(error: DbErrorLike | null | undefined, fallback?: string): never {
  if (error) {
    logger.error("throwDbError: DB operation failed", { code: error.code, error });
  }
  throw new Error(mapDbError(error, fallback));
}
