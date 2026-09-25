/**
 * TopicLinkChip — a TipTap inline atom node standing in for
 * `[[topic:UUID]]` markers. Cross-references another topic ("see the
 * note on Photosynthesis") -- a link, not an embed: no note content
 * gets pulled in, just a reference card that opens the linked topic.
 *
 * Ported from jaladedev/school_app's lib/tiptap/topic-link-node.tsx
 * (SHA 466c538). AssessmentChip's sibling node is dropped (no
 * assessments in this app). LinkableTopic drops term/week_number
 * (school_app-specific) since this app's topics have no term/week
 * concept -- the preview card just shows the title.
 */
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { clampPopoverToEditor } from "./popover-position";
import { dragAwareStopEvent } from "./drag-utils";

export type LinkableTopic = {
  id: string;
  title: string;
};

// `[[topic:UUID]]` -- same bracket-marker shape as `[[resource:UUID]]`,
// so it round-trips through the same plain-text storage saveTopicNote
// already writes.
const TOPIC_LINK_MARKER_RE = /\[\[topic:([0-9a-fA-F-]{36})\]\]/;

interface TopicLinkChipStorage {
  topics: LinkableTopic[];
}

declare module "@tiptap/core" {
  interface Storage {
    topicLinkChip: TopicLinkChipStorage;
  }
}

function TopicLinkChipView({
  node,
  editor,
  deleteNode,
}: {
  node: any;
  editor: any;
  deleteNode: () => void;
}) {
  const id: string = node.attrs.id;
  const storage: TopicLinkChipStorage = editor.storage.topicLinkChip ?? { topics: [] };
  const topic = storage.topics.find((t) => t.id === id) ?? null;

  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [dragArmed, setDragArmed] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!previewOpen || !popoverRef.current) return;
    clampPopoverToEditor(popoverRef.current, editor?.view?.dom ?? null);
  }, [previewOpen, editor]);

  function closePopover() {
    setPreviewOpen(false);
    setConfirmingRemove(false);
  }

  return (
    <NodeViewWrapper
      as="span"
      ref={wrapperRef}
      className="relative inline-flex items-center align-middle"
      contentEditable={false}
      draggable={dragArmed}
      onDragEnd={() => setDragArmed(false)}
    >
      <span
        onMouseDown={() => setDragArmed(true)}
        onMouseUp={() => setDragArmed(false)}
        contentEditable={false}
        title="Drag to reorder (or select it and press Alt+Left/Right)"
        aria-label="Drag to reorder this topic link, or select it and press Alt+Left or Alt+Right"
        role="button"
        data-drag-handle
        className="mr-0.5 inline-flex cursor-grab select-none items-center text-xs text-ink-soft/60 hover:text-ink-soft active:cursor-grabbing"
      >
        ⠿
      </span>
      <button
        type="button"
        onClick={() => {
          setPreviewOpen((open) => !open);
          setConfirmingRemove(false);
        }}
        className={`mx-0.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
          topic
            ? "border-marigold/40 bg-marigold/10 text-ink hover:border-marigold"
            : "border-clay/40 bg-clay/10 text-clay"
        }`}
        contentEditable={false}
        data-topic-link-id={id}
        title={topic ? "Click to view or remove this link" : "This topic no longer exists"}
      >
        <span aria-hidden>{topic ? "📄" : "⚠️"}</span>
        <span className="max-w-[9rem] truncate">{topic ? topic.title : "Missing topic"}</span>
      </button>

      {previewOpen && (
        <span
          ref={popoverRef}
          contentEditable={false}
          className="absolute left-0 top-full z-20 mt-1 w-72 max-w-[90vw] rounded-lg border border-rule bg-white p-4 shadow-xl"
          onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
          onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
          onKeyUp={(e: React.KeyboardEvent) => e.stopPropagation()}
        >
          {topic ? (
            <span className="block">
              <span className="mb-1 flex items-center gap-1.5 text-sm font-medium text-ink">
                <span aria-hidden>📄</span>
                {topic.title}
              </span>

              {confirmingRemove ? (
                <span className="mt-3 flex items-center justify-between gap-2 rounded-md border border-clay/40 bg-clay/10 p-2">
                  <span className="text-xs text-clay">Remove this link from the note?</span>
                  <span className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setConfirmingRemove(false)}
                      className="text-xs text-ink-soft hover:underline"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteNode()}
                      className="rounded bg-clay px-2 py-1 text-xs font-medium text-white hover:bg-clay/90"
                    >
                      Remove
                    </button>
                  </span>
                </span>
              ) : (
                <span className="mt-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={closePopover}
                    className="text-xs text-ink-soft hover:underline"
                  >
                    Close
                  </button>
                  <span className="flex items-center gap-3">
                    <Link
                      href={`/dashboard/teacher/notes/${topic.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-leaf hover:underline"
                    >
                      Open note ↗
                    </Link>
                    <button
                      type="button"
                      onClick={() => setConfirmingRemove(true)}
                      className="text-xs font-medium text-clay hover:underline"
                    >
                      Remove from note
                    </button>
                  </span>
                </span>
              )}
            </span>
          ) : (
            <span className="block">
              <span className="block text-sm text-clay">
                This topic was deleted elsewhere. Remove this link, or link a different one from
                &quot;Link topic&quot;.
              </span>
              <span className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => deleteNode()}
                  className="rounded bg-clay px-2 py-1 text-xs font-medium text-white hover:bg-clay/90"
                >
                  Remove
                </button>
              </span>
            </span>
          )}
        </span>
      )}
    </NodeViewWrapper>
  );
}

export const TopicLinkChip = Node.create({
  name: "topicLinkChip",
  group: "inline",
  inline: true,
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      id: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-topic-link-id]",
        getAttrs: (el) => ({
          id: (el as HTMLElement).getAttribute("data-topic-link-id"),
        }),
      },
    ];
  },

  renderHTML({ node }) {
    return ["span", mergeAttributes({ "data-topic-link-id": node.attrs.id })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TopicLinkChipView, {
      stopEvent: dragAwareStopEvent,
    });
  },

  addStorage() {
    return { topics: [] as LinkableTopic[] } as TopicLinkChipStorage;
  },
});

function topicLinkMarkdownPlugin(md: any) {
  md.inline.ruler.before("link", "topic_link_chip", (state: any, silent: boolean) => {
    const match = TOPIC_LINK_MARKER_RE.exec(state.src.slice(state.pos));
    if (!match || match.index !== 0) return false;
    if (!silent) {
      const token = state.push("topic_link_chip", "", 0);
      token.attrs = [["id", match[1]]];
    }
    state.pos += match[0].length;
    return true;
  });

  md.renderer.rules.topic_link_chip = (tokens: any[], idx: number) => {
    const id = tokens[idx].attrs.find((a: string[]) => a[0] === "id")[1];
    return `<span data-topic-link-id="${id}"></span>`;
  };
}

TopicLinkChip.config.addStorage = function () {
  return {
    topics: [] as LinkableTopic[],
    markdown: {
      serialize(state: any, node: any) {
        state.write(`[[topic:${node.attrs.id}]]`);
      },
      parse: {
        setup(md: any) {
          topicLinkMarkdownPlugin(md);
        },
      },
    },
  };
};
