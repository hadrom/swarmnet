"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  ChevronRight,
  FileText,
  Loader2,
  Maximize2,
  NotebookPen,
  Sparkles,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CONSULT_STARTERS } from "@/lib/prompts";
import type {
  Hook,
  SavedBrief,
  ThreadMessage,
  WorkingNotes,
} from "@/lib/types";
import {
  DISCUSS_CHIPS,
  FULL_BRIEF_KEY,
  emptyNotes,
  seedNotesFromAnswer,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "two-lane-notepad-v2";

type Persisted = {
  notes: WorkingNotes;
  chips: Hook[];
  rootedFromId: string | null;
  jotting: boolean;
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function briefKeyFor(hook?: Hook) {
  return hook?.id ?? FULL_BRIEF_KEY;
}

function notesAreEmpty(notes: WorkingNotes) {
  return (
    !notes.topic &&
    !notes.whereWeAre &&
    notes.agreed.length === 0 &&
    notes.stillOpen.length === 0 &&
    notes.trail.length === 0
  );
}

function loadPersisted(): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Persisted;
  } catch {
    return null;
  }
}

function savePersisted(payload: Persisted) {
  if (typeof window === "undefined") return;
  try {
    if (notesAreEmpty(payload.notes)) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function SimpleMarkdown({ text }: { text: string }) {
  const blocks = text.split(/\n\n+/);
  return (
    <div className="space-y-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines[0]?.startsWith("## ")) {
          return (
            <div key={i} className="space-y-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {lines[0].replace(/^##\s+/, "")}
              </h3>
              <div className="space-y-1">
                {lines.slice(1).map((line, j) => (
                  <p key={j} className="whitespace-pre-wrap">
                    {line.replace(/^[-*]\s+/, "• ")}
                  </p>
                ))}
              </div>
            </div>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {block}
          </p>
        );
      })}
    </div>
  );
}

function NotepadView({
  notes,
  tip,
}: {
  notes: WorkingNotes;
  tip?: string | null;
}) {
  if (notesAreEmpty(notes)) {
    return (
      <div className="flex h-full flex-col justify-center gap-2 text-sm text-zinc-500">
        <p className="font-medium text-zinc-700 dark:text-zinc-200">
          Empty notepad
        </p>
        <p>
          Click Take notes on an answer. Keep chatting — we jot what you settle
          so both of you can follow along.
        </p>
      </div>
    );
  }

  const Section = ({
    title,
    hint,
    items,
  }: {
    title: string;
    hint: string;
    items: string[];
  }) =>
    items.length === 0 ? null : (
      <div className="space-y-1.5">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {title}
          </h3>
          <p className="text-[11px] text-zinc-400">{hint}</p>
        </div>
        <ul className="space-y-1 text-sm text-zinc-700 dark:text-zinc-200">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-zinc-400">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <div className="space-y-5">
      {notes.topic ? (
        <div className="space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Talking about
          </h3>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            {notes.topic}
          </p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            So far
          </h3>
          <p className="text-[11px] text-zinc-400">
            The shared picture right now
          </p>
        </div>
        <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-100">
          {notes.whereWeAre || "—"}
        </p>
      </div>

      <Section
        title="We've settled"
        hint="Things you both lined up on"
        items={notes.agreed}
      />
      <Section
        title="Still wondering"
        hint="Not decided yet — keep chewing on these"
        items={notes.stillOpen}
      />

      {notes.trail.length > 0 ? (
        <div className="space-y-1.5">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              How we got here
            </h3>
            <p className="text-[11px] text-zinc-400">
              Short breadcrumbs as you talked
            </p>
          </div>
          <ol className="space-y-2 text-sm text-zinc-700 dark:text-zinc-200">
            {notes.trail.map((entry, i) => (
              <li
                key={`${i}-${entry.slice(0, 24)}`}
                className={cn(
                  "flex gap-2 rounded-lg px-2 py-1.5",
                  i === notes.trail.length - 1 &&
                    "bg-amber-50/80 dark:bg-amber-950/30",
                )}
              >
                <span className="shrink-0 text-xs text-zinc-400">{i + 1}.</span>
                <span>{entry}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {tip ? <p className="text-xs italic text-zinc-500">{tip}</p> : null}
    </div>
  );
}

type OpenBriefRef = { messageId: string; key: string };
type SideKind = "brief" | "notes";

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelHint, setModelHint] = useState<string | null>(null);

  const [openBrief, setOpenBrief] = useState<OpenBriefRef | null>(null);
  const [sideKind, setSideKind] = useState<SideKind | null>(null);
  const [rootedFromId, setRootedFromId] = useState<string | null>(null);
  const [chips, setChips] = useState<Hook[]>(DISCUSS_CHIPS);
  const [notes, setNotes] = useState<WorkingNotes>(() => emptyNotes());
  const [tightenTip, setTightenTip] = useState<string | null>(null);
  /** Actively jotting while chatting (friends writing as they talk). */
  const [jotting, setJotting] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = loadPersisted();
    if (saved && !notesAreEmpty(saved.notes)) {
      setNotes(saved.notes);
      setChips(saved.chips?.length ? saved.chips : DISCUSS_CHIPS);
      setRootedFromId(saved.rootedFromId);
      setJotting(Boolean(saved.jotting));
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    savePersisted({ notes, chips, rootedFromId, jotting });
  }, [notes, chips, rootedFromId, jotting, hydrated]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const hasNotes = !notesAreEmpty(notes);
  const notepadVisible = sideKind === "notes" && hasNotes;
  const showNotepadDock = hasNotes && sideKind !== "notes";

  const activeBrief = useMemo(() => {
    if (!openBrief) return null;
    const msg = messages.find((m) => m.id === openBrief.messageId);
    const brief = msg?.briefs?.[openBrief.key];
    if (!msg || !brief) return null;
    return { message: msg, brief, key: openBrief.key };
  }, [openBrief, messages]);

  const showSidePane =
    (sideKind === "brief" && activeBrief !== null) || notepadVisible;

  const chatMaxWidth = showSidePane ? "max-w-lg" : "max-w-2xl";

  function hidePane() {
    setOpenBrief(null);
    setSideKind(null);
  }

  function showNotepad() {
    setOpenBrief(null);
    setSideKind("notes");
  }

  function doneJotting() {
    setJotting(false);
    setSideKind(null);
    setOpenBrief(null);
    setModelHint(null);
  }

  function openSavedBrief(messageId: string, key: string) {
    setOpenBrief({ messageId, key });
    setSideKind("brief");
  }

  function saveBriefOnMessage(
    messageId: string,
    key: string,
    brief: SavedBrief,
  ) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, briefs: { ...(m.briefs ?? {}), [key]: brief } }
          : m,
      ),
    );
    setOpenBrief({ messageId, key });
    setSideKind("brief");
  }

  /** Start or reopen the shared notepad. Never wipes unless restart. */
  function takeNotes(msg: ThreadMessage, opts?: { restart?: boolean }) {
    const preferredKey =
      (openBrief?.messageId === msg.id ? openBrief.key : null) ??
      (msg.briefs?.[FULL_BRIEF_KEY] ? FULL_BRIEF_KEY : null) ??
      Object.keys(msg.briefs ?? {})[0] ??
      null;
    const brief = preferredKey ? msg.briefs?.[preferredKey] : null;

    if (opts?.restart || notesAreEmpty(notes)) {
      setNotes(seedNotesFromAnswer(msg.content, brief ?? null));
      setTightenTip(null);
      setChips(DISCUSS_CHIPS);
      setRootedFromId(msg.id);
    }

    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, promoted: true } : m)),
    );
    setJotting(true);
    setOpenBrief(null);
    setSideKind("notes");
    setModelHint(null);
  }

  async function sendConsult(question: string, prior: ThreadMessage[]) {
    const history = prior.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const res = await fetch("/api/lite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Lite request failed");
    setModelHint(
      data.mocked ? `mock · fallback` : data.modelUsed || "gemini-3.5-flash-lite",
    );
    return data as {
      answer: string;
      confidence: ThreadMessage["confidence"];
      hooks: Hook[];
    };
  }

  async function sendWithNotes(
    message: string,
    prior: ThreadMessage[],
    current: WorkingNotes,
  ) {
    const history = prior.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const res = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, notes: current, history }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    setModelHint(
      data.mocked ? `mock · fallback` : data.modelUsed || "gemini-3.5-flash-lite",
    );
    return data as {
      reply: string;
      notes: WorkingNotes;
      hooks: Hook[];
    };
  }

  async function onSubmit(text?: string) {
    const question = (text ?? input).trim();
    if (!question || busy) return;
    setError(null);
    setInput("");
    const userMsg: ThreadMessage = {
      id: uid(),
      role: "user",
      content: question,
    };
    const nextThread = [...messages, userMsg];
    setMessages(nextThread);
    setBusy(true);
    try {
      if (jotting && hasNotes) {
        // Keep notepad visible if a brief was covering it; otherwise leave dock alone.
        if (sideKind === "brief") {
          setOpenBrief(null);
          setSideKind("notes");
        }
        const data = await sendWithNotes(question, messages, notes);
        setNotes(data.notes);
        setTightenTip(null);
        if (data.hooks?.length) setChips(data.hooks);
        setMessages([
          ...nextThread,
          {
            id: uid(),
            role: "assistant",
            content: data.reply,
            hooks: data.hooks,
          },
        ]);
      } else {
        const data = await sendConsult(question, messages);
        setMessages([
          ...nextThread,
          {
            id: uid(),
            role: "assistant",
            content: data.answer,
            confidence: data.confidence,
            hooks: data.hooks,
            briefs: {},
          },
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function onElaborate(msg: ThreadMessage, hook?: Hook) {
    if (busy) return;
    const key = briefKeyFor(hook);
    const existing = msg.briefs?.[key];
    if (existing) {
      openSavedBrief(msg.id, key);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const idx = messages.findIndex((m) => m.id === msg.id);
      const prior = messages.slice(0, idx + 1);
      const priorUser = [...prior].reverse().find((m) => m.role === "user");
      const question = priorUser?.content ?? msg.content;
      const history = prior.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          liteAnswer: msg.content,
          hookLabel: hook?.label,
          history,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Brief failed");
      saveBriefOnMessage(msg.id, key, {
        title: hook?.label ?? "Elaborate",
        markdown: data.markdown,
        hookId: hook?.id,
      });
      setModelHint(
        data.mocked ? `mock · fallback` : data.modelUsed || "gemini-3.8-flash",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Brief failed");
    } finally {
      setBusy(false);
    }
  }

  async function onCleanUp() {
    if (busy || (!notes.whereWeAre && !notes.topic)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/compact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Clean up failed");
      setNotes(data.notes);
      setTightenTip(data.note);
      setSideKind("notes");
      setModelHint(
        data.mocked ? `mock · fallback` : data.modelUsed || "gemini-3.8-flash",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clean up failed");
    } finally {
      setBusy(false);
    }
  }

  function onHookClick(msg: ThreadMessage, hook: Hook) {
    if (jotting && msg.confidence == null) {
      void onSubmit(hook.label);
      return;
    }
    void onElaborate(msg, hook);
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="shrink-0 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-zinc-500" />
              <h1 className="truncate text-sm font-semibold tracking-tight">
                Two-lane LLM demo
              </h1>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              Chat as usual. Take notes when you want a shared scratchpad — like
              two friends jotting progress so you both stay aligned.
            </p>
          </div>
          {modelHint ? (
            <Badge className="hidden shrink-0 sm:inline-flex">{modelHint}</Badge>
          ) : null}
        </div>
      </header>

      <main
        className={cn(
          "mx-auto grid w-full max-w-7xl min-h-0 flex-1 gap-0 overflow-hidden",
          showSidePane
            ? "grid-rows-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-1 lg:grid-cols-2"
            : "grid-cols-1",
        )}
      >
        <section
          className={cn(
            "flex min-h-0 flex-col overflow-hidden",
            showSidePane &&
              "border-b border-zinc-200 lg:border-b-0 lg:border-r dark:border-zinc-800",
          )}
        >
          <ScrollArea className="min-h-0 flex-1 px-4 py-4">
            {messages.length === 0 ? (
              <div
                className={cn("mx-auto flex flex-col gap-4 pt-10", chatMaxWidth)}
              >
                <div>
                  <h2 className="text-base font-semibold">
                    Ask something operational
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Short answers first. Elaborate for a brief. Take notes when
                    you want to write down what you&apos;re converging on.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  {CONSULT_STARTERS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void onSubmit(s)}
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-left text-sm text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-700"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className={cn("mx-auto flex flex-col gap-4", chatMaxWidth)}>
                {messages.map((msg) => {
                  const savedEntries = Object.entries(msg.briefs ?? {});
                  const isBriefSource =
                    sideKind === "brief" && openBrief?.messageId === msg.id;
                  const isRootSource = rootedFromId === msg.id;
                  const isConsultAnswer =
                    msg.role === "assistant" && msg.confidence != null;

                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex flex-col gap-2",
                        msg.role === "user" ? "items-end" : "items-start",
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[95%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                          msg.role === "user"
                            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                            : "bg-white text-zinc-800 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-800",
                          isBriefSource &&
                            "ring-2 ring-zinc-900 dark:ring-zinc-100",
                          isRootSource &&
                            hasNotes &&
                            "ring-2 ring-amber-500/60",
                        )}
                      >
                        {msg.content}
                      </div>

                      {msg.role === "assistant" ? (
                        <div className="flex max-w-[95%] flex-col gap-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {msg.confidence ? (
                              <Badge>confidence · {msg.confidence}</Badge>
                            ) : null}

                            {(isConsultAnswer
                              ? msg.hooks
                              : jotting
                                ? msg.hooks?.length
                                  ? msg.hooks
                                  : chips
                                : msg.hooks
                            )?.map((hook) => {
                              const saved = msg.briefs?.[hook.id];
                              const isOpen =
                                openBrief?.messageId === msg.id &&
                                openBrief.key === hook.id;
                              return (
                                <button
                                  key={hook.id}
                                  type="button"
                                  disabled={busy}
                                  onClick={() => onHookClick(msg, hook)}
                                  className={cn(
                                    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50",
                                    saved
                                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                                      : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
                                    isOpen &&
                                      "ring-2 ring-zinc-400 ring-offset-1",
                                  )}
                                >
                                  {saved ? (
                                    <span className="inline-flex items-center gap-1">
                                      <FileText className="h-3 w-3" />
                                      {hook.label}
                                    </span>
                                  ) : (
                                    hook.label
                                  )}
                                </button>
                              );
                            })}

                            {isConsultAnswer ? (
                              <>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void onElaborate(msg)}
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50",
                                    msg.briefs?.[FULL_BRIEF_KEY]
                                      ? "border-zinc-300 bg-zinc-100 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                                      : "border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900",
                                  )}
                                >
                                  {msg.briefs?.[FULL_BRIEF_KEY] ? (
                                    <>
                                      <FileText className="h-3 w-3" />
                                      View brief
                                    </>
                                  ) : (
                                    <>
                                      <Maximize2 className="h-3 w-3" />
                                      Elaborate
                                    </>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => takeNotes(msg)}
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50",
                                    hasNotes
                                      ? "border-amber-600 bg-amber-600 text-white"
                                      : "border-amber-700/80 bg-amber-50 text-amber-950 hover:bg-amber-100 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-100",
                                  )}
                                  title={
                                    hasNotes
                                      ? jotting
                                        ? "Show the shared notepad"
                                        : "Open the notepad and keep jotting"
                                      : "Start a shared notepad beside the chat"
                                  }
                                >
                                  <NotebookPen className="h-3 w-3" />
                                  {hasNotes
                                    ? jotting
                                      ? "Show notepad"
                                      : "Resume notes"
                                    : "Take notes"}
                                </button>
                              </>
                            ) : null}
                          </div>

                          {isConsultAnswer && savedEntries.length > 1 ? (
                            <div className="flex flex-wrap gap-1">
                              {savedEntries.map(([key, brief]) => (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() => openSavedBrief(msg.id, key)}
                                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                                >
                                  <ChevronRight className="h-3 w-3" />
                                  {brief.title}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                {busy ? (
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Working…
                  </div>
                ) : null}
                <div ref={bottomRef} />
              </div>
            )}
          </ScrollArea>

          <div className="shrink-0 border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            {error ? (
              <p className="mb-2 text-xs text-red-600 dark:text-red-400">
                {error}
              </p>
            ) : null}

            {showNotepadDock ? (
              <div className="mx-auto mb-2 flex w-full max-w-2xl items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/50">
                <NotebookPen className="h-3.5 w-3.5 shrink-0 text-amber-800 dark:text-amber-200" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-amber-950 dark:text-amber-100">
                    Notepad · {notes.topic || "your topic"}
                  </p>
                  <p className="truncate text-[11px] text-amber-800/80 dark:text-amber-200/80">
                    {jotting
                      ? "Hidden while you chat — still jotting as you go"
                      : "Saved. Chat is normal again — open anytime to reread"}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0 border-amber-300 bg-white text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
                  onClick={() => {
                    if (!jotting) setJotting(true);
                    showNotepad();
                  }}
                >
                  {jotting ? "Show" : "Open"}
                </Button>
              </div>
            ) : null}

            {jotting && hasNotes ? (
              <div className="mx-auto mb-2 flex max-w-lg flex-wrap gap-1.5">
                {chips.map((hook) => (
                  <button
                    key={hook.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void onSubmit(hook.label)}
                    className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-950 transition hover:bg-amber-100 disabled:opacity-50 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                  >
                    {hook.label}
                  </button>
                ))}
              </div>
            ) : null}

            <form
              className={cn("mx-auto flex items-end gap-2", chatMaxWidth)}
              onSubmit={(e) => {
                e.preventDefault();
                void onSubmit();
              }}
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void onSubmit();
                  }
                }}
                rows={2}
                placeholder={
                  jotting
                    ? "Keep talking — we jot what you settle on the side…"
                    : "Ask a consult question…"
                }
                className={cn(
                  "min-h-[44px] flex-1 resize-none rounded-xl border bg-zinc-50 px-3 py-2.5 text-sm outline-none ring-zinc-400 placeholder:text-zinc-400 focus:ring-2 dark:bg-zinc-900",
                  jotting
                    ? "border-amber-200 dark:border-amber-900"
                    : "border-zinc-200 dark:border-zinc-700",
                )}
              />
              <Button
                type="submit"
                disabled={busy || !input.trim()}
                size="lg"
                className="shrink-0"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </section>

        {showSidePane ? (
          <section className="flex min-h-0 flex-col overflow-hidden bg-white dark:bg-zinc-950">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">
                  {sideKind === "brief" && activeBrief
                    ? `Brief · ${activeBrief.brief.title}`
                    : "Shared notepad"}
                </h2>
                <p className="text-xs text-zinc-500">
                  {sideKind === "brief"
                    ? "Snapshot of one answer"
                    : jotting
                      ? "Jotting as you talk — Hide or Done anytime"
                      : "Saved notes — Resume to keep jotting"}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                {sideKind === "notes" ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || (!notes.whereWeAre && !notes.topic)}
                      onClick={() => void onCleanUp()}
                    >
                      Clean up
                    </Button>
                    {jotting ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={doneJotting}
                        title="Stop jotting. Chat goes back to normal. Notes are kept."
                      >
                        Done
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setJotting(true)}
                      >
                        Resume
                      </Button>
                    )}
                    {rootedFromId ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        title="Throw away this notepad and start fresh from the original answer"
                        onClick={() => {
                          const root = messages.find((m) => m.id === rootedFromId);
                          if (root) takeNotes(root, { restart: true });
                        }}
                      >
                        Start over
                      </Button>
                    ) : null}
                  </>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={hidePane}
                  title={
                    sideKind === "notes"
                      ? "Hide notepad (keeps everything)"
                      : "Close brief"
                  }
                >
                  <X className="h-4 w-4" />
                  <span className="ml-1 hidden sm:inline">
                    {sideKind === "notes" ? "Hide" : "Close"}
                  </span>
                </Button>
              </div>
            </div>
            <ScrollArea className="min-h-0 flex-1 px-4 py-4">
              {sideKind === "brief" && activeBrief ? (
                <SimpleMarkdown text={activeBrief.brief.markdown} />
              ) : sideKind === "notes" ? (
                <NotepadView notes={notes} tip={tightenTip} />
              ) : null}
            </ScrollArea>
          </section>
        ) : null}
      </main>
    </div>
  );
}
