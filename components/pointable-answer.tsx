"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnswerHotspot } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  text: string;
  hotspots?: AnswerHotspot[];
  disabled?: boolean;
  className?: string;
  onAsk: (question: string) => void;
};

type Segment =
  | { kind: "text"; value: string }
  | { kind: "hot"; value: string; ask: string; id: string };

type AskChip = {
  question: string;
  top: number;
  left: number;
};

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSegments(text: string, hotspots: AnswerHotspot[]): Segment[] {
  const usable = hotspots
    .map((h, i) => ({
      id: h.id || `hot-${i}`,
      text: h.text.trim(),
      ask: h.ask.trim(),
    }))
    .filter((h) => h.text.length >= 2 && h.ask.length > 0)
    .sort((a, b) => b.text.length - a.text.length)
    .slice(0, 4);

  if (usable.length === 0) return [{ kind: "text", value: text }];

  // Find non-overlapping matches (first occurrence of each, prefer longer phrases).
  type Hit = { start: number; end: number; id: string; ask: string; value: string };
  const hits: Hit[] = [];
  const taken: Array<[number, number]> = [];

  for (const h of usable) {
    const re = new RegExp(escapeRegExp(h.text), "i");
    const m = re.exec(text);
    if (!m || m.index == null) continue;
    const start = m.index;
    const end = start + m[0].length;
    if (taken.some(([a, b]) => start < b && end > a)) continue;
    taken.push([start, end]);
    hits.push({ start, end, id: h.id, ask: h.ask, value: m[0] });
  }

  hits.sort((a, b) => a.start - b.start);
  if (hits.length === 0) return [{ kind: "text", value: text }];

  const parts: Segment[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start > cursor) {
      parts.push({ kind: "text", value: text.slice(cursor, hit.start) });
    }
    parts.push({
      kind: "hot",
      value: hit.value,
      ask: hit.ask,
      id: hit.id,
    });
    cursor = hit.end;
  }
  if (cursor < text.length) {
    parts.push({ kind: "text", value: text.slice(cursor) });
  }
  return parts;
}

function questionFromSelection(raw: string): string | null {
  const phrase = raw.replace(/\s+/g, " ").trim();
  if (phrase.length < 2 || phrase.length > 120) return null;
  // Avoid submitting whole paragraphs as a "point".
  if (phrase.split(/\s+/).length > 12) return null;
  return `About “${phrase}”: what's the next move?`;
}

export function PointableAnswer({
  text,
  hotspots = [],
  disabled,
  className,
  onAsk,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [chip, setChip] = useState<AskChip | null>(null);

  const segments = useMemo(
    () => buildSegments(text, hotspots),
    [text, hotspots],
  );

  const clearChip = useCallback(() => setChip(null), []);

  const handleAsk = useCallback(
    (question: string) => {
      if (disabled || !question.trim()) return;
      clearChip();
      window.getSelection()?.removeAllRanges();
      onAsk(question.trim());
    },
    [clearChip, disabled, onAsk],
  );

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current) return;
      if (e.target instanceof Node && rootRef.current.contains(e.target)) {
        // Allow interaction inside the answer; chip clears on ask or outside.
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

  function onMouseUp() {
    if (disabled) return;
    const root = rootRef.current;
    const sel = window.getSelection();
    if (!root || !sel || sel.isCollapsed || sel.rangeCount === 0) {
      return;
    }
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) {
      clearChip();
      return;
    }
    // Ignore pure clicks on hotspot buttons (zero-width / tiny selections).
    const selected = sel.toString();
    const question = questionFromSelection(selected);
    if (!question) {
      clearChip();
      return;
    }
    const rect = range.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    setChip({
      question,
      top: rect.bottom - rootRect.top + 6,
      left: Math.min(
        Math.max(rect.left - rootRect.left + rect.width / 2, 56),
        Math.max(rootRect.width - 56, 56),
      ),
    });
  }

  return (
    <div ref={rootRef} className={cn("relative", className)} onMouseUp={onMouseUp}>
      <p className="whitespace-pre-wrap">
        {segments.map((seg, i) =>
          seg.kind === "text" ? (
            <span key={`t-${i}`}>{seg.value}</span>
          ) : (
            <button
              key={`h-${seg.id}-${i}`}
              type="button"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                handleAsk(seg.ask);
              }}
              className={cn(
                "rounded-[3px] bg-amber-100/90 px-0.5 font-medium text-amber-950 underline decoration-amber-400/80 decoration-from-font underline-offset-2 transition",
                "hover:bg-amber-200/90 dark:bg-amber-950/50 dark:text-amber-100 dark:decoration-amber-600",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
              title={`Ask: ${seg.ask}`}
            >
              {seg.value}
            </button>
          ),
        )}
      </p>

      {chip ? (
        <button
          type="button"
          data-ask-chip
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleAsk(chip.question)}
          className={cn(
            "absolute z-20 -translate-x-1/2 whitespace-nowrap rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-950 shadow-sm",
            "hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-50",
            "disabled:opacity-50",
          )}
          style={{ top: chip.top, left: chip.left }}
        >
          Ask about this
        </button>
      ) : null}
    </div>
  );
}
