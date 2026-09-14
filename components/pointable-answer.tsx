"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  text: string;
  disabled?: boolean;
  className?: string;
  onAsk: (question: string) => void;
};

type AskChip = {
  phrase: string;
  question: string;
  top: number;
  left: number;
};

function isWordChar(ch: string) {
  return /[\p{L}\p{N}_'-]/u.test(ch);
}

function questionForPhrase(raw: string): string | null {
  const phrase = raw.replace(/\s+/g, " ").trim();
  if (phrase.length < 2 || phrase.length > 120) return null;
  if (phrase.split(/\s+/).length > 12) return null;
  // Strip trailing punctuation from selection edges for a cleaner ask.
  const cleaned = phrase.replace(/^[“"'(]+|[”"'.,:;!?)]+$/g, "").trim();
  if (cleaned.length < 2) return null;
  return `What is “${cleaned}”?`;
}

function chipPosition(range: Range, root: HTMLElement) {
  const rect = range.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  return {
    top: rect.bottom - rootRect.top + 6,
    left: Math.min(
      Math.max(rect.left - rootRect.left + rect.width / 2, 56),
      Math.max(rootRect.width - 56, 56),
    ),
  };
}

function expandWordRange(textNode: Text, offset: number): Range | null {
  const text = textNode.textContent ?? "";
  if (!text) return null;
  let start = Math.min(Math.max(offset, 0), text.length);
  let end = start;

  // If caret landed on punctuation/space, nudge onto a nearby word.
  if (start < text.length && !isWordChar(text[start]!)) {
    if (start > 0 && isWordChar(text[start - 1]!)) start -= 1;
    else {
      while (start < text.length && !isWordChar(text[start]!)) start += 1;
      end = start;
    }
  }

  if (start >= text.length || !isWordChar(text[start]!)) return null;

  while (start > 0 && isWordChar(text[start - 1]!)) start -= 1;
  while (end < text.length && isWordChar(text[end]!)) end += 1;
  if (end <= start) return null;

  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);
  return range;
}

function caretRangeFromPoint(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
  };
  if (typeof doc.caretRangeFromPoint === "function") {
    return doc.caretRangeFromPoint(x, y);
  }
  if (typeof doc.caretPositionFromPoint === "function") {
    const pos = doc.caretPositionFromPoint(x, y);
    if (!pos) return null;
    const range = document.createRange();
    range.setStart(pos.offsetNode, pos.offset);
    range.collapse(true);
    return range;
  }
  return null;
}

export function PointableAnswer({ text, disabled, className, onAsk }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pointerDown = useRef<{ x: number; y: number } | null>(null);
  const [chip, setChip] = useState<AskChip | null>(null);

  const clearChip = useCallback(() => setChip(null), []);

  const showChipForRange = useCallback(
    (range: Range, phrase: string) => {
      const root = rootRef.current;
      const question = questionForPhrase(phrase);
      if (!root || !question) {
        clearChip();
        return;
      }
      const pos = chipPosition(range, root);
      setChip({ phrase, question, ...pos });
    },
    [clearChip],
  );

  const handleAsk = useCallback(() => {
    if (disabled || !chip) return;
    const question = chip.question;
    clearChip();
    window.getSelection()?.removeAllRanges();
    onAsk(question);
  }, [chip, clearChip, disabled, onAsk]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current) return;
      if (e.target instanceof Node && rootRef.current.contains(e.target)) {
        const el = e.target as HTMLElement;
        if (el.closest("[data-ask-chip]")) return;
        return;
      }
      clearChip();
    }
    function onScroll() {
      clearChip();
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [clearChip]);

  function onMouseDown(e: React.MouseEvent) {
    if (disabled) return;
    if ((e.target as HTMLElement).closest("[data-ask-chip]")) return;
    pointerDown.current = { x: e.clientX, y: e.clientY };
  }

  function onMouseUp(e: React.MouseEvent) {
    if (disabled) return;
    const root = rootRef.current;
    if (!root) return;

    const sel = window.getSelection();
    const down = pointerDown.current;
    pointerDown.current = null;

    // Drag-select: use the selected span.
    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) {
        clearChip();
        return;
      }
      showChipForRange(range, sel.toString());
      return;
    }

    // Click: expand the word under the cursor, then confirm.
    if (!down) return;
    const moved =
      Math.abs(e.clientX - down.x) > 4 || Math.abs(e.clientY - down.y) > 4;
    if (moved) {
      clearChip();
      return;
    }

    const caret = caretRangeFromPoint(e.clientX, e.clientY);
    if (!caret || !root.contains(caret.startContainer)) {
      clearChip();
      return;
    }
    if (caret.startContainer.nodeType !== Node.TEXT_NODE) {
      clearChip();
      return;
    }
    const wordRange = expandWordRange(
      caret.startContainer as Text,
      caret.startOffset,
    );
    if (!wordRange) {
      clearChip();
      return;
    }
    // Visually mark the word so confirm feels intentional.
    sel?.removeAllRanges();
    sel?.addRange(wordRange);
    showChipForRange(wordRange, wordRange.toString());
  }

  return (
    <div
      ref={rootRef}
      className={cn("relative", className)}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
    >
      <p className="cursor-text whitespace-pre-wrap">{text}</p>

      {chip ? (
        <button
          type="button"
          data-ask-chip
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleAsk}
          className={cn(
            "absolute z-20 -translate-x-1/2 whitespace-nowrap rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-950 shadow-sm",
            "hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-50",
            "disabled:opacity-50",
          )}
          style={{ top: chip.top, left: chip.left }}
          title={chip.question}
        >
          Ask about this
        </button>
      ) : null}
    </div>
  );
}
