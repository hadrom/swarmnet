"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

export type DescribedPhrase = {
  phrase: string;
  noteId: string;
};

type Props = {
  /** Plain text answer (consult). Prefer `children` for rich content. */
  text?: string;
  children?: ReactNode;
  disabled?: boolean;
  className?: string;
  onAsk: (question: string) => void;
  /** Phrases already answered under Grounding NOTES — underlined + clickable. */
  described?: DescribedPhrase[];
  /** Open Grounding and jump to this note id. */
  onOpenNote?: (noteId: string) => void;
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

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type MarkHit = { start: number; end: number; noteId: string };

function findMarkHits(text: string, described: DescribedPhrase[]): MarkHit[] {
  if (!text || described.length === 0) return [];
  const ranked = [...described]
    .filter((d) => d.phrase.trim().length >= 2)
    .sort((a, b) => b.phrase.length - a.phrase.length);
  const hits: MarkHit[] = [];
  const taken: Array<[number, number]> = [];

  for (const d of ranked) {
    const phrase = d.phrase.trim();
    const re = new RegExp(
      `(?:^|[^\\p{L}\\p{N}_'])(${escapeRegExp(phrase)})(?=$|[^\\p{L}\\p{N}_'])`,
      "giu",
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const full = m[0];
      const captured = m[1] ?? full;
      const start = m.index + full.indexOf(captured);
      const end = start + captured.length;
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      taken.push([start, end]);
      hits.push({ start, end, noteId: d.noteId });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

const MARK_CLASS =
  "cursor-pointer bg-transparent p-0 font-inherit text-inherit underline decoration-sky-600 decoration-2 underline-offset-[3px] hover:decoration-sky-800 dark:decoration-sky-400 dark:hover:decoration-sky-200";

function renderMarkedText(
  text: string,
  described: DescribedPhrase[],
  onOpenNote?: (noteId: string) => void,
) {
  const hits = findMarkHits(text, described);
  if (hits.length === 0) return text;

  const parts: ReactNode[] = [];
  let cursor = 0;
  hits.forEach((hit, i) => {
    if (hit.start > cursor) parts.push(text.slice(cursor, hit.start));
    parts.push(
      <button
        key={`${hit.noteId}-${hit.start}-${i}`}
        type="button"
        data-ask-described=""
        data-note-id={hit.noteId}
        title="Open description in Grounding NOTES"
        className={MARK_CLASS}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenNote?.(hit.noteId);
        }}
      >
        {text.slice(hit.start, hit.end)}
      </button>,
    );
    cursor = hit.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

function unwrapDescribedMarks(root: HTMLElement) {
  root.querySelectorAll("span[data-ask-described]").forEach((span) => {
    const parent = span.parentNode;
    if (!parent) return;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
  });
}

function wrapDescribedInDom(root: HTMLElement, described: DescribedPhrase[]) {
  unwrapDescribedMarks(root);
  if (described.length === 0) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest("[data-ask-chip],[data-ask-described]")) {
        return NodeFilter.FILTER_REJECT;
      }
      if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  for (const textNode of nodes) {
    const value = textNode.textContent ?? "";
    const hits = findMarkHits(value, described);
    if (hits.length === 0) continue;

    const frag = document.createDocumentFragment();
    let cursor = 0;
    for (const hit of hits) {
      if (hit.start > cursor) {
        frag.appendChild(
          document.createTextNode(value.slice(cursor, hit.start)),
        );
      }
      const mark = document.createElement("span");
      mark.dataset.askDescribed = "true";
      mark.dataset.noteId = hit.noteId;
      mark.title = "Open description in Grounding NOTES";
      mark.className =
        "cursor-pointer underline decoration-sky-600 decoration-2 underline-offset-[3px] hover:decoration-sky-800 dark:decoration-sky-400 dark:hover:decoration-sky-200";
      mark.textContent = value.slice(hit.start, hit.end);
      frag.appendChild(mark);
      cursor = hit.end;
    }
    if (cursor < value.length) {
      frag.appendChild(document.createTextNode(value.slice(cursor)));
    }
    textNode.parentNode?.replaceChild(frag, textNode);
  }
}

export function PointableAnswer({
  text,
  children,
  disabled,
  className,
  onAsk,
  described = [],
  onOpenNote,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pointerDown = useRef<{ x: number; y: number } | null>(null);
  const [chip, setChip] = useState<AskChip | null>(null);

  const clearChip = useCallback(() => setChip(null), []);

  const describedKey = useMemo(
    () => described.map((d) => `${d.noteId}:${d.phrase}`).join("|"),
    [described],
  );

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

  // Rich children (Depth markdown): decorate matching phrases after render.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || text != null) return;
    wrapDescribedInDom(root, described);
    return () => {
      if (rootRef.current) unwrapDescribedMarks(rootRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [describedKey, children, text]);

  function onMouseDown(e: React.MouseEvent) {
    if (disabled) return;
    const el = e.target as HTMLElement;
    if (el.closest("[data-ask-chip]")) return;
    if (el.closest("[data-ask-described]")) return;
    pointerDown.current = { x: e.clientX, y: e.clientY };
  }

  function onMouseUp(e: React.MouseEvent) {
    if (disabled) return;
    const root = rootRef.current;
    if (!root) return;

    const el = e.target as HTMLElement;
    const describedEl = el.closest("[data-ask-described]") as HTMLElement | null;
    if (describedEl) {
      clearChip();
      const noteId = describedEl.getAttribute("data-note-id");
      if (noteId) onOpenNote?.(noteId);
      return;
    }

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
  }

  return (
    <div
      ref={rootRef}
      className={cn("relative cursor-text", className)}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
    >
      {children ?? (
        <p className="whitespace-pre-wrap">
          {renderMarkedText(text ?? "", described, onOpenNote)}
        </p>
      )}

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
