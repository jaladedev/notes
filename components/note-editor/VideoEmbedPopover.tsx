type VideoEmbedPopoverProps = {
  videoUrl: string;
  onVideoUrlChange: (value: string) => void;
  videoTitle: string;
  onVideoTitleChange: (value: string) => void;
  isSaving: boolean;
  onInsert: () => void;
  onClose: () => void;
};

export function VideoEmbedPopover({
  videoUrl,
  onVideoUrlChange,
  videoTitle,
  onVideoTitleChange,
  isSaving,
  onInsert,
  onClose,
}: VideoEmbedPopoverProps) {
  return (
    <section className="mb-4 rounded-xl border border-rule bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-ink">Embed video</h3>
        <button type="button" onClick={onClose} className="text-xs text-ink-soft hover:underline">
          Close
        </button>
      </div>
      <p className="mb-3 text-sm text-ink-soft">
        Paste a YouTube or Vimeo link. Uploaded video files remain available through Insert
        resource.
      </p>
      <input
        value={videoUrl}
        onChange={(e) => onVideoUrlChange(e.target.value)}
        placeholder="https://www.youtube.com/watch?v=…"
        type="url"
        className="mb-2 w-full rounded-lg border border-rule p-2 text-sm outline-none focus-visible:border-marigold"
      />
      <input
        value={videoTitle}
        onChange={(e) => onVideoTitleChange(e.target.value)}
        placeholder="Video title (optional)"
        className="w-full rounded-lg border border-rule p-2 text-sm outline-none focus-visible:border-marigold"
      />
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onInsert}
          disabled={isSaving}
          className="rounded-lg bg-marigold px-3 py-1.5 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
        >
          {isSaving ? "Embedding…" : "Insert video"}
        </button>
      </div>
    </section>
  );
}
