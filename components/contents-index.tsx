"use client";

import { cn } from "@/lib/utils";

export type ContentsEntry = {
  id: string;
  /** 1-based chapter-style number */
  index: number;
  title: string;
  /** Small meta on the right (e.g. §3–5, depth) */
  meta?: string;
  /** Optional jump targets */
  messageId?: string;
  findText?: string;
};

type Props = {
  entries: ContentsEntry[];
  onSelect: (entry: ContentsEntry) => void;
  emptyMessage: string;
  /** Optional heading above the list */
  heading?: string;
  className?: string;
};

/**
 * Book-style table of contents: numbered short descriptors in reading order.
 * Each row is a horizontal line — title left, locator right — click to jump.
 */
export function ContentsIndex({
  entries,
  onSelect,
  emptyMessage,
  heading = "Contents",
  className,
}: Props) {
  if (entries.length === 0) {
    return (
      <div
        className={cn(
          "flex min-h-[160px] items-center justify-center rounded-xl border border-dashed border-zinc-200 px-4 text-center text-sm text-zinc-500 dark:border-zinc-700",
          className,
        )}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <nav
      className={cn("mx-auto w-full max-w-lg px-1 pt-2", className)}
      aria-label={heading}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-zinc-200 pb-2 dark:border-zinc-800">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {heading}
        </h3>
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">
          {entries.length} {entries.length === 1 ? "item" : "items"}
        </span>
      </div>

      <ol className="space-y-0">
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => onSelect(entry)}
              className="group flex w-full items-baseline gap-2 rounded-md px-1 py-2 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-900/80"
              title={`Jump to: ${entry.title}`}
            >
              <span className="w-6 shrink-0 text-right text-xs tabular-nums text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300">
                {entry.index}
              </span>
              <span className="max-w-[min(100%,16rem)] shrink truncate text-sm font-medium leading-snug text-zinc-800 group-hover:text-zinc-950 dark:text-zinc-100 dark:group-hover:text-white sm:max-w-[20rem]">
                {entry.title}
              </span>
              <span
                aria-hidden
                className="mb-[0.25em] min-w-[1.25rem] flex-1 border-b border-dotted border-zinc-300 group-hover:border-zinc-400 dark:border-zinc-600"
              />
              <span className="shrink-0 text-[11px] tabular-nums text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300">
                {entry.meta ?? `§${entry.index}`}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-center text-[11px] text-zinc-500">
        Click a line to jump · related turns share one topic
      </p>
    </nav>
  );
}
