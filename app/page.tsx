"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  ChevronRight,
  FileText,
  Loader2,
  Maximize2,
  MessageSquare,
  Minimize2,
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

const NOTES_STORAGE_KEY = "two-lane-working-notes-v1";

type PersistedNotes = {
  notes: WorkingNotes;
  chips: Hook[];
  rootedFromId: string | null;
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

function loadPersisted(): PersistedNotes | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(NOTES_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedNotes;
  } catch {
    return null;
  }
}

function persistNotes(payload: PersistedNotes) {
  if (typeof window === "undefined") return;
  try {
    if (notesAreEmpty(payload.notes)) {
      sessionStorage.removeItem(NOTES_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
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

function NotesView({
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
          No notes yet
        </p>
        <p>
          Click Discuss on an answer to start a shared memo here. Keep chatting
          as usual — this side grows as an audit trail of what you lock in.
        </p>
      </div>
    );
  }

  const Section = ({
    title,
    items,
  }: {
    title: string;
    items: string[];
  }) =>
    items.length === 0 ? null : (
      <div className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {title}
        </h3>
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
            Topic
          </h3>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            {notes.topic}
          </p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Where we are
        </h3>
        <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-100">
          {notes.whereWeAre || "—"}
        </p>
      </div>

      <Section title="Agreed" items={notes.agreed} />
      <Section title="Still open" items={notes.stillOpen} />

      {notes.trail.length > 0 ? (
        <div className="space-y-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Trail
          </h3>
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
                <span className="shrink-0 text-xs text-zinc-400">
                  {i + 1}.
                </span>
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
  const [hydrated, setHydrated] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  // Restore notes from this browser tab session so minimize / refresh keep progress.
  useEffect(() => {
    const saved = loadPersisted();
    if (saved && !notesAreEmpty(saved.notes)) {
      setNotes(saved.notes);
      setChips(saved.chips?.length ? saved.chips : DISCUSS_CHIPS);
      setRootedFromId(saved.rootedFromId);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    persistNotes({ notes, chips, rootedFromId });
  }, [notes, chips, rootedFromId, hydrated]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const hasNotes = !notesAreEmpty(notes);
  const notesOpen = sideKind === "notes";
  const showNotesDock = hasNotes && sideKind !== "notes";

  const activeBrief = useMemo(() => {
    if (!openBrief) return null;
    const msg = messages.find((m) => m.id === openBrief.messageId);
    const brief = msg?.briefs?.[openBrief.key];
    if (!msg || !brief) return null;
    return { message: msg, brief, key: openBrief.key };
  }, [openBrief, messages]);

  const showSidePane =
    (sideKind === "brief" && activeBrief !== null) ||
    (sideKind === "notes" && hasNotes);

  const chatMaxWidth = showSidePane ? "max-w-lg" : "max-w-2xl";

  const paneTitle =
    sideKind === "brief" && activeBrief
      ? `Brief · ${activeBrief.brief.title}`
      : notes.topic
        ? `Notes · ${notes.topic}`
        : "Working notes";

  function minimizeSide() {
    if (sideKind === "brief") {
      setOpenBrief(null);
      // Prefer returning to notes if they exist — never discard them.
      setSideKind(hasNotes ? null : null);
      return;
    }
    setSideKind(null);
  }

  function openNotesPane() {
    setOpenBrief(null);
    setSideKind("notes");
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

  /** Open notes beside chat. Seeds only once; never wipes existing progress. */
  function openDiscuss(msg: ThreadMessage, opts?: { restart?: boolean }) {
    const preferredKey =
      (openBrief?.messageId === msg.id ? openBrief.key : null) ??
      (msg.briefs?.[FULL_BRIEF_KEY] ? FULL_BRIEF_KEY : null) ??
      Object.keys(msg.briefs ?? {})[0] ??
      null;
    const brief = preferredKey ? msg.briefs?.[preferredKey] : null;

    if (opts?.restart || notesAreEmpty(notes)) {
      const seeded = seedNotesFromAnswer(msg.content, brief ?? null);
      setNotes(seeded);
      setTightenTip(null);
      setChips(DISCUSS_CHIPS);
      setRootedFromId(msg.id);
    }

    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, promoted: true } : m)),
    );
    setOpenBrief(null);
    setSideKind("notes");
    setModelHint(
      notesAreEmpty(notes) || opts?.restart
        ? "notes started · local"
        : "notes restored",
    );
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

  async function sendDiscuss(
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
    if (!res.ok) throw new Error(data.error || "Discuss request failed");
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
      // Once notes exist, every turn quietly updates them — even if the pane is minimized.
      if (hasNotes) {
        if (sideKind === "brief") {
          setOpenBrief(null);
          setSideKind("notes");
        }
        const data = await sendDiscuss(question, messages, notes);
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

  async function onTighten() {
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
      if (!res.ok) throw new Error(data.error || "Tighten failed");
      setNotes(data.notes);
      setTightenTip(data.note);
      setSideKind("notes");
      setModelHint(
        data.mocked ? `mock · fallback` : data.modelUsed || "gemini-3.8-flash",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tighten failed");
    } finally {
      setBusy(false);
    }
  }

  function onHookClick(msg: ThreadMessage, hook: Hook) {
    // After notes exist, chips on later replies are follow-ups (same as typing).
    if (hasNotes && msg.confidence == null) {
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
              {hasNotes ? (
                <Badge className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                  notes live
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              One chat. Elaborate opens a brief. Discuss pins living notes beside
              you — minimize anytime; progress stays.
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
                    Answers stay short. Elaborate for a brief. Discuss when you
                    want a living agreement trail that sticks around.
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
                            "ring-2 ring-amber-500/70",
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
                              : hasNotes
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
                                  title={
                                    isConsultAnswer
                                      ? saved
                                        ? "Reopen saved brief"
                                        : "Elaborate on this"
                                      : "Ask this follow-up"
                                  }
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
                                    openBrief?.messageId === msg.id &&
                                      openBrief.key === FULL_BRIEF_KEY &&
                                      "ring-2 ring-zinc-400 ring-offset-1",
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
                                  onClick={() => openDiscuss(msg)}
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50",
                                    hasNotes
                                      ? "border-amber-600 bg-amber-600 text-white"
                                      : "border-amber-700/80 bg-amber-50 text-amber-950 hover:bg-amber-100 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/70",
                                  )}
                                  title={
                                    hasNotes
                                      ? "Open your living notes (progress is kept)"
                                      : "Pin living notes beside this chat"
                                  }
                                >
                                  <MessageSquare className="h-3 w-3" />
                                  {hasNotes ? "Open notes" : "Discuss"}
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
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200",
                                    openBrief?.messageId === msg.id &&
                                      openBrief.key === key &&
                                      "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100",
                                  )}
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

            {/* Sticky notes dock — the seamless handoff instead of header mode toggles */}
            {showNotesDock ? (
              <button
                type="button"
                onClick={openNotesPane}
                className="mx-auto mb-2 flex w-full max-w-2xl items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left transition hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/50 dark:hover:bg-amber-950/80"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 text-amber-800 dark:text-amber-200" />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-amber-950 dark:text-amber-100">
                      {notes.topic || "Working notes"}
                    </span>
                    <span className="block truncate text-[11px] text-amber-800/80 dark:text-amber-200/80">
                      {notes.agreed.length
                        ? `${notes.agreed.length} agreed · ${notes.stillOpen.length} open`
                        : "Tap to reopen — progress is kept"}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-[11px] font-medium text-amber-900 dark:text-amber-100">
                  Open
                </span>
              </button>
            ) : null}

            {hasNotes ? (
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
                  hasNotes
                    ? "Keep chatting — notes update even if minimized…"
                    : "Ask a consult question…"
                }
                className={cn(
                  "min-h-[44px] flex-1 resize-none rounded-xl border bg-zinc-50 px-3 py-2.5 text-sm outline-none ring-zinc-400 placeholder:text-zinc-400 focus:ring-2 dark:bg-zinc-900",
                  hasNotes
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
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">{paneTitle}</h2>
                <p className="text-xs text-zinc-500">
                  {sideKind === "brief"
                    ? "Snapshot of one answer — minimize anytime"
                    : "Living trail — minimize anytime; nothing is wiped"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {sideKind === "notes" ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || (!notes.whereWeAre && !notes.topic)}
                      onClick={() => void onTighten()}
                    >
                      <Minimize2 className="h-3.5 w-3.5" />
                      Tighten
                    </Button>
                    {rootedFromId ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        title="Wipe and restart notes from the rooted answer"
                        onClick={() => {
                          const root = messages.find((m) => m.id === rootedFromId);
                          if (root) openDiscuss(root, { restart: true });
                        }}
                      >
                        Restart
                      </Button>
                    ) : null}
                  </>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={minimizeSide}
                  title="Minimize pane"
                >
                  <X className="h-4 w-4" />
                  <span className="ml-1 hidden sm:inline">Minimize</span>
                </Button>
              </div>
            </div>
            <ScrollArea className="min-h-0 flex-1 px-4 py-4">
              {sideKind === "brief" && activeBrief ? (
                <SimpleMarkdown text={activeBrief.brief.markdown} />
              ) : sideKind === "notes" ? (
                <NotesView notes={notes} tip={tightenTip} />
              ) : null}
            </ScrollArea>
          </section>
        ) : null}
      </main>
    </div>
  );
}
