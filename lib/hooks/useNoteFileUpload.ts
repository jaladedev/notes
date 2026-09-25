import { useRef, useState, type DragEvent } from "react";
import { uploadTopicResource } from "@/lib/actions/resources";
import { emitToast } from "@/lib/toast";
import type { TopicResource } from "@/types/database";

const ACCEPTED_RESOURCE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "video/mp4",
  "video/webm",
]);

type UseNoteFileUploadArgs = {
  topicId: string;
  ensureNoteId: () => Promise<string>;
  getMarkdown: () => string;
  currentNoteId: string | undefined | null;
  saveDraft: (content: string) => Promise<void>;
  onResourceCreated: (resource: TopicResource) => void;
  insertResourceMarker: (resource: TopicResource) => void;
  onAfterMutation: () => void; // router.refresh() equivalent
};

/**
 * Drag-and-drop + upload handling for files dropped onto (or pasted
 * into) the note. Split out of NoteEditor.tsx because it's a distinct
 * concern from resource *insertion* into the doc (useResourceInsertion) --
 * this owns the actual upload request, MIME filtering, and drag-state UI,
 * and calls back into insertResourceMarker rather than duplicating it.
 */
export function useNoteFileUpload({
  topicId,
  ensureNoteId,
  getMarkdown,
  currentNoteId,
  saveDraft,
  onResourceCreated,
  insertResourceMarker,
  onAfterMutation,
}: UseNoteFileUploadArgs) {
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const dragDepthRef = useRef(0);

  async function uploadDroppedFiles(files: File[]) {
    const accepted = files.filter((f) => ACCEPTED_RESOURCE_MIME_TYPES.has(f.type));
    const rejected = files.length - accepted.length;
    if (rejected > 0) {
      emitToast(
        `${rejected} file${rejected === 1 ? "" : "s"} skipped -- use an image, PDF, audio, or video file.`,
        "error"
      );
    }
    if (accepted.length === 0) return;

    const neededNoteCreation = !currentNoteId;
    let noteIdToUse: string;
    try {
      noteIdToUse = await ensureNoteId();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not create the note.";
      emitToast(message, "error");
      return;
    }

    setUploadingCount(accepted.length);
    let failures = 0;
    let insertedAny = false;
    for (const file of accepted) {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("title", "");
      try {
        const resource = await uploadTopicResource(topicId, noteIdToUse, formData);
        if (resource) {
          onResourceCreated(resource);
          insertResourceMarker(resource);
          insertedAny = true;
        }
      } catch (err: unknown) {
        failures += 1;
        const message = err instanceof Error ? err.message : `Could not upload "${file.name}".`;
        emitToast(message, "error");
      } finally {
        setUploadingCount((count) => Math.max(0, count - 1));
      }
    }
    if (neededNoteCreation && insertedAny) {
      // One save for the whole batch
      await saveDraft(getMarkdown());
    }
    // Same reasoning as useResourceInsertion's handleSaveDiagram
    // onAfterMutation call -- the sidebar TopicResourceList only ever
    // updates via a server round-trip, and ensureNoteId()'s refresh only
    // covers the note-didn't-exist case, not "note exists, files were
    // just uploaded to it".
    if (insertedAny) onAfterMutation();
    if (accepted.length - failures > 0) {
      emitToast(
        accepted.length - failures === 1
          ? "File uploaded and inserted."
          : `${accepted.length - failures} files uploaded and inserted.`
      );
    }
  }

  function handleDragEnter(e: DragEvent) {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingFile(true);
  }

  function handleDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
  }

  function handleDragLeave(e: DragEvent) {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingFile(false);
  }

  function handleDrop(e: DragEvent) {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFile(false);
    void uploadDroppedFiles(Array.from(e.dataTransfer.files));
  }

  return {
    isDraggingFile,
    uploadingCount,
    uploadDroppedFiles,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
