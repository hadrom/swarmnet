"use client";

import { useEffect, useRef } from "react";
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
};

function runCommand(command: string, value?: string) {
  document.execCommand(command, false, value);
}

export function CanvasEditor({ doc, onChange, disabled }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  /** Last HTML we pushed to React from local typing / toolbar. */
  const lastLocalHtml = useRef<string | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;

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

  return (
    <div className="flex h-full min-h-0 flex-col">
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
        className="w-full border-0 border-b border-zinc-200 bg-transparent px-0 py-2 text-lg font-semibold tracking-tight text-zinc-900 outline-none placeholder:text-zinc-400 dark:border-zinc-800 dark:text-zinc-50"
      />

      <div className="flex flex-wrap items-center gap-1 border-b border-zinc-200 py-2 dark:border-zinc-800">
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

      <div
        ref={bodyRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={emitFromEditor}
        onBlur={emitFromEditor}
        className={cn(
          "prose-canvas min-h-0 flex-1 overflow-y-auto py-3 text-sm leading-relaxed text-zinc-800 outline-none dark:text-zinc-100",
          "[&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-semibold",
          "[&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold",
          "[&_h3]:mb-1.5 [&_h3]:text-base [&_h3]:font-semibold",
          "[&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5",
        )}
        data-placeholder="Write here, or ask in chat to draft and edit…"
      />
    </div>
  );
}
