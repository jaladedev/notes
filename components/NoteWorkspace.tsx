"use client";

// Ported from jaladedev/school_app's components/NoteWorkspace.tsx (SHA
// 466c538). Assessments dropped entirely (no assessments in this app --
// plan doc section 4). topicMeta generalized (see HandoutView.tsx).
// NoteEditor itself is ported separately (largest single file, ~1.5k
// lines) -- this component imports it but the port isn't done yet.

import { useRef, useState } from "react";
import { NoteEditor, type NoteEditorHandle } from "@/components/NoteEditor";
import { NoteSlideView } from "@/components/NoteSlideView";
import { TopicContent } from "@/components/TopicContent";
import { BellTimer, type BellTimerEntry } from "@/components/BellTimer";
import { ResourceSidebar } from "@/components/ResourceSidebar";
import { HandoutView } from "@/components/HandoutView";
import type { TopicResource } from "@/types/database";
import type { LinkableTopic } from "@/lib/tiptap/topic-link-node";

export function NoteWorkspace({
  topicId,
  noteId,
  initialContent,
  initialStatus,
  resources,
  topics = [],
  placeholder,
  todaysEntries = [],
  timeZone,
  topicMeta,
}: {
  topicId: string;
  noteId?: string;
  initialContent: string;
  initialStatus: "draft" | "published" | "archived" | "unwritten";
  resources: TopicResource[];
  // Other topics linkable via TopicLinkChip -- fetched server-side, open
  // to anyone with staff access to the space (not just this note's author).
  topics?: LinkableTopic[];
  placeholder?: string;
  // Today's lessons for this teacher (from the school timetable) and the
  // school's IANA time zone, both for BellTimer.
  todaysEntries?: BellTimerEntry[];
  timeZone?: string;
  topicMeta?: {
    title: string;
    subtitle?: string | null;
  };
}) {
  // "preview" renders the same live NoteEditor/TipTap doc as "edit" (so it
  // always reflects the current, possibly-unsaved draft -- unlike
  // "present", which deliberately shows only the last-saved version),
  // just with forcePreview turning off editability and hiding the
  // toolbar/mobile-tab chrome.
  const [mode, setMode] = useState<"edit" | "preview" | "student" | "present" | "handout">("edit");
  const editorRef = useRef<NoteEditorHandle>(null);
  const [sidebarResources, setSidebarResources] = useState(resources);
  const [mobileTab, setMobileTab] = useState<"write" | "preview" | "resources">("write");

  return (
    <div>
      <div className="mb-3 flex gap-1 overflow-x-auto rounded-lg border border-rule bg-paper p-1 print:hidden">
        <button
          type="button"
          onClick={() => setMode("edit")}
          className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${
            mode === "edit" ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"
          }`}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => setMode("preview")}
          className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${
            mode === "preview" ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"
          }`}
        >
          Preview
        </button>
        <button
          type="button"
          onClick={() => setMode("student")}
          disabled={!noteId}
          title={!noteId ? "Save the note once before viewing as a student" : undefined}
          className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${
            mode === "student" ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"
          }`}
        >
          Student view
        </button>
        <button
          type="button"
          onClick={() => setMode("present")}
          disabled={!noteId}
          title={!noteId ? "Save the note once before presenting" : undefined}
          className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${
            mode === "present" ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"
          }`}
        >
          Present
        </button>
        <button
          type="button"
          onClick={() => setMode("handout")}
          disabled={!noteId}
          title={!noteId ? "Save the note once before printing a handout" : undefined}
          className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${
            mode === "handout" ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"
          }`}
        >
          Handout
        </button>
      </div>

      {/* Present/Handout show the last-saved version of the note, not
          unsaved edits from the editor above -- a teacher who wants to
          present their latest changes needs to Save/Publish first. */}
      {mode === "edit" || mode === "preview" ? (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <NoteEditor
              ref={editorRef}
              topicId={topicId}
              noteId={noteId}
              initialContent={initialContent}
              initialStatus={initialStatus}
              resources={resources}
              topics={topics}
              placeholder={placeholder}
              onResourcesChange={setSidebarResources}
              mobileTab={mobileTab}
              onMobileTabChange={setMobileTab}
              forcePreview={mode === "preview"}
            />
          </div>
          {mode === "edit" && (
            <div className={mobileTab === "resources" ? "block" : "hidden lg:block"}>
              <ResourceSidebar resources={sidebarResources} editorRef={editorRef} />
            </div>
          )}
        </div>
      ) : mode === "student" ? (
        <TopicContent content={initialContent} resources={resources} linkedTopics={topics} />
      ) : mode === "handout" ? (
        <HandoutView
          content={initialContent}
          resources={resources}
          topics={topics}
          topicMeta={topicMeta}
        />
      ) : (
        <>
          {/* Bell timer sits above the slide content in Present mode --
              this is what gets projected while a teacher is teaching. */}
          <BellTimer entries={todaysEntries} timeZone={timeZone} />
          <NoteSlideView content={initialContent} resources={resources} />
        </>
      )}
    </div>
  );
}
