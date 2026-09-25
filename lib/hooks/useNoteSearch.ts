import { useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";

type SearchMatch = { from: number; to: number };

/**
 * In-note find/replace -- the Ctrl/Cmd+F panel, its match-count and
 * next/prev navigation, and single/replace-all. Split out of
 * NoteEditor.tsx because, like autosave, it only needs the live `editor`
 * instance and doesn't reach into anything else (toolbar, pickers,
 * resource insertion). `searchOpen` stays here too even though a couple
 * of call sites outside this hook read/set it (the global Ctrl/Cmd+F
 * keydown handler, Escape-closes-search-in-focus-mode, and the toolbar's
 * Find button) -- it's still fundamentally "is the search UI showing",
 * the same category as everything else here, so those call sites just
 * take the returned `setSearchOpen`/`searchOpen` rather than this hook
 * needing to know about focus mode or the toolbar.
 */
export function useNoteSearch(editor: Editor | null | undefined) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Keep positions rather than decorating every result: a selection is
  // enough to show the active match, and it avoids modifying a teacher's
  // document merely to display search results.
  //
  // Memoized rather than recomputed on every render -- this walks the
  // *entire* doc with descendants(), so without memoization it reran on
  // every keystroke in the search box (searchTerm changes -> full
  // component re-render -> full doc walk). Only recompute when the doc,
  // the search term, or the case-sensitivity toggle actually change.
  const searchMatches = useMemo((): SearchMatch[] => {
    if (!editor || !searchTerm) return [];
    const needle = matchCase ? searchTerm : searchTerm.toLocaleLowerCase();
    const matches: SearchMatch[] = [];

    editor.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return true;
      const haystack = matchCase ? node.text : node.text.toLocaleLowerCase();
      let index = haystack.indexOf(needle);
      while (index !== -1) {
        matches.push({ from: pos + index, to: pos + index + searchTerm.length });
        index = haystack.indexOf(needle, index + searchTerm.length);
      }
      return true;
    });
    return matches;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, editor?.state.doc, searchTerm, matchCase]);

  function selectSearchMatch(direction: 1 | -1 = 1) {
    if (!editor || searchMatches.length === 0) return;
    const { from, to } = editor.state.selection;
    const selectedIndex = searchMatches.findIndex(
      (match) => match.from === from && match.to === to
    );
    const nextIndex =
      selectedIndex === -1
        ? direction === 1
          ? 0
          : searchMatches.length - 1
        : (selectedIndex + direction + searchMatches.length) % searchMatches.length;
    const match = searchMatches[nextIndex];
    editor.chain().focus().setTextSelection(match).scrollIntoView().run();
  }

  function replaceSearchMatch() {
    if (!editor || searchMatches.length === 0) return;
    const { from, to } = editor.state.selection;
    const match =
      searchMatches.find((candidate) => candidate.from === from && candidate.to === to) ??
      searchMatches[0];
    const chain = editor.chain().focus().setTextSelection(match);
    if (replaceTerm) chain.insertContent(replaceTerm);
    else chain.deleteSelection();
    chain.scrollIntoView().run();
  }

  function replaceAllSearchMatches() {
    if (!editor || searchMatches.length === 0) return;
    // Work backwards so each replacement leaves the positions of earlier
    // matches valid. One transaction also makes Replace all one undo step.
    let transaction = editor.state.tr;
    for (const match of [...searchMatches].reverse()) {
      transaction = transaction.insertText(replaceTerm, match.from, match.to);
    }
    editor.view.dispatch(transaction);
    editor.commands.focus();
  }

  return {
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
  };
}
