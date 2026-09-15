"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Underline,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CanvasDoc } from "@/lib/types";
import { stripHtml } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  doc: CanvasDoc;
  onChange: (doc: CanvasDoc) => void;
  disabled?: boolean;
  /** Ask about a selection in the journal body (not NOTES). Writes into NOTES. */
  onAsk?: (question: string) => void;
};

type AskChip = {
  phrase: string;
  question: string;
  top: number;
  left: number;
};

function runCommand(command: string, value?: string) {
  document.execCommand(command, false, value);
}

function questionForPhrase(raw: string): string | null {
  const phrase = raw.replace(/\s+/g, " ").trim();
  if (phrase.length < 2 || phrase.length > 120) return null;
  if (phrase.split(/\s+/).length > 12) return null;
  const cleaned = phrase.replace(/^[“"'(]+|[”"'.,:;!?)]+$/g, "").trim();
  if (cleaned.length < 2) return null;
  return `What is “${cleaned}”?`;
}

function isWordChar(ch: string) {
  return /[\p{L}\p{N}_'-]/u.test(ch);
}

function caretRangeFromPoint(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => {
      offsetNode: Node;
      offset: number;
    } | null;
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

function expandWordRange(node: Text, offset: number): Range | null {
  const text = node.textContent || "";
  if (!text) return null;
  let i = Math.min(Math.max(offset, 0), text.length);
  if (i > 0 && i === text.length) i -= 1;
  if (!isWordChar(text[i] ?? "")) {
    if (i > 0 && isWordChar(text[i - 1] ?? "")) i -= 1;
    else return null;
  }
  let start = i;
  let end = i;
  while (start > 0 && isWordChar(text[start - 1]!)) start -= 1;
  while (end < text.length - 1 && isWordChar(text[end + 1]!)) end += 1;
  if (!isWordChar(text[end] ?? "")) return null;
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end + 1);
  return range;
}

/** True if the caret/selection sits inside the NOTES block (heading + items). */
function isInsideNotes(root: HTMLElement, range: Range): boolean {
  const headings = Array.from(root.querySelectorAll("h1,h2,h3")).filter((h) =>
    /^NOTES$/i.test((h.textContent || "").trim()),
  );
  if (headings.length === 0) {
    // Still block asks that originate on an ask-note paragraph.
    const startEl =
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? (range.startContainer as HTMLElement)
        : range.startContainer.parentElement;
    return Boolean(startEl?.closest("[data-ask-phrase],[id^='ask-note-']"));
  }

  const notesEl = headings[0]!;
  const startNode = range.startContainer;
  if (notesEl === startNode || notesEl.contains(startNode)) return true;

  try {
    const probe = document.createRange();
    probe.selectNodeContents(root);
    probe.setStartBefore(notesEl);
    return probe.isPointInRange(range.startContainer, range.startOffset);
  } catch {
    const cmp = notesEl.compareDocumentPosition(startNode);
    return Boolean(cmp & Node.DOCUMENT_POSITION_FOLLOWING);
  }
}

function chipPosition(range: Range, root: HTMLElement) {
  const rect = range.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  return {
    top: Math.max(4, rect.top - rootRect.top - 34),
    left: Math.min(
      Math.max(24, rect.left + rect.width / 2 - rootRect.left),
      rootRect.width - 24,
    ),
  };
}

export function CanvasEditor({ doc, onChange, disabled, onAsk }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  /** Last HTML we pushed to React from local typing / toolbar. */
  const lastLocalHtml = useRef<string | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;
  const pointerDown = useRef<{ x: number; y: number } | null>(null);
  const [chip, setChip] = useState<AskChip | null>(null);

  const clearChip = useCallback(() => setChip(null), []);

  // Apply external doc updates (agentic edits) into the contenteditable.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    // Skip if this bodyHtml is what we just emitted locally.
    if (lastLocalHtml.current !== null && doc.bodyHtml === lastLocalHtml.current) {
      lastLocalHtml.current = null;
      return;
    }
    if (el.innerHTML !== doc.bodyHtml) {
      el.innerHTML = doc.bodyHtml || "<p></p>";
    }
    lastLocalHtml.current = null;
  }, [doc.bodyHtml, doc.updatedAt]);

  useEffect(() => {
    if (!onAsk) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (e.target instanceof Node && wrapRef.current.contains(e.target)) {
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
  }, [clearChip, onAsk]);

  function emitFromEditor() {
    if (disabled) return;
    const el = bodyRef.current;
    if (!el) return;
    const bodyHtml = el.innerHTML;
    lastLocalHtml.current = bodyHtml;
    const current = docRef.current;
    onChange({
      ...current,
      bodyHtml,
      bodyText: stripHtml(bodyHtml),
      updatedAt: Date.now(),
    });
  }

  function toolbar(cmd: string, value?: string) {
    return () => {
      if (disabled) return;
      bodyRef.current?.focus();
      runCommand(cmd, value);
      emitFromEditor();
    };
  }

  const showChipForRange = (range: Range, phrase: string) => {
    const root = bodyRef.current;
    const question = questionForPhrase(phrase);
    if (!root || !question || !onAsk || disabled) {
      clearChip();
      return;
    }
    if (isInsideNotes(root, range)) {
      clearChip();
      return;
    }
    const pos = chipPosition(range, root);
    setChip({ phrase, question, ...pos });
  };

  const handleAsk = () => {
    if (disabled || !chip || !onAsk) return;
    const question = chip.question;
    clearChip();
    window.getSelection()?.removeAllRanges();
    onAsk(question);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (!onAsk || disabled) return;
    pointerDown.current = { x: e.clientX, y: e.clientY };
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (!onAsk || disabled || !bodyRef.current) return;
    const root = bodyRef.current;
    const sel = window.getSelection();
    const down = pointerDown.current;
    pointerDown.current = null;

    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) {
        clearChip();
        return;
      }
      showChipForRange(range, sel.toString());
      return;
    }

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
    sel?.removeAllRanges();
    sel?.addRange(wordRange);
    showChipForRange(wordRange, wordRange.toString());
  };

  return (
    <div ref={wrapRef} className="relative flex min-h-full flex-col pb-16">
      <input
        value={doc.title}
        disabled={disabled}
        onChange={(e) =>
          onChange({
            ...docRef.current,
            title: e.target.value,
            updatedAt: Date.now(),
          })
        }
        placeholder="Grounding title"
        className="w-full shrink-0 border-0 border-b border-zinc-200 bg-transparent px-0 py-2 text-lg font-semibold tracking-tight text-zinc-900 outline-none placeholder:text-zinc-400 dark:border-zinc-800 dark:text-zinc-50"
      />

      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-zinc-200 py-2 dark:border-zinc-800">
        {(
          [
            { label: "Bold", icon: Bold, run: toolbar("bold") },
            { label: "Italic", icon: Italic, run: toolbar("italic") },
            { label: "Underline", icon: Underline, run: toolbar("underline") },
            {
              label: "Heading 1",
              icon: Heading1,
              run: toolbar("formatBlock", "h1"),
            },
            {
              label: "Heading 2",
              icon: Heading2,
              run: toolbar("formatBlock", "h2"),
            },
            {
              label: "Heading 3",
              icon: Heading3,
              run: toolbar("formatBlock", "h3"),
            },
          ] as const
        ).map((item) => (
          <Button
            key={item.label}
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            title={item.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={item.run}
            className="h-8 w-8 px-0"
          >
            <item.icon className="h-3.5 w-3.5" />
          </Button>
        ))}
        <span className="mx-1 h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
        {[
          { label: "S", size: "2" },
          { label: "M", size: "3" },
          { label: "L", size: "5" },
        ].map((s) => (
          <Button
            key={s.label}
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            title={`Font size ${s.label}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={toolbar("fontSize", s.size)}
            className="h-8 min-w-8 px-2 text-[11px] font-semibold"
          >
            {s.label}
          </Button>
        ))}
      </div>

      <div className="relative min-h-0 grow">
        <div
          ref={bodyRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={() => {
            clearChip();
            emitFromEditor();
          }}
          onBlur={emitFromEditor}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onKeyDown={() => clearChip()}
          className={cn(
            // Grow with content like a long notepad; the side pane ScrollArea scrolls.
            "prose-canvas min-h-[70vh] grow py-3 text-sm leading-relaxed text-zinc-800 outline-none dark:text-zinc-100",
            "[&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-semibold",
            "[&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold",
            "[&_h3]:mb-1.5 [&_h3]:text-base [&_h3]:font-semibold",
            "[&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5",
            "[&_hr]:my-4 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-zinc-200 dark:[&_hr]:border-zinc-700",
          )}
          data-placeholder="Write the trail here, or ask in chat to extend it…"
        />

        {chip && onAsk ? (
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
    </div>
  );
}
