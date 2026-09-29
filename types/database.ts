// Minimal local type, adapted from school_app's types/database.ts.
// Add fields here as more of the app is ported.
export type ResourceType = "image" | "pdf" | "audio" | "video" | "link" | "diagram_mermaid";

export type TopicResource = {
  id: string;
  topic_id: string;
  note_id: string | null;
  resource_type: ResourceType;
  title: string | null;
  content?: string | null;
  description?: string | null;
  file_url: string | null;
  sequence_order: number;
  uploaded_by: string | null;
  created_at: string;
};

// `createClient<Database>(...)` (lib/supabase/admin.ts, server.ts) needs
// this shape to exist, but hand-typing every column for all 27 tables
// across 0001-0008 by hand risks being *wrong* in a way that's worse
// than no types -- a stale hand-written Row type silently masks a real
// mismatch instead of catching one. Once any school's project exists,
// replace this whole file with the generated one (every school shares
// the same schema, so any one tenant's output describes them all):
//
//   npx supabase gen types typescript --project-id <any-tenant-ref> \
//     > types/database.ts
//
// Until then, `Row`/`Insert`/`Update` are deliberately `any` per table
// (not `unknown`) so existing `.select()`/`.insert()` call sites don't
// need blanket casts -- this restores real column-level checking later
// without churning every call site again.
type AnyTable = { Row: any; Insert: any; Update: any; Relationships: [] };

export type Database = {
  public: {
    Tables: Record<
      | "profiles"
      | "classes"
      | "class_members"
      | "subjects"
      | "teacher_subjects"
      | "topics"
      | "topic_notes"
      | "topic_note_drafts"
      | "topic_resources"
      | "topic_reads"
      | "share_links"
      | "timetable_periods"
      | "timetable_entries"
      | "settings"
      | "audit_log"
      | "guardian_links"
      | "announcements"
      | "announcement_reads"
      | "conversations"
      | "conversation_members"
      | "messages"
      | "homework"
      | "homework_submissions"
      | "quizzes"
      | "quiz_questions"
      | "quiz_options"
      | "quiz_attempts"
      | "quiz_answers"
      | "_schema_migrations",
      AnyTable
    >;
    Views: Record<
      "analytics_note_engagement" | "analytics_homework_completion" | "analytics_quiz_performance",
      { Row: any; Relationships: [] }
    >;
    Functions: {
      current_school_week: {
        Args: Record<string, never>;
        Returns: number | null;
      };
      topic_released_to_students: {
        Args: { t_academic_year: string; t_term: number; t_week_number: number | null };
        Returns: boolean;
      };
      submit_quiz_attempt: {
        Args: { p_attempt_id: string };
        Returns: { score: number; total_points: number }[];
      };
    };
    Enums: {
      global_role: "admin" | "teacher" | "student" | "parent";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

