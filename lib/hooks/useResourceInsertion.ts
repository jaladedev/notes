// Ported from jaladedev/school_app's lib/hooks/useResourceInsertion.ts
// (SHA 466c538). Assessment picker/insertion dropped entirely (no
// assessments in this app -- plan doc section 4).

import { useState } from "react";
import type { Editor } from "@tiptap/core";
import { createMermaidResource } from "@/lib/actions/resources";
import { emitToast } from "@/lib/toast";
import type { TopicResource } from "@/types/database";
import type { LinkableTopic } from "@/lib/tiptap/topic-link-node";

const DEFAULT_MERMAID = "flowchart TD\n  A[Start] --> B[End]";

type UseResourceInsertionArgs = {
  editor: Editor | null | undefined;
  topicId: string;
  ensureNoteId: () => Promise<string>;
  getMarkdown: () => string;
  currentNoteId: string | undefined | null;
  saveDraft: (content: string) => Promise<void>;
  onResourceCreated: (resource: TopicResource) => void;
  onAfterMutation: () => void; // router.refresh() equivalent
};

/**
 * Everything that inserts a node into the editor's content -- resource
 * chips, assessment/topic chips, tables, emoji, symbols, math, and the
 * Mermaid diagram flow (which both creates a resource AND inserts it).
 *
 * All of it shares the same shape: mutate the `editor` doc, then close
 * whichever picker triggered it. Split out of NoteEditor.tsx because none
 * of it reaches into drag/drop, autosave, or toolbar state -- it only
 * needs the live `editor` instance plus the note-creation/save primitives
 * NoteEditor already owns (ensureNoteId/getMarkdown/saveDraft), which is
 * why those are passed in rather than duplicated here.
 */
export function useResourceInsertion({
  editor,
  topicId,
  ensureNoteId,
  getMarkdown,
  currentNoteId,
  saveDraft,
  onResourceCreated,
  onAfterMutation,
}: UseResourceInsertionArgs) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [topicPickerOpen, setTopicPickerOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [emojiPickerPos, setEmojiPickerPos] = useState<{ top: number; left: number } | null>(null);
  const [symbolPickerOpen, setSymbolPickerOpen] = useState(false);

  const [diagramPanelOpen, setDiagramPanelOpen] = useState(false);
  const [diagramTitle, setDiagramTitle] = useState("");
  const [diagramCode, setDiagramCode] = useState(DEFAULT_MERMAID);
  const [isSavingDiagram, setIsSavingDiagram] = useState(false);

  function insertResourceMarker(resource: TopicResource) {
    const storage = editor?.storage.resourceChip;
    if (storage && !storage.resources.some((r: TopicResource) => r.id === resource.id)) {
      storage.resources = [...storage.resources, resource];
    }
    editor
      ?.chain()
      .focus()
      .insertContent({ type: "resourceChip", attrs: { id: resource.id } })
      .run();
  }

  function handlePickResource(resource: TopicResource) {
    insertResourceMarker(resource);
    setPickerOpen(false);
  }

  function insertTopicMarker(topic: LinkableTopic) {
    editor
      ?.chain()
      .focus()
      .insertContent({ type: "topicLinkChip", attrs: { id: topic.id } })
      .run();
  }

  function handlePickTopic(topic: LinkableTopic) {
    insertTopicMarker(topic);
    setTopicPickerOpen(false);
  }

  function insertTable() {
    editor?.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();
  }

  function insertEmoji(emoji: string) {
    // Emoji are just Unicode text, not a custom node -- inserting as
    // plain content means they round-trip through markdown for free
    // (no serialize/parse wiring needed, unlike MathInline/ResourceChip).
    editor?.chain().focus().insertContent(emoji).run();
    setEmojiPickerOpen(false);
    setEmojiPickerPos(null);
  }

  function insertSymbol(symbol: string) {
    editor?.chain().focus().insertContent(symbol).run();
    setSymbolPickerOpen(false);
  }

  function insertMath(displayMode: boolean) {
    editor
      ?.chain()
      .focus()
      .insertContent({ type: displayMode ? "mathBlock" : "mathInline", attrs: { latex: "" } })
      .run();
  }

  async function handleSaveDiagram() {
    if (!diagramCode.trim()) {
      emitToast("Write some Mermaid code before saving.", "error");
      return;
    }
    setIsSavingDiagram(true);
    try {
      const neededNoteCreation = !currentNoteId;
      const noteIdToUse = await ensureNoteId();
      const resource = await createMermaidResource(
        topicId,
        noteIdToUse,
        diagramTitle || "Diagram",
        diagramCode
      );
      onResourceCreated(resource);
      insertResourceMarker(resource);
      if (neededNoteCreation) {
        await saveDraft(getMarkdown());
      }
      // ensureNoteId() already refreshes when it creates the note, but
      // that's a different case (note didn't exist) from this one (note
      // exists, a new resource was just added to it) -- without this,
      // the sidebar TopicResourceList (page.tsx, fed from the Server
      // Component's own `resources` prop, with zero connection to this
      // component's client state) never learns the diagram exists until
      // an unrelated navigation happens to reload the page. The earlier
      // merge-not-overwrite fix on the `resources` prop-sync effect
      // above is what makes calling this safe every time: a stale
      // snapshot arriving mid-flight can no longer erase what was just
      // added locally.
      onAfterMutation();
      emitToast("Diagram added to the note.");
      setDiagramPanelOpen(false);
      setDiagramTitle("");
      setDiagramCode(DEFAULT_MERMAID);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to save the diagram.";
      emitToast(message, "error");
    } finally {
      setIsSavingDiagram(false);
    }
  }

  return {
    pickerOpen,
    setPickerOpen,
    topicPickerOpen,
    setTopicPickerOpen,
    emojiPickerOpen,
    setEmojiPickerOpen,
    emojiPickerPos,
    setEmojiPickerPos,
    symbolPickerOpen,
    setSymbolPickerOpen,
    diagramPanelOpen,
    setDiagramPanelOpen,
    diagramTitle,
    setDiagramTitle,
    diagramCode,
    setDiagramCode,
    isSavingDiagram,
    insertResourceMarker,
    handlePickResource,
    handlePickTopic,
    insertTable,
    insertEmoji,
    insertSymbol,
    insertMath,
    handleSaveDiagram,
  };
}
