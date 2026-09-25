type LinkPreviewPopoverProps = {
  linkPreviewUrl: string;
  onLinkPreviewUrlChange: (value: string) => void;
  isSaving: boolean;
  onInsert: () => void;
  onClose: () => void;
};

export function LinkPreviewPopover({
  linkPreviewUrl,
  onLinkPreviewUrlChange,
  isSaving,
  onInsert,
  onClose,
}: LinkPreviewPopoverProps) {
  return (
    <section className="mb-4 rounded-xl border border-rule bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-ink">Add link</h3>
        <button type="button" onClick={onClose} className="text-xs text-ink-soft hover:underline">
          Close
        </button>
      </div>
      <p className="mb-3 text-sm text-ink-soft">
        Paste any link -- title, thumbnail, and description are fetched automatically.
      </p>
      <input
        value={linkPreviewUrl}
        onChange={(e) => onLinkPreviewUrlChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !isSaving) onInsert();
        }}
        placeholder="https://example.com/article"
        type="url"
        className="w-full rounded-lg border border-rule p-2 text-sm outline-none focus-visible:border-marigold"
      />
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onInsert}
          disabled={isSaving}
          className="rounded-lg bg-marigold px-3 py-1.5 text-sm font-medium text-ink hover:bg-marigold-dark disabled:opacity-60"
        >
          {isSaving ? "Fetching…" : "Add link"}
        </button>
      </div>
    </section>
  );
}
