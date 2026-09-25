"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { splitContentByMarkers, TopicResourceItem } from "@/components/TopicContent";
import type { TopicResource } from "@/types/database";

type Slide = { heading: string | null; body: string };

// Splits raw note markdown into slides on every top-level "## " heading.
// Any text before the first such heading becomes an (optional) intro
// slide. Sub-headings ("###" and deeper) stay inside their parent slide
// rather than starting a new one, so a topic note's existing section
// structure maps onto slides without the author needing to restructure it.
function splitIntoSlides(content: string): Slide[] {
  // Normalize line endings first. Content that arrives with "\r\n" or a
  // lone "\r" (common after a paste from Windows-authored text, or a
  // round-trip through some editors/DB tools) leaves a trailing "\r" on
  // every line once split on "\n" alone. JavaScript's "." in a regex
  // never matches "\r", so "(.*)" can't consume it and "$" never reaches
  // the true end of the line — the heading regex below then silently
  // fails to match anything at all, and the whole note collapses into a
  // single slide instead of splitting on "## " headings.
  const normalized = content.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const slides: Slide[] = [];
  let current: string[] = [];
  let currentHeading: string | null = null;

  for (const line of lines) {
    const match = /^##\s+(.*)$/.exec(line);
    if (match) {
      if (current.some((l) => l.trim())) {
        slides.push({ heading: currentHeading, body: current.join("\n") });
      }
      currentHeading = match[1].trim();
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.some((l) => l.trim()) || slides.length === 0) {
    slides.push({ heading: currentHeading, body: current.join("\n") });
  }

  return slides;
}

// Logical width slide content wraps at before scaling, in px — playing the
// same role as a fixed "canvas" size in presentation software. Text reflows
// at this width regardless of the actual screen size, then the whole block
// is scaled uniformly to fit whatever room is actually available, so line
// breaks stay predictable instead of re-wrapping at every viewport size.
const CONTENT_WIDTH = 900;
const MIN_SCALE = 0.5;
const MAX_SCALE = 2.25;

export function NoteSlideView({
  content,
  resources,
}: {
  content: string;
  resources: TopicResource[];
}) {
  const slides = useMemo(() => splitIntoSlides(content), [content]);
  const [index, setIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const [needsScrollFallback, setNeedsScrollFallback] = useState(false);
  const [measured, setMeasured] = useState(false);

  const clampedIndex = Math.min(index, slides.length - 1);
  const slide = slides[clampedIndex];

  // Which resources are never referenced by a [[resource:id]] marker
  // *anywhere* in the note, computed once against the full original
  // content — not per-slide. A resource marker that lives in an earlier
  // slide's body would otherwise look "unmatched" when a later slide runs
  // its own splitContentByMarkers call against the complete resource
  // list, causing that resource to render a second time at the end in
  // addition to its correct inline placement.
  const { leftover: noteLeftover } = useMemo(
    () => splitContentByMarkers(content, resources),
    [content, resources]
  );

  // Per-slide split only supplies inline placement for markers that fall
  // within this slide's body; its own "leftover" is intentionally ignored
  // in favor of noteLeftover above.
  const { parts } = useMemo(
    () => splitContentByMarkers(slide?.body ?? "", resources),
    [slide, resources]
  );
  const isLastSlide = clampedIndex === slides.length - 1;

  const goTo = useCallback(
    (next: number) => {
      setIndex(Math.max(0, Math.min(slides.length - 1, next)));
    },
    [slides.length]
  );

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "PageDown") goTo(clampedIndex + 1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") goTo(clampedIndex - 1);
      if (e.key === "Escape" && document.fullscreenElement) document.exitFullscreen();
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [clampedIndex, goTo]);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await containerRef.current?.requestFullscreen();
  }

  // Tracks the available space for slide content. A ResizeObserver (rather
  // than a one-off measurement) is needed because entering/exiting
  // fullscreen, or a window resize while presenting, changes this without
  // necessarily changing React state on its own.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !isFullscreen) {
      setMeasured(false);
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setViewportSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [isFullscreen]);

  // Re-measures the content's natural (unscaled) size at CONTENT_WIDTH
  // whenever the slide, its rendered parts, or the available space change,
  // and derives a uniform scale that fits it to the viewport — shrinking
  // long slides down, and growing short ones up, rather than leaving short
  // slides small and top-aligned.
  useLayoutEffect(() => {
    if (!isFullscreen) return;
    const contentEl = contentRef.current;
    if (!contentEl || viewportSize.width === 0 || viewportSize.height === 0) return;

    const naturalHeight = contentEl.scrollHeight;
    const scaleW = viewportSize.width / CONTENT_WIDTH;
    const scaleH = naturalHeight > 0 ? viewportSize.height / naturalHeight : MAX_SCALE;
    const rawScale = Math.min(scaleW, scaleH);

    setNeedsScrollFallback(rawScale < MIN_SCALE);
    setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, rawScale)));
    setMeasured(true);
  }, [isFullscreen, viewportSize, clampedIndex, parts, isLastSlide, noteLeftover]);

  return (
    <div
      ref={containerRef}
      className={
        isFullscreen
          ? "flex h-screen w-screen flex-col bg-white p-10"
          : "flex flex-col rounded-xl border border-rule bg-white p-6"
      }
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-ink-soft">
          Slide {clampedIndex + 1} of {slides.length}
          {slide?.heading ? ` · ${slide.heading}` : ""}
        </p>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="rounded-lg border border-rule px-3 py-1.5 text-sm text-ink hover:bg-paper"
        >
          {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        </button>
      </div>

      {isFullscreen ? (
        <div
          ref={viewportRef}
          className={`relative flex flex-1 items-center justify-center ${
            needsScrollFallback ? "overflow-y-auto" : "overflow-hidden"
          }`}
        >
          <div
            ref={contentRef}
            style={{
              width: CONTENT_WIDTH,
              transform: needsScrollFallback ? `scale(${MIN_SCALE})` : `scale(${scale})`,
              transformOrigin: "center center",
              visibility: measured ? "visible" : "hidden",
            }}
            className="topic-prose slide-prose [&_ol]:list-inside [&_ul]:list-inside"
          >
            {parts.map(
              (part, i) =>
                part.type === "text" ? (
                  <ReactMarkdown
                    key={i}
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight]}
                    components={{
                      table: ({ node: _node, ...props }) => (
                        <div className="topic-table-scroll">
                          <table {...props} />
                        </div>
                      ),
                    }}
                  >
                    {part.value}
                  </ReactMarkdown>
                ) : part.type === "resource" ? (
                  <TopicResourceItem key={part.resource.id} resource={part.resource} />
                ) : null
              // Presentation/fullscreen mode is a teacher-only preview of
              // their own note (see NoteWorkspace) -- it doesn't pass
              // linkedAssessments to splitContentByMarkers, so no
              // "assessment" part is ever actually produced here today.
              // Handled anyway (render nothing) so this stays correct if
              // that ever changes, rather than relying on a type they
              // can't happen at runtime but TypeScript can't prove.
            )}
            {isLastSlide &&
              noteLeftover.map((resource) => (
                <TopicResourceItem key={resource.id} resource={resource} />
              ))}
          </div>
        </div>
      ) : (
        <div className="topic-prose min-h-[20rem] flex-1 overflow-y-auto">
          {parts.map((part, i) =>
            part.type === "text" ? (
              <ReactMarkdown
                key={i}
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  table: ({ node: _node, ...props }) => (
                    <div className="topic-table-scroll">
                      <table {...props} />
                    </div>
                  ),
                }}
              >
                {part.value}
              </ReactMarkdown>
            ) : part.type === "resource" ? (
              <TopicResourceItem key={part.resource.id} resource={part.resource} />
            ) : null
          )}
          {isLastSlide &&
            noteLeftover.map((resource) => (
              <TopicResourceItem key={resource.id} resource={resource} />
            ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => goTo(clampedIndex - 1)}
          disabled={clampedIndex === 0}
          className="rounded-lg border border-rule px-4 py-2 text-sm text-ink hover:bg-paper disabled:opacity-40"
        >
          ← Previous
        </button>

        <div className="flex items-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`h-2 w-2 rounded-full transition-colors ${
                i === clampedIndex ? "bg-marigold" : "bg-rule hover:bg-ink-soft"
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => goTo(clampedIndex + 1)}
          disabled={clampedIndex === slides.length - 1}
          className="rounded-lg border border-rule px-4 py-2 text-sm text-ink hover:bg-paper disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
