import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { applySectionGrouping } from "@/lib/tiptap/section-node";
import { saveTopicNoteDraft, getTopicNoteDraft, clearTopicNoteDraft } from "@/lib/actions/notes";

/**
 * Everything about "is this note saved, and is there unsaved work
 * sitting around that could be lost" -- dirty-state tracking, the
 * beforeunload warning, online/offline detection, the 20s periodic
 * autosave-to-draft tick, and the "we found a newer autosave than what
 * you loaded" recovery banner.
 *
 * Split out of NoteEditor.tsx (previously all inline there) because it's
 * genuinely self-contained: nothing in here reaches into the toolbar,
 * pickers, or resource-insertion logic, it only needs the live `editor`
 * instance and `topicId`. The one thing it does NOT own is the actual
 * "save this note" call (saveTopicNote) -- that stays a NoteEditor
 * concern (handleSave/ensureNoteId/handleSaveDiagram/uploadDroppedFiles
 * all need to create/update the note itself, which this hook has no
 * business doing), which is why `setIsDirty`/`setLastSavedContent`/
 * `setLastSavedAt` are returned instead of only their read values --
 * callers still need to mark a real save as clean.
 */
export function useNoteAutosave(
  editor: Editor | null | undefined,
  topicId: string,
  initialContent: string
) {
  const [lastSavedContent, setLastSavedContent] = useState(initialContent);
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const getMarkdown = () => (editor as any)?.storage.markdown.getMarkdown() as string;

  useEffect(() => {
    if (!editor) return;
    function onUpdate() {
      setIsDirty(getMarkdown() !== lastSavedContent);
    }
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, lastSavedContent]);

  // --- Offline detection --------------------------------------
  // Autosave and the explicit Save/Publish buttons both need to know
  // this: there's no point firing a save attempt (autosave) or letting
  // someone click Publish (explicit) when the request can't possibly
  // reach the server, and either would otherwise surface as a confusing
  // generic network-error toast rather than the clearer "you're offline"
  // state this drives instead.
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    setIsOnline(navigator.onLine);
    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // --- Periodic autosave ---------------------------------------
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [lastAutosaveAt, setLastAutosaveAt] = useState<Date | null>(null);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  useEffect(() => {
    if (!editor) return;
    const interval = setInterval(() => {
      if (!isDirtyRef.current || !isOnlineRef.current) return;
      const content = getMarkdown();
      setAutosaveStatus("saving");
      saveTopicNoteDraft(topicId, content)
        .then(() => {
          setAutosaveStatus("saved");
          setLastAutosaveAt(new Date());
        })
        .catch(() => {
          setAutosaveStatus("error");
        });
    }, 20_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, topicId]);

  // --- Draft recovery banner -----------------------------------
  // Checked once on mount. The beforeunload warning below only catches a
  // clean in-app navigation attempt -- it can't do anything about a
  // crashed tab, a dead battery, or a network drop right as someone
  // closed the laptop lid. If an autosave tick from one of those
  // situations is sitting in `topic_note_drafts` and differs from what
  // this page loaded with, offer to restore it instead of silently
  // discarding a teacher's unsaved work.
  const [draftBanner, setDraftBanner] = useState<{ content: string; updatedAt: string } | null>(
    null
  );
  useEffect(() => {
    let cancelled = false;
    getTopicNoteDraft(topicId)
      .then((draft) => {
        if (!cancelled && draft && draft.content !== initialContent) {
          setDraftBanner({ content: draft.content, updatedAt: draft.updated_at });
        }
      })
      .catch(() => {
        // No draft, or couldn't check -- fine either way, nothing to recover.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

  function restoreDraft() {
    if (!editor || !draftBanner) return;
    editor.commands.setContent(draftBanner.content);
    // setContent parses the raw markdown flat -- re-apply the same
    // section-grouping pass used on initial load, or the section
    // boxes/controls vanish even though the content itself is intact.
    requestAnimationFrame(() => {
      applySectionGrouping(editor);
    });
    setDraftBanner(null);
  }

  function discardDraft() {
    setDraftBanner(null);
    clearTopicNoteDraft(topicId).catch(() => {
      // Non-critical -- worst case the banner reappears next load.
    });
  }

  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  return {
    isDirty,
    setIsDirty,
    lastSavedContent,
    setLastSavedContent,
    lastSavedAt,
    setLastSavedAt,
    autosaveStatus,
    lastAutosaveAt,
    isOnline,
    draftBanner,
    restoreDraft,
    discardDraft,
  };
}
