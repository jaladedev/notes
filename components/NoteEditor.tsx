"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type DragEvent,
} from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent, useEditorState } from "@tiptap/react";
import { type Editor } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/react/menus";
import { applySectionGrouping } from "@/lib/tiptap/section-node";
import { slashCommandBridge } from "@/lib/tiptap/slash-command";
import { buildNoteEditorExtensions } from "@/lib/tiptap/editor-extensions";
import { saveTopicNote } from "@/lib/actions/notes";
import {
  createMermaidResource,
  createVideoEmbedResource,
  createLinkResource,
  uploadTopicResource,
} from "@/lib/actions/resources";
import { emitToast } from "@/lib/toast";
import { DiagramPanel } from "@/components/note-editor/DiagramPanel";
import { VideoEmbedPopover } from "@/components/note-editor/VideoEmbedPopover";
import { LinkPreviewPopover } from "@/components/note-editor/LinkPreviewPopover";
import type { LinkableTopic } from "@/lib/tiptap/topic-link-node";
import { EmojiPicker } from "@/components/EmojiPicker";
import { clampPopoverToEditor } from "@/lib/tiptap/popover-position";
import { useNoteAutosave } from "@/lib/hooks/useNoteAutosave";
import { useResourceInsertion } from "@/lib/hooks/useResourceInsertion";
import { useNoteFileUpload } from "@/lib/hooks/useNoteFileUpload";
import { useNoteSearch } from "@/lib/hooks/useNoteSearch";
import { NoteToolbar } from "@/components/NoteToolbar";
import {
  AddRowAboveIcon,
  AddRowBelowIcon,
  DeleteRowIcon,
  AddColLeftIcon,
  AddColRightIcon,
  DeleteColIcon,
  MergeCellsIcon,
  SplitCellIcon,
  HeaderRowIcon,
  DeleteTableIcon,
} from "@/components/TableIcons";
import type { TopicResource } from "@/types/database";

const RESOURCE_TYPE_LABEL: Record<TopicResource["resource_type"], string> = {
  image: "Image",
  diagram_mermaid: "Diagram",
  video: "Video",
  pdf: "PDF",
  link: "Link",
  audio: "Audio",
};

function isBareHttpUrl(text: string): boolean {
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export type NoteEditorHandle = {
  insertResource: (resource: TopicResource) => void;
  uploadFiles: (files: File[]) => Promise<void>;
};

type MobileTab = "write" | "preview" | "resources";

type NoteEditorProps = {
  topicId: string;
  noteId?: string;
  initialContent: string;
  initialStatus: "draft" | "published" | "archived" | "unwritten";
  resources?: TopicResource[];
  topics?: LinkableTopic[];
  placeholder?: string;
  onResourcesChange?: (resources: TopicResource[]) => void;
  mobileTab?: MobileTab;
  onMobileTabChange?: (tab: MobileTab) => void;
  forcePreview?: boolean;
};

export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(function NoteEditor(
  {
    topicId,
    noteId,
    initialContent,
    initialStatus,
    resources = [],
    topics = [],
    placeholder = "Write the topic explanation here. Use tables for summaries, and ∑ / ∑∑ for math.",
    onResourcesChange,
    mobileTab: controlledMobileTab,
    onMobileTabChange,
    forcePreview = false,
  },
  ref
) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [topicFilter, setTopicFilter] = useState("");
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [a11yMenuOpen, setA11yMenuOpen] = useState(false);
  const a11yMenuRef = useRef<HTMLDivElement | null>(null);
  const [fontScale, setFontScale] = useState<0.9 | 1 | 1.15 | 1.3>(1);
  const [highContrast, setHighContrast] = useState(false);
  const [dyslexiaFont, setDyslexiaFont] = useState(false);
  const [spellcheckEnabled, setSpellcheckEnabled] = useState(true);

  useEffect(() => {
    const savedFontScale = Number(window.localStorage.getItem("noteEditor:fontScale"));
    if (([0.9, 1, 1.15, 1.3] as const).includes(savedFontScale as any)) {
      setFontScale(savedFontScale as 0.9 | 1 | 1.15 | 1.3);
    }
    setHighContrast(window.localStorage.getItem("noteEditor:highContrast") === "1");
    setDyslexiaFont(window.localStorage.getItem("noteEditor:dyslexiaFont") === "1");
    const savedSpellcheck = window.localStorage.getItem("noteEditor:spellcheck");
    setSpellcheckEnabled(savedSpellcheck === null ? true : savedSpellcheck === "1");
  }, []);

  useEffect(() => {
    window.localStorage.setItem("noteEditor:fontScale", String(fontScale));
  }, [fontScale]);
  useEffect(() => {
    window.localStorage.setItem("noteEditor:highContrast", highContrast ? "1" : "0");
  }, [highContrast]);
  useEffect(() => {
    window.localStorage.setItem("noteEditor:dyslexiaFont", dyslexiaFont ? "1" : "0");
  }, [dyslexiaFont]);
  useEffect(() => {
    window.localStorage.setItem("noteEditor:spellcheck", spellcheckEnabled ? "1" : "0");
  }, [spellcheckEnabled]);

  const [videoEmbedOpen, setVideoEmbedOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [isSavingVideoEmbed, setIsSavingVideoEmbed] = useState(false);
  const [linkPreviewOpen, setLinkPreviewOpen] = useState(false);
  const [linkPreviewUrl, setLinkPreviewUrl] = useState("");
  const [isSavingLinkPreview, setIsSavingLinkPreview] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    slashCommandBridge.openResourcePicker = () => setPickerOpen(true);
    slashCommandBridge.openDiagramPanel = () => setDiagramPanelOpen(true);
    slashCommandBridge.openLinkPreviewPanel = () => setLinkPreviewOpen(true);
  });
  const [internalMobileTab, setInternalMobileTab] = useState<MobileTab>("write");
  const mobileTab = controlledMobileTab ?? internalMobileTab;
  const setMobileTab = onMobileTabChange ?? setInternalMobileTab;
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const topicPickerRef = useRef<HTMLDivElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const symbolPickerRef = useRef<HTMLDivElement | null>(null);
  const colorPickerRef = useRef<HTMLDivElement | null>(null);
  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const emojiPopupRef = useRef<HTMLDivElement | null>(null);
  const diagramSectionRef = useRef<HTMLDivElement | null>(null);
  const noteContainerRef = useRef<HTMLDivElement | null>(null);

  const [currentNoteId, setCurrentNoteId] = useState(noteId);
  useEffect(() => setCurrentNoteId(noteId), [noteId]);

  const pendingNoteCreationRef = useRef<Promise<string> | null>(null);

  async function createFirstNoteIfNeeded(
    content: string,
    status: "draft" | "published"
  ): Promise<{ id: string; createdHere: boolean }> {
    if (currentNoteId) return { id: currentNoteId, createdHere: false };
    if (pendingNoteCreationRef.current) {
      const id = await pendingNoteCreationRef.current;
      return { id, createdHere: false };
    }
    const creation = (async () => {
      const note = await saveTopicNote(topicId, content, status);
      if (!note?.id) throw new Error("Could not create the note.");
      return note.id;
    })();
    pendingNoteCreationRef.current = creation;
    try {
      const id = await creation;
      setCurrentNoteId(id);
      return { id, createdHere: true };
    } finally {
      pendingNoteCreationRef.current = null;
    }
  }

  const [localResources, setLocalResources] = useState(resources);

  useEffect(() => {
    setLocalResources((prev) => {
      const incomingIds = new Set(resources.map((r) => r.id));
      const localOnly = prev.filter((r) => !incomingIds.has(r.id));
      return [...resources, ...localOnly];
    });
  }, [resources]);

  const onResourcesChangeRef = useRef(onResourcesChange);
  useEffect(() => {
    onResourcesChangeRef.current = onResourcesChange;
  });
  useEffect(() => {
    onResourcesChangeRef.current?.(localResources);
  }, [localResources]);

  useImperativeHandle(ref, () => ({
    insertResource: handlePickResource,
    uploadFiles: uploadDroppedFiles,
  }));

  const editor = useEditor({
    immediatelyRender: false,
    extensions: buildNoteEditorExtensions(placeholder),
    content: initialContent,
    // @ts-expect-error -- provided by the Markdown extension
    contentType: "markdown",
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Note content",
        spellcheck: "true",
      },
      handlePaste(_view, event) {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) =>
          f.type.startsWith("image/")
        );
        if (files.length > 0) {
          event.preventDefault();
          void uploadDroppedFiles(files);
          return true;
        }

        const pastedText = event.clipboardData?.getData("text/plain")?.trim() ?? "";
        if (pastedText && isBareHttpUrl(pastedText)) {
          event.preventDefault();
          void handleAddLinkPreview(pastedText);
          return true;
        }

        return false; // let normal paste handling run
      },
    },

    onCreate({ editor: created }) {
      requestAnimationFrame(() => {
        applySectionGrouping(created);
      });
    },
  });

  useEditorState({
    editor,
    selector: ({ editor }) => editor?.state,
  });

  useEffect(() => {
    if (!editor) return;
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: {
          ...(editor.options.editorProps.attributes as Record<string, string> | undefined),
          spellcheck: spellcheckEnabled ? "true" : "false",
        },
      },
    });
  }, [editor, spellcheckEnabled]);

  const {
    searchOpen,
    setSearchOpen,
    searchTerm,
    setSearchTerm,
    replaceTerm,
    setReplaceTerm,
    matchCase,
    setMatchCase,
    searchInputRef,
    searchMatches,
    selectSearchMatch,
    replaceSearchMatch,
    replaceAllSearchMatches,
  } = useNoteSearch(editor);

  function enterFocusMode() {
    setSearchOpen(false);
    setPickerOpen(false);
    setEmojiPickerOpen(false);
    setSymbolPickerOpen(false);
    setColorPickerOpen(false);
    setDiagramPanelOpen(false);
    setVideoEmbedOpen(false);
    setLinkPreviewOpen(false);
    setFocusMode(true);
    requestAnimationFrame(() => editor?.commands.focus());
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await editorShellRef.current?.requestFullscreen();
    } catch {
      emitToast("Fullscreen is not available in this browser.", "error");
    }
  }

  useEffect(() => {
    const update = () => setIsFullscreen(document.fullscreenElement === editorShellRef.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  useEffect(() => {
    slashCommandBridge.openEmojiPicker = () => {
      const pos = editor?.state.selection.from;
      if (editor && pos != null) {
        const coords = editor.view.coordsAtPos(pos);
        setEmojiPickerPos({ left: coords.left, top: coords.bottom + 6 });
      } else {
        setEmojiPickerPos(null);
      }
      setEmojiPickerOpen(true);
    };
  });

  useEffect(() => {
    if (!editor) return;
    editor.storage.resourceChip.resources = localResources;
    editor.storage.resourceChip.onResourceUpdated = (updated: TopicResource) => {
      setLocalResources((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    };
  }, [editor, localResources]);

  useEffect(() => {
    if (!editor) return;
    editor.storage.topicLinkChip.topics = topics;
  }, [editor, topics]);

  const getMarkdown = () => (editor as any)?.storage.markdown.getMarkdown() as string;

  const saveDraft = async (content: string) => {
    await saveTopicNote(topicId, content, "draft");
    setLastSavedContent(content);
    setIsDirty(false);
  };

  const {
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
  } = useResourceInsertion({
    editor,
    topicId,
    ensureNoteId,
    getMarkdown,
    currentNoteId,
    saveDraft,
    onResourceCreated: (resource) => setLocalResources((prev) => [...prev, resource]),
    onAfterMutation: () => router.refresh(),
  });

  const {
    isDraggingFile,
    uploadingCount,
    uploadDroppedFiles,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useNoteFileUpload({
    topicId,
    ensureNoteId,
    getMarkdown,
    currentNoteId,
    saveDraft,
    onResourceCreated: (resource) => setLocalResources((prev) => [...prev, resource]),
    insertResourceMarker,
    onAfterMutation: () => router.refresh(),
  });

  useEffect(() => {
    if (pickerOpen) pickerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [pickerOpen]);

  useEffect(() => {
    if (diagramPanelOpen) {
      diagramSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [diagramPanelOpen]);

  useLayoutEffect(() => {
    if (emojiPickerOpen && emojiPickerPos && emojiPopupRef.current) {
      clampPopoverToEditor(emojiPopupRef.current, editor?.view?.dom ?? null);
    }
  }, [emojiPickerOpen, emojiPickerPos, editor]);

  useEffect(() => {
    editor?.setEditable(!forcePreview && mobileTab !== "preview");
  }, [editor, mobileTab, forcePreview]);

  function computeNoteStats(ed: NonNullable<typeof editor>) {
    let headings = 0;
    let tables = 0;
    let images = 0;
    let resources = 0;
    let linkedTopics = 0;
    ed.state.doc.descendants((node) => {
      if (node.type.name === "heading") headings++;
      else if (node.type.name === "table") tables++;
      else if (node.type.name === "resourceChip") {
        resources++;
        const resource = localResources.find((r) => r.id === node.attrs.id);
        if (resource?.resource_type === "image") images++;
      } else if (node.type.name === "topicLinkChip") {
        linkedTopics++;
      }
      return true;
    });
    const words: number = ed.storage.characterCount.words();
    const characters: number = ed.storage.characterCount.characters();
    const readingMinutes = Math.max(1, Math.round(words / 200));
    return {
      words,
      characters,
      readingMinutes,
      headings,
      tables,
      images,
      resources,
      linkedTopics,
    };
  }

  const noteStats = useMemo(
    () => (editor ? computeNoteStats(editor) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, editor?.state.doc, localResources]
  );

  const {
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
  } = useNoteAutosave(editor, topicId, initialContent);

  function handleSave(status: "draft" | "published") {
    if (!editor) return;
    if (!isOnline) {
      emitToast("You're offline — reconnect before saving.", "error");
      return;
    }
    setError(null);
    if (status === "draft") setIsSavingDraft(true);
    const content = getMarkdown();
    const isFirstSave = !currentNoteId;
    startTransition(async () => {
      try {
        let noteId: string;
        if (isFirstSave) {
          const result = await createFirstNoteIfNeeded(content, status);
          noteId = result.id;
          if (!result.createdHere) {
            if (status === "published") {
              const note = await saveTopicNote(topicId, content, status);
              if (note?.id) noteId = note.id;
            }
          }
        } else {
          const note = await saveTopicNote(topicId, content, status);
          noteId = note?.id ?? currentNoteId!;
        }
        setCurrentNoteId(noteId);
        setLastSavedContent(content);
        setLastSavedAt(new Date());
        setIsDirty(false);
        emitToast(status === "published" ? "Topic note published." : "Draft saved.");
        if (isFirstSave) router.refresh();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unable to save the topic note.";
        setError(message);
        emitToast(message, "error");
      } finally {
        setIsSavingDraft(false);
      }
    });
  }

  async function ensureNoteId(): Promise<string> {
    if (currentNoteId) return currentNoteId;
    if (!editor) throw new Error("Editor isn't ready yet.");
    const { id, createdHere } = await createFirstNoteIfNeeded(getMarkdown(), "draft");
    if (createdHere) {
      setLastSavedContent(getMarkdown());
      setLastSavedAt(new Date());
      setIsDirty(false);
      router.refresh();
    }
    return id;
  }

  async function handleInsertVideoEmbed() {
    if (!videoUrl.trim()) {
      emitToast("Paste a YouTube or Vimeo URL first.", "error");
      return;
    }
    setIsSavingVideoEmbed(true);
    try {
      const savedNoteId = await ensureNoteId();
      const resource = await createVideoEmbedResource(topicId, savedNoteId, videoUrl, videoTitle);
      setLocalResources((previous) => [...previous, resource]);
      insertResourceMarker(resource);
      setVideoUrl("");
      setVideoTitle("");
      setVideoEmbedOpen(false);
      emitToast("Video embedded.");
    } catch (err: unknown) {
      emitToast(err instanceof Error ? err.message : "Unable to embed the video.", "error");
    } finally {
      setIsSavingVideoEmbed(false);
    }
  }

  async function handleAddLinkPreview(url: string) {
    setIsSavingLinkPreview(true);
    try {
      const savedNoteId = await ensureNoteId();
      const resource = await createLinkResource(topicId, savedNoteId, url);
      setLocalResources((previous) => [...previous, resource]);
      insertResourceMarker(resource);
      setLinkPreviewUrl("");
      setLinkPreviewOpen(false);
      emitToast("Link preview added.");
    } catch (err: unknown) {
      emitToast(
        err instanceof Error ? err.message : "Unable to fetch a preview for that link.",
        "error"
      );
    } finally {
      setIsSavingLinkPreview(false);
    }
  }

  function handleInsertLinkPreview() {
    if (!linkPreviewUrl.trim()) {
      emitToast("Paste a link first.", "error");
      return;
    }
    void handleAddLinkPreview(linkPreviewUrl.trim());
  }

  useEffect(() => {
    if (!pickerOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setPickerOpen is a stable state setter
  }, [pickerOpen]);

  useEffect(() => {
    if (!topicPickerOpen) {
      setTopicFilter("");
      return;
    }
    function handleClickOutside(e: MouseEvent) {
      if (topicPickerRef.current && !topicPickerRef.current.contains(e.target as Node)) {
        setTopicPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setTopicPickerOpen is a stable state setter
  }, [topicPickerOpen]);

  useEffect(() => {
    if (!emojiPickerOpen) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const insideToolbarAnchor = emojiPickerRef.current?.contains(target);
      const insideFloatingPopup = emojiPopupRef.current?.contains(target);
      if (!insideToolbarAnchor && !insideFloatingPopup) {
        setEmojiPickerOpen(false);
        setEmojiPickerPos(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setEmojiPickerOpen/setEmojiPickerPos are stable state setters
  }, [emojiPickerOpen]);

  useEffect(() => {
    if (!symbolPickerOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (symbolPickerRef.current && !symbolPickerRef.current.contains(e.target as Node))
        setSymbolPickerOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSymbolPickerOpen is a stable state setter
  }, [symbolPickerOpen]);

  useEffect(() => {
    if (!colorPickerOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node))
        setColorPickerOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [colorPickerOpen]);

  useEffect(() => {
    if (!a11yMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (a11yMenuRef.current && !a11yMenuRef.current.contains(e.target as Node)) {
        setA11yMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [a11yMenuOpen]);

  function promptForLink() {
    if (!editor) return;
    const url = window.prompt("Link URL (include https://)");
    if (url) editor.chain().focus().setLink({ href: url }).run();
  }

  function openSlashCommands() {
    if (!editor) return;
    editor.commands.focus();
    requestAnimationFrame(() => {
      const { from, to } = editor.state.selection;
      editor.view.dispatch(editor.state.tr.insertText("/", from, to));
    });
  }

  // Ctrl/Cmd+S saves a draft, Ctrl/Cmd+K opens links, Ctrl/Cmd+F opens
  // search, and Ctrl/Cmd+/ inserts the slash that activates the existing
  // TipTap suggestion menu. Ctrl/Cmd+B and +I are StarterKit keymaps.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && focusMode && !searchOpen) {
        setFocusMode(false);
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "s") {
        e.preventDefault();
        handleSave("draft");
      } else if (e.key === "k") {
        e.preventDefault();
        promptForLink();
      } else if (e.key === "f") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === "/" || e.code === "Slash") {
        if (!editor?.view.dom.contains(e.target as Node)) return;
        e.preventDefault();
        openSlashCommands();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, focusMode, searchOpen]);

  return (
    <div
      ref={editorShellRef}
      suppressHydrationWarning
      className={`${focusMode ? "fixed inset-0 z-50 overflow-y-auto bg-paper px-4 py-6 sm:px-8" : ""} [&:fullscreen]:h-screen [&:fullscreen]:overflow-y-auto [&:fullscreen]:bg-paper [&:fullscreen]:p-6`}
    >
      {!editor ? (
        <div className="min-h-[24rem] animate-pulse rounded-lg border border-rule bg-white p-4" />
      ) : (
        <>
          {focusMode && (
            <button
              type="button"
              onClick={() => setFocusMode(false)}
              className="fixed right-4 top-4 z-10 rounded-lg border border-rule bg-white px-3 py-1.5 text-sm font-medium text-ink shadow-sm hover:bg-paper"
            >
              Exit focus mode <span className="text-ink-soft">Esc</span>
            </button>
          )}

          {!focusMode && !isOnline && (
            <div className="mb-3 rounded-lg border border-clay/40 bg-clay/10 px-3 py-2 text-sm text-clay">
              You&apos;re offline — changes aren&apos;t being saved. Reconnect to save or publish.
            </div>
          )}

          {!focusMode && draftBanner && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-marigold/50 bg-marigold/10 px-3 py-2 text-sm text-ink">
              <span>
                Found unsaved changes from{" "}
                {new Date(draftBanner.updatedAt).toLocaleString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                  month: "short",
                  day: "numeric",
                })}{" "}
                — probably from a tab that closed before you could save.
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  onClick={restoreDraft}
                  className="rounded-lg bg-marigold px-3 py-1 text-xs font-medium text-ink hover:bg-marigold-dark"
                >
                  Restore
                </button>
                <button
                  type="button"
                  onClick={discardDraft}
                  className="rounded-lg border border-rule px-3 py-1 text-xs text-ink-soft hover:bg-white"
                >
                  Discard
                </button>
              </span>
            </div>
          )}

          {!focusMode && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rule bg-white p-3 shadow-sm">
              <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">
                  Currently
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${initialStatus === "published" ? "bg-leaf/15 text-leaf" : initialStatus === "draft" ? "bg-marigold/20 text-ink" : "bg-paper text-ink-soft"}`}
                >
                  {initialStatus}
                </span>
                {isDirty && (
                  <span className="ml-2 normal-case text-marigold-text">Unsaved changes</span>
                )}
                {isSavingDraft && <span className="ml-2 normal-case">Saving…</span>}
                {!isSavingDraft && lastSavedAt && (
                  <span className="ml-2 normal-case">
                    Last saved{" "}
                    {lastSavedAt.toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                )}
                {isDirty && autosaveStatus === "saved" && lastAutosaveAt && (
                  <span className="ml-2 normal-case text-ink-soft/70">
                    (autosaved{" "}
                    {lastAutosaveAt.toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    )
                  </span>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative" ref={pickerRef}>
                  <button
                    type="button"
                    onClick={() => setPickerOpen((open) => !open)}
                    disabled={isPending || localResources.length === 0}
                    className="rounded-lg border border-rule px-3 py-1.5 text-sm text-ink hover:bg-paper disabled:opacity-60"
                    title={
                      localResources.length === 0
                        ? "No resources attached to this topic yet"
                        : undefined
                    }
                  >
                    Insert resource
                  </button>
                  {pickerOpen && localResources.length > 0 && (
                    <div className="absolute right-0 z-10 mt-1 max-h-64 w-64 overflow-y-auto rounded-lg border border-rule bg-white py-1 shadow-lg">
                      {localResources.map((resource) => (
                        <button
                          key={resource.id}
                          type="button"
                          onClick={() => handlePickResource(resource)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-paper"
                        >
                          <span className="truncate">{resource.title ?? "Untitled resource"}</span>
                          <span className="shrink-0 text-xs uppercase tracking-wide text-ink-soft">
                            {RESOURCE_TYPE_LABEL[resource.resource_type]}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative" ref={topicPickerRef}>
                  <button
                    type="button"
                    onClick={() => setTopicPickerOpen((open) => !open)}
                    disabled={isPending || topics.length === 0}
                    className="rounded-lg border border-rule px-3 py-1.5 text-sm text-ink hover:bg-paper disabled:opacity-60"
                    title={
                      topics.length === 0
                        ? "No other topics for this subject yet"
                        : "Link another topic — opens its own note, doesn't embed its content"
                    }
                  >
                    Link topic
                  </button>
                  {topicPickerOpen && topics.length > 0 && (
                    <div className="absolute right-0 z-10 mt-1 w-64 rounded-lg border border-rule bg-white py-1 shadow-lg">
                      {topics.length > 5 && (
                        <div className="px-2 pb-1">
                          <input
                            autoFocus
                            type="text"
                            value={topicFilter}
                            onChange={(e) => setTopicFilter(e.target.value)}
                            placeholder="Filter by title…"
                            className="w-full rounded-md border border-rule px-2 py-1 text-sm outline-none focus-visible:border-marigold"
                          />
                        </div>
                      )}
                      <div className="max-h-64 overflow-y-auto">
                        {topics
                          .filter((t) =>
                            t.title.toLowerCase().includes(topicFilter.trim().toLowerCase())
                          )
                          .map((topic) => (
                            <button
                              key={topic.id}
                              type="button"
                              onClick={() => handlePickTopic(topic)}
                              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-paper"
                            >
                              <span className="min-w-0 truncate">{topic.title}</span>
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setDiagramPanelOpen((open) => !open)}
                  disabled={isPending}
                  className="rounded-lg border border-rule px-3 py-1.5 text-sm text-ink hover:bg-paper disabled:opacity-60"
                >
                  Generate Mermaid diagram
                </button>
                <button
                  type="button"
                  onClick={() => setVideoEmbedOpen((open) => !open)}
                  disabled={isPending}
                  className="rounded-lg border border-rule px-3 py-1.5 text-sm text-ink hover:bg-paper disabled:opacity-60"
                >
                  Embed video
                </button>
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="rounded-lg border border-marigold bg-marigold/15 px-3 py-1.5 text-sm font-medium text-ink hover:bg-marigold/25"
                >
                  {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                </button>
                <button
                  type="button"
                  onClick={() => setLinkPreviewOpen((open) => !open)}
                  disabled={isPending}
                  className="rounded-lg border border-rule px-3 py-1.5 text-sm text-ink hover:bg-paper disabled:opacity-60"
                >
                  Add link
                </button>

                <button
                  onClick={() => handleSave("draft")}
                  disabled={isPending || !isOnline}
                  title={!isOnline ? "You're offline" : "Save draft (Ctrl/Cmd+S)"}
                  className="rounded-lg border border-rule px-3 py-1.5 text-sm text-ink hover:bg-paper disabled:opacity-60"
                >
                  {isSavingDraft ? "Saving…" : "Save draft"}
                </button>
                <button
                  onClick={() => handleSave("published")}
                  disabled={isPending || !isOnline}
                  title={!isOnline ? "You're offline" : undefined}
                  className="rounded-lg bg-marigold px-3 py-1.5 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
                >
                  Publish
                </button>
              </div>
            </div>
          )}

          {!focusMode && videoEmbedOpen && (
            <VideoEmbedPopover
              videoUrl={videoUrl}
              onVideoUrlChange={setVideoUrl}
              videoTitle={videoTitle}
              onVideoTitleChange={setVideoTitle}
              isSaving={isSavingVideoEmbed}
              onInsert={handleInsertVideoEmbed}
              onClose={() => setVideoEmbedOpen(false)}
            />
          )}

          {!focusMode && linkPreviewOpen && (
            <LinkPreviewPopover
              linkPreviewUrl={linkPreviewUrl}
              onLinkPreviewUrlChange={setLinkPreviewUrl}
              isSaving={isSavingLinkPreview}
              onInsert={handleInsertLinkPreview}
              onClose={() => setLinkPreviewOpen(false)}
            />
          )}

          {!focusMode && diagramPanelOpen && (
            <DiagramPanel
              ref={diagramSectionRef}
              diagramTitle={diagramTitle}
              onDiagramTitleChange={setDiagramTitle}
              diagramCode={diagramCode}
              onDiagramCodeChange={setDiagramCode}
              isSaving={isSavingDiagram}
              onSave={handleSaveDiagram}
              onClose={() => setDiagramPanelOpen(false)}
            />
          )}

          {/* Mobile write/preview toggle — md:hidden, desktop always shows toolbar + editable view */}
          {!focusMode && searchOpen && (
            <section
              className="mb-3 rounded-lg border border-rule bg-paper p-3"
              aria-label="Search and replace"
            >
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="note-search">
                  Find text
                </label>
                <input
                  ref={searchInputRef}
                  id="note-search"
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      selectSearchMatch(e.shiftKey ? -1 : 1);
                    } else if (e.key === "Escape") {
                      setSearchOpen(false);
                      editor.commands.focus();
                    }
                  }}
                  placeholder="Find"
                  className="min-w-40 flex-1 rounded-md border border-rule bg-white px-2.5 py-1.5 text-sm text-ink outline-none focus-visible:border-marigold"
                />
                <span className="min-w-16 text-center text-xs text-ink-soft" aria-live="polite">
                  {searchTerm
                    ? `${searchMatches.length} match${searchMatches.length === 1 ? "" : "es"}`
                    : "Find text"}
                </span>
                <button
                  type="button"
                  onClick={() => selectSearchMatch(-1)}
                  disabled={searchMatches.length === 0}
                  className="rounded-md border border-rule bg-white px-2.5 py-1.5 text-sm text-ink hover:bg-white/70 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => selectSearchMatch(1)}
                  disabled={searchMatches.length === 0}
                  className="rounded-md border border-rule bg-white px-2.5 py-1.5 text-sm text-ink hover:bg-white/70 disabled:opacity-40"
                >
                  Next
                </button>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-soft">
                  <input
                    type="checkbox"
                    checked={matchCase}
                    onChange={(e) => setMatchCase(e.target.checked)}
                    className="accent-marigold"
                  />
                  Match case
                </label>
                <button
                  type="button"
                  onClick={() => setSearchOpen(false)}
                  className="ml-auto rounded-md px-2 py-1.5 text-xs text-ink-soft hover:bg-white hover:text-ink"
                >
                  Close
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="note-replace">
                  Replace with
                </label>
                <input
                  id="note-replace"
                  type="text"
                  value={replaceTerm}
                  onChange={(e) => setReplaceTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setSearchOpen(false);
                      editor.commands.focus();
                    }
                  }}
                  placeholder="Replace with"
                  className="min-w-40 flex-1 rounded-md border border-rule bg-white px-2.5 py-1.5 text-sm text-ink outline-none focus-visible:border-marigold"
                />
                <button
                  type="button"
                  onClick={replaceSearchMatch}
                  disabled={searchMatches.length === 0}
                  className="rounded-md border border-rule bg-white px-2.5 py-1.5 text-sm text-ink hover:bg-white/70 disabled:opacity-40"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={replaceAllSearchMatches}
                  disabled={searchMatches.length === 0}
                  className="rounded-md bg-marigold px-2.5 py-1.5 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-40"
                >
                  Replace all
                </button>
              </div>
            </section>
          )}

          {!focusMode && !forcePreview && (
            <div className="mb-2 flex gap-1 rounded-lg border border-rule bg-paper p-1 md:hidden">
              <button
                type="button"
                onClick={() => setMobileTab("write")}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${mobileTab === "write" ? "bg-white text-ink shadow-sm" : "text-ink-soft"}`}
              >
                Write
              </button>
              <button
                type="button"
                onClick={() => setMobileTab("preview")}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${mobileTab === "preview" ? "bg-white text-ink shadow-sm" : "text-ink-soft"}`}
              >
                Preview
              </button>
              <button
                type="button"
                onClick={() => setMobileTab("resources")}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${mobileTab === "resources" ? "bg-white text-ink shadow-sm" : "text-ink-soft"}`}
              >
                Resources
              </button>
            </div>
          )}

          {!focusMode && !forcePreview && (
            <NoteToolbar
              editor={editor}
              mobileTab={mobileTab}
              searchOpen={searchOpen}
              onOpenSearch={() => setSearchOpen(true)}
              onEnterFocusMode={enterFocusMode}
              colorPickerOpen={colorPickerOpen}
              setColorPickerOpen={setColorPickerOpen}
              colorPickerRef={colorPickerRef}
              emojiPickerOpen={emojiPickerOpen}
              setEmojiPickerOpen={setEmojiPickerOpen}
              emojiPickerPos={emojiPickerPos}
              setEmojiPickerPos={setEmojiPickerPos}
              emojiPickerRef={emojiPickerRef}
              onInsertEmoji={insertEmoji}
              symbolPickerOpen={symbolPickerOpen}
              setSymbolPickerOpen={setSymbolPickerOpen}
              symbolPickerRef={symbolPickerRef}
              onInsertSymbol={insertSymbol}
              onOpenSlashCommands={openSlashCommands}
              onInsertMath={insertMath}
              onInsertTable={insertTable}
              a11yMenuOpen={a11yMenuOpen}
              setA11yMenuOpen={setA11yMenuOpen}
              a11yMenuRef={a11yMenuRef}
              fontScale={fontScale}
              setFontScale={setFontScale}
              highContrast={highContrast}
              setHighContrast={setHighContrast}
              dyslexiaFont={dyslexiaFont}
              setDyslexiaFont={setDyslexiaFont}
              spellcheckEnabled={spellcheckEnabled}
              setSpellcheckEnabled={setSpellcheckEnabled}
            />
          )}

          {emojiPickerOpen && emojiPickerPos && (
            <div
              ref={emojiPopupRef}
              style={{ position: "fixed", left: emojiPickerPos.left, top: emojiPickerPos.top }}
              className="z-20"
            >
              <EmojiPicker onSelectAction={insertEmoji} />
            </div>
          )}

          {editor && (
            <BubbleMenu
              editor={editor}
              pluginKey="tableBubbleMenu"
              shouldShow={({ editor: e }) => e.isActive("table")}
              options={{
                placement: "top",
                offset: 10,
                flip: { boundary: noteContainerRef.current ?? "clippingAncestors", padding: 8 },
                shift: { boundary: noteContainerRef.current ?? "clippingAncestors", padding: 8 },
              }}
            >
              <div
                role="toolbar"
                aria-label="Table formatting"
                className="flex flex-wrap items-center gap-0.5 rounded-xl border border-rule/70 bg-white p-1.5 shadow-lg shadow-ink/10 ring-1 ring-ink/5"
              >
                <span className="px-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                  Table
                </span>
                <span className="mx-0.5 h-5 w-px bg-rule/70" />

                <div className="flex items-center gap-0.5" role="group" aria-label="Row actions">
                  <button
                    type="button"
                    title="Add row above"
                    aria-label="Add row above"
                    onClick={() => editor.chain().focus().addRowBefore().run()}
                    className="rounded-md p-1.5 text-ink transition-colors hover:bg-paper active:bg-rule/30"
                  >
                    <AddRowAboveIcon />
                  </button>
                  <button
                    type="button"
                    title="Add row below"
                    aria-label="Add row below"
                    onClick={() => editor.chain().focus().addRowAfter().run()}
                    className="rounded-md p-1.5 text-ink transition-colors hover:bg-paper active:bg-rule/30"
                  >
                    <AddRowBelowIcon />
                  </button>
                  <button
                    type="button"
                    title="Delete row"
                    aria-label="Delete row"
                    onClick={() => editor.chain().focus().deleteRow().run()}
                    className="rounded-md p-1.5 text-red-600 transition-colors hover:bg-red-50 active:bg-red-100"
                  >
                    <DeleteRowIcon />
                  </button>
                </div>

                <span className="mx-1 h-5 w-px bg-rule/70" />

                <div className="flex items-center gap-0.5" role="group" aria-label="Column actions">
                  <button
                    type="button"
                    title="Add column left"
                    aria-label="Add column left"
                    onClick={() => editor.chain().focus().addColumnBefore().run()}
                    className="rounded-md p-1.5 text-ink transition-colors hover:bg-paper active:bg-rule/30"
                  >
                    <AddColLeftIcon />
                  </button>
                  <button
                    type="button"
                    title="Add column right"
                    aria-label="Add column right"
                    onClick={() => editor.chain().focus().addColumnAfter().run()}
                    className="rounded-md p-1.5 text-ink transition-colors hover:bg-paper active:bg-rule/30"
                  >
                    <AddColRightIcon />
                  </button>
                  <button
                    type="button"
                    title="Delete column"
                    aria-label="Delete column"
                    onClick={() => editor.chain().focus().deleteColumn().run()}
                    className="rounded-md p-1.5 text-red-600 transition-colors hover:bg-red-50 active:bg-red-100"
                  >
                    <DeleteColIcon />
                  </button>
                </div>

                <span className="mx-1 h-5 w-px bg-rule/70" />

                <div className="flex items-center gap-0.5" role="group" aria-label="Cell actions">
                  <button
                    type="button"
                    title="Merge cells"
                    aria-label="Merge cells"
                    disabled={!editor.can().mergeCells()}
                    onClick={() => editor.chain().focus().mergeCells().run()}
                    className="rounded-md p-1.5 text-ink transition-colors hover:bg-paper active:bg-rule/30 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <MergeCellsIcon />
                  </button>
                  <button
                    type="button"
                    title="Split cell"
                    aria-label="Split cell"
                    disabled={!editor.can().splitCell()}
                    onClick={() => editor.chain().focus().splitCell().run()}
                    className="rounded-md p-1.5 text-ink transition-colors hover:bg-paper active:bg-rule/30 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <SplitCellIcon />
                  </button>
                  <button
                    type="button"
                    title="Toggle header row"
                    aria-label="Toggle header row"
                    onClick={() => editor.chain().focus().toggleHeaderRow().run()}
                    className={`rounded-md p-1.5 transition-colors hover:bg-paper active:bg-rule/30 ${
                      editor.isActive("tableHeader") ? "bg-marigold/15 text-ink" : "text-ink"
                    }`}
                  >
                    <HeaderRowIcon />
                  </button>
                </div>

                <span className="mx-1 h-5 w-px bg-rule/70" />

                <button
                  type="button"
                  title="Delete table"
                  aria-label="Delete table"
                  onClick={() => editor.chain().focus().deleteTable().run()}
                  className="rounded-md p-1.5 text-red-600 transition-colors hover:bg-red-50 active:bg-red-100"
                >
                  <DeleteTableIcon />
                </button>
              </div>
            </BubbleMenu>
          )}

          {editor && (
            <BubbleMenu
              editor={editor}
              options={{
                placement: "top",
                offset: 10,
                flip: { boundary: noteContainerRef.current ?? "clippingAncestors", padding: 8 },
                shift: { boundary: noteContainerRef.current ?? "clippingAncestors", padding: 8 },
              }}
            >
              <div
                role="toolbar"
                aria-label="Text formatting"
                className="flex items-center gap-1 rounded-lg border border-rule bg-white px-1 py-1 shadow-lg"
              >
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  className="rounded px-2 py-1 text-sm font-semibold hover:bg-paper"
                  title="Bold (Ctrl/Cmd+B)"
                  aria-label="Bold"
                  aria-pressed={editor.isActive("bold")}
                >
                  B
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  className="rounded px-2 py-1 text-sm italic hover:bg-paper"
                  title="Italic (Ctrl/Cmd+I)"
                  aria-label="Italic"
                  aria-pressed={editor.isActive("italic")}
                >
                  I
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleUnderline().run()}
                  className="rounded px-2 py-1 text-sm underline hover:bg-paper"
                  title="Underline (Ctrl/Cmd+U)"
                  aria-label="Underline"
                  aria-pressed={editor.isActive("underline")}
                >
                  U
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleHighlight().run()}
                  className={`rounded px-2 py-1 text-sm hover:bg-paper ${editor.isActive("highlight") ? "bg-paper" : ""}`}
                  title="Highlight"
                  aria-label="Highlight"
                >
                  ▧
                </button>
                <button
                  type="button"
                  onClick={promptForLink}
                  className="rounded px-2 py-1 text-sm hover:bg-paper"
                  title="Link (Ctrl/Cmd+K)"
                  aria-label="Link (Ctrl/Cmd+K)"
                >
                  🔗
                </button>
              </div>
            </BubbleMenu>
          )}
          <div
            ref={noteContainerRef}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{ "--note-font-size": `${fontScale}rem` } as React.CSSProperties}
            className={`topic-prose relative min-h-[24rem] bg-white p-4 ${
              mobileTab === "resources" ? "hidden md:block" : ""
            } ${highContrast ? "a11y-high-contrast" : ""} ${dyslexiaFont ? "a11y-dyslexia-font" : ""} ${
              focusMode
                ? "mx-auto mt-10 max-w-4xl rounded-lg border border-rule shadow-sm"
                : `rounded-lg border ${isDraggingFile ? "border-2 border-dashed border-marigold bg-marigold/10" : "border-rule"}`
            }`}
          >
            <EditorContent editor={editor} />
            {isDraggingFile && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-white/80">
                <p className="rounded-lg border border-marigold bg-white px-4 py-2 text-sm font-medium text-ink shadow-sm">
                  Drop to attach and insert
                </p>
              </div>
            )}
            {uploadingCount > 0 && (
              <div className="pointer-events-none absolute bottom-3 right-3 rounded-lg border border-rule bg-white px-3 py-1.5 text-xs font-medium text-ink-soft shadow-sm">
                Uploading {uploadingCount} file{uploadingCount === 1 ? "" : "s"}…
              </div>
            )}
          </div>

          {editor && (
            <div
              className={`mt-2 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft ${
                mobileTab === "resources" ? "hidden md:flex" : "flex"
              }`}
            >
              {noteStats && (
                <>
                  <span>
                    {noteStats.words} word{noteStats.words === 1 ? "" : "s"}
                  </span>
                  <span>
                    {noteStats.characters} character{noteStats.characters === 1 ? "" : "s"}
                  </span>
                  <span>~{noteStats.readingMinutes} min read</span>
                  {noteStats.headings > 0 && (
                    <span>
                      {noteStats.headings} heading{noteStats.headings === 1 ? "" : "s"}
                    </span>
                  )}
                  {noteStats.tables > 0 && (
                    <span>
                      {noteStats.tables} table{noteStats.tables === 1 ? "" : "s"}
                    </span>
                  )}
                  {noteStats.images > 0 && (
                    <span>
                      {noteStats.images} image{noteStats.images === 1 ? "" : "s"}
                    </span>
                  )}
                  {noteStats.resources > 0 && (
                    <span>
                      {noteStats.resources} resource{noteStats.resources === 1 ? "" : "s"}
                    </span>
                  )}
                  {noteStats.linkedTopics > 0 && (
                    <span>
                      {noteStats.linkedTopics} linked topic{noteStats.linkedTopics === 1 ? "" : "s"}
                    </span>
                  )}
                </>
              )}
            </div>
          )}

          <p
            className={`mt-3 text-xs text-ink-soft ${
              mobileTab === "resources" ? "hidden md:block" : ""
            }`}
          >
            Images, videos, and other uploaded resources are attached separately after publishing —
            use &quot;Insert resource&quot; to place one at a specific point in the text, drag a
            file straight onto the editor to upload and insert it in one step, or &quot;Generate
            Mermaid diagram&quot; to create and insert a new diagram directly. Click the ∑ / ∑∑
            buttons to add math, then click the equation to edit its LaTeX.
          </p>
          {error && <p className="mt-2 text-sm text-clay">{error}</p>}
        </>
      )}
    </div>
  );
});
