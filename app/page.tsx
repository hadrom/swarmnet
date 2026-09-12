"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  FileText,
  Loader2,
  Maximize2,
  MessageSquare,
  PanelRight,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CanvasEditor } from "@/components/canvas-editor";
import { CONSULT_STARTERS } from "@/lib/prompts";
import type {
  AppMode,
  CanvasDoc,
  DiscussThread,
  Hook,
  SavedBrief,
  ThreadMessage,
  WorkingNotes,
} from "@/lib/types";
import {
  DISCUSS_CHIPS,
  FULL_BRIEF_KEY,
  canvasConvergenceStatus,
  emptyNotes,
  promoteBriefIntoCanvas,
  seedNotesFromAnswer,
  seedWorkingCanvas,
} from "@/lib/types";
import type { PromoteBriefMode } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Full session — consult spine + discuss branches stay in sync. */
const STORAGE_KEY = "two-lane-session-v5";
const LEGACY_KEYS = [
  "two-lane-notepad-v2",
  "two-lane-working-notes-v1",
  "two-lane-session-v1",
  "two-lane-session-v2",
  "two-lane-session-v3",
  "two-lane-session-v4",
];

type SideKind = "brief" | "memo" | "canvas";

type PersistedSession = {
  messages: ThreadMessage[];
  threads: Record<string, DiscussThread>;
  mode: AppMode;
  activeRootId: string | null;
  sideKind: SideKind | null;
  canvas: CanvasDoc | null;
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

function previewOf(text: string, max = 120) {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

function turnCount(thread: DiscussThread) {
  return thread.messages.filter((m) => m.role === "user").length;
}

function clearLegacyStorage() {
  if (typeof window === "undefined") return;
  for (const key of LEGACY_KEYS) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

function loadSession(): PersistedSession | null {
  if (typeof window === "undefined") return null;
  try {
    clearLegacyStorage();
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSession;
    if (!Array.isArray(parsed.messages) || parsed.messages.length === 0) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      messages: parsed.messages,
      threads: parsed.threads ?? {},
      mode: parsed.mode === "discuss" ? "discuss" : "consult",
      activeRootId: parsed.activeRootId ?? null,
      sideKind: parsed.sideKind ?? null,
      canvas: parsed.canvas ?? null,
    };
  } catch {
    return null;
  }
}

function saveSession(payload: PersistedSession) {
  if (typeof window === "undefined") return;
  try {
    if (payload.messages.length === 0) {
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

function DiscussView({
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
          Nothing in Discuss yet
        </p>
        <p>
          Keep talking — this side tracks what you&apos;re converging on
          together.
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
          <p className="text-[11px] text-zinc-400">Where the conversation stands</p>
        </div>
        <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-100">
          {notes.whereWeAre || "—"}
        </p>
      </div>

      <Section
        title="We've settled"
        hint="Points you both lined up on"
        items={notes.agreed}
      />
      <Section
        title="Still wondering"
        hint="Not decided yet"
        items={notes.stillOpen}
      />

      {notes.trail.length > 0 ? (
        <div className="space-y-1.5">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              How we got here
            </h3>
            <p className="text-[11px] text-zinc-400">Breadcrumbs as you talked</p>
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

type OpenBriefRef = { messageId: string; key: string; from: "consult" | "discuss" };

function emptyThread(root: ThreadMessage, brief?: SavedBrief | null): DiscussThread {
  return {
    rootAnswerId: root.id,
    rootPreview: previewOf(root.content),
    messages: [],
    notes: seedNotesFromAnswer(root.content, brief ?? null),
    chips: DISCUSS_CHIPS,
  };
}

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [threads, setThreads] = useState<Record<string, DiscussThread>>({});
  const [mode, setMode] = useState<AppMode>("consult");
  const [activeRootId, setActiveRootId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelHint, setModelHint] = useState<string | null>(null);

  const [openBrief, setOpenBrief] = useState<OpenBriefRef | null>(null);
  const [sideKind, setSideKind] = useState<SideKind | null>(null);
  const [tightenTip, setTightenTip] = useState<string | null>(null);
  const [canvas, setCanvas] = useState<CanvasDoc | null>(null);
  const [canvasEpoch, setCanvasEpoch] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  const activeThread = activeRootId ? threads[activeRootId] ?? null : null;
  const inDiscuss = mode === "discuss" && activeThread != null;

  useEffect(() => {
    const saved = loadSession();
    if (saved) {
      setMessages(saved.messages);
      setThreads(saved.threads);
      setCanvas(saved.canvas ?? null);
      const canDiscuss =
        saved.mode === "discuss" &&
        saved.activeRootId != null &&
        Boolean(saved.threads[saved.activeRootId]);
      if (canDiscuss) {
        setMode("discuss");
        setActiveRootId(saved.activeRootId);
        setSideKind(saved.sideKind === "brief" ? "brief" : "memo");
      } else {
        setMode("consult");
        setActiveRootId(null);
        if (saved.sideKind === "brief") setSideKind("brief");
        else if (saved.sideKind === "canvas" && saved.canvas) setSideKind("canvas");
        else setSideKind(null);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveSession({
      messages,
      threads,
      mode: inDiscuss ? "discuss" : "consult",
      activeRootId: inDiscuss ? activeRootId : null,
      canvas,
      sideKind:
        sideKind === "brief"
          ? "brief"
          : sideKind === "canvas"
            ? "canvas"
            : inDiscuss
              ? "memo"
              : null,
    });
  }, [messages, threads, mode, activeRootId, sideKind, canvas, hydrated, inDiscuss]);

  const visibleMessages = inDiscuss ? activeThread!.messages : messages;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleMessages, busy, mode]);

  const rootAnswer = useMemo(() => {
    if (!activeRootId) return null;
    return messages.find((m) => m.id === activeRootId) ?? null;
  }, [messages, activeRootId]);

  const activeBrief = useMemo(() => {
    if (!openBrief) return null;
    const pool =
      openBrief.from === "discuss" && activeThread
        ? activeThread.messages
        : messages;
    const msg = pool.find((m) => m.id === openBrief.messageId);
    const brief = msg?.briefs?.[openBrief.key];
    if (!msg || !brief) return null;
    return { message: msg, brief, key: openBrief.key };
  }, [openBrief, messages, activeThread]);

  const showMemoPane = inDiscuss && sideKind === "memo";
  const showBriefPane = sideKind === "brief" && activeBrief !== null;
  const showCanvasPane = !inDiscuss && sideKind === "canvas" && canvas != null;
  const showSidePane = showMemoPane || showBriefPane || showCanvasPane;
  const canvasStatus = useMemo(
    () => (canvas ? canvasConvergenceStatus(canvas) : null),
    [canvas],
  );
  const chatMaxWidth = showSidePane ? "max-w-lg" : "max-w-2xl";

  function patchThread(
    rootId: string,
    updater: (prev: DiscussThread) => DiscussThread,
  ) {
    setThreads((prev) => {
      const current = prev[rootId];
      if (!current) return prev;
      return { ...prev, [rootId]: updater(current) };
    });
  }

  function clearSession() {
    setMessages([]);
    setThreads({});
    setMode("consult");
    setActiveRootId(null);
    setSideKind(null);
    setOpenBrief(null);
    setCanvas(null);
    setCanvasEpoch(0);
    setTightenTip(null);
    setError(null);
    setModelHint(null);
    setInput("");
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(STORAGE_KEY);
      clearLegacyStorage();
    }
  }

  function backToConsult() {
    setMode("consult");
    setActiveRootId(null);
    setOpenBrief(null);
    setSideKind(null);
    setTightenTip(null);
    setModelHint(null);
    setError(null);
  }

  function hideSidePane() {
    setOpenBrief(null);
    if (inDiscuss && sideKind === "brief") {
      setSideKind("memo");
      return;
    }
    // Hide memo / canvas / brief — stay in current mode.
    setSideKind(null);
  }

  function openCanvas(msg?: ThreadMessage) {
    const seedText = msg?.content?.trim() ?? "";
    const next =
      canvas ??
      seedWorkingCanvas(
        seedText
          ? {
              title: seedText.split(/[.!?]/)[0]?.trim().slice(0, 72) || "Working note",
              seedAnswer: seedText,
            }
          : { title: "Working note" },
      );
    setCanvas(next);
    setOpenBrief(null);
    setSideKind("canvas");
    setError(null);
  }

  function promoteBrief(mode: PromoteBriefMode) {
    if (!activeBrief) return;
    const seedText = activeBrief.message.content.trim();
    const base =
      canvas ??
      seedWorkingCanvas({
        title: seedText.split(/[.!?]/)[0]?.trim().slice(0, 72) || "Working note",
        seedAnswer: seedText,
      });
    const next = promoteBriefIntoCanvas(base, activeBrief.brief, mode);
    setCanvas(next);
    setCanvasEpoch((n) => n + 1);
    setOpenBrief(null);
    setSideKind("canvas");
    setError(null);
  }

  function showMemo() {
    setOpenBrief(null);
    setSideKind("memo");
  }

  function openSavedBrief(
    messageId: string,
    key: string,
    from: "consult" | "discuss",
  ) {
    setOpenBrief({ messageId, key, from });
    setSideKind("brief");
  }

  function saveBriefOnMessage(
    messageId: string,
    key: string,
    brief: SavedBrief,
    from: "consult" | "discuss",
  ) {
    if (from === "discuss" && activeRootId) {
      patchThread(activeRootId, (t) => ({
        ...t,
        messages: t.messages.map((m) =>
          m.id === messageId
            ? { ...m, briefs: { ...(m.briefs ?? {}), [key]: brief } }
            : m,
        ),
      }));
    } else {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, briefs: { ...(m.briefs ?? {}), [key]: brief } }
            : m,
        ),
      );
    }
    setOpenBrief({ messageId, key, from });
    setSideKind("brief");
  }

  /**
   * Enter Discuss mode on an answer.
   * Creates a branch if needed; otherwise reopens the existing timeline.
   */
  function enterDiscuss(msg: ThreadMessage, opts?: { reseeds?: boolean }) {
    const preferredKey =
      (openBrief?.messageId === msg.id ? openBrief.key : null) ??
      (msg.briefs?.[FULL_BRIEF_KEY] ? FULL_BRIEF_KEY : null) ??
      Object.keys(msg.briefs ?? {})[0] ??
      null;
    const brief = preferredKey ? msg.briefs?.[preferredKey] : null;

    setThreads((prev) => {
      const existing = prev[msg.id];
      if (existing && !opts?.reseeds) return prev;
      return {
        ...prev,
        [msg.id]: emptyThread(msg, brief ?? null),
      };
    });

    setMode("discuss");
    setActiveRootId(msg.id);
    setOpenBrief(null);
    setSideKind("memo");
    setTightenTip(null);
    setModelHint(null);
    setError(null);
    setInput("");
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
      angles?: Hook[];
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

    setBusy(true);
    try {
      if (inDiscuss && activeRootId && activeThread) {
        const prior = activeThread.messages;
        const nextThreadMsgs = [...prior, userMsg];
        patchThread(activeRootId, (t) => ({
          ...t,
          messages: nextThreadMsgs,
        }));
        if (sideKind === "brief") {
          setOpenBrief(null);
          setSideKind("memo");
        }

        // Include root answer as context for the model.
        const historyForModel: ThreadMessage[] = [
          {
            id: `root-${activeRootId}`,
            role: "assistant",
            content: rootAnswer?.content ?? activeThread.rootPreview,
          },
          ...prior,
        ];
        const data = await sendDiscuss(
          question,
          historyForModel,
          activeThread.notes,
        );
        patchThread(activeRootId, (t) => ({
          ...t,
          notes: data.notes,
          chips: data.hooks?.length ? data.hooks : t.chips,
          rootPreview: t.rootPreview,
          messages: [
            ...t.messages.filter((m) => m.id !== userMsg.id),
            userMsg,
            {
              id: uid(),
              role: "assistant",
              confidence: "medium",
              content: data.reply,
              hooks: data.hooks,
              briefs: {},
            },
          ],
        }));
        setTightenTip(null);
      } else if (showCanvasPane && canvas) {
        const nextSpine = [...messages, userMsg];
        setMessages(nextSpine);
        const history = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));
        const res = await fetch("/api/canvas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: question, doc: canvas, history }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Canvas edit failed");
        if (data.doc) {
          setCanvas(data.doc);
          setCanvasEpoch((n) => n + 1);
        }
        setMessages([
          ...nextSpine,
          {
            id: uid(),
            role: "assistant",
            content: String(data.reply ?? "Updated the canvas."),
            confidence: "medium",
            hooks: [],
            angles: [],
            briefs: {},
          },
        ]);
        setModelHint(
          data.mocked ? "mock · fallback" : data.modelUsed || "gemini-3.5-flash-lite",
        );
        setSideKind("canvas");
      } else {
        const nextSpine = [...messages, userMsg];
        setMessages(nextSpine);
        const data = await sendConsult(question, messages);
        setMessages([
          ...nextSpine,
          {
            id: uid(),
            role: "assistant",
            content: data.answer,
            confidence: data.confidence,
            hooks: data.hooks,
            angles: data.angles ?? [],
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
    const from: "consult" | "discuss" = inDiscuss ? "discuss" : "consult";
    const key = briefKeyFor(hook);
    const existing = msg.briefs?.[key];
    if (existing) {
      openSavedBrief(msg.id, key, from);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const pool = inDiscuss && activeThread ? activeThread.messages : messages;
      const idx = pool.findIndex((m) => m.id === msg.id);
      const prior = idx >= 0 ? pool.slice(0, idx + 1) : [msg];
      const priorUser = [...prior].reverse().find((m) => m.role === "user");
      const question =
        priorUser?.content ??
        (inDiscuss ? activeThread?.notes.topic : undefined) ??
        msg.content;
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
      saveBriefOnMessage(
        msg.id,
        key,
        {
          title: hook?.label ?? "Elaborate",
          markdown: data.markdown,
          hookId: hook?.id,
        },
        from,
      );
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
    if (!activeThread || busy) return;
    if (!activeThread.notes.whereWeAre && !activeThread.notes.topic) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/compact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: activeThread.notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Clean up failed");
      if (activeRootId) {
        patchThread(activeRootId, (t) => ({ ...t, notes: data.notes }));
      }
      setTightenTip(data.note);
      setSideKind("memo");
      setOpenBrief(null);
      setModelHint(
        data.mocked ? `mock · fallback` : data.modelUsed || "gemini-3.8-flash",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clean up failed");
    } finally {
      setBusy(false);
    }
  }

  function onHookClick(_msg: ThreadMessage, hook: Hook) {
    // Spine hooks = consult follow-ups. Discuss chips = branch follow-ups.
    // Angled elaborates live inside the brief pane, not on the spine.
    void onSubmit(hook.label);
  }

  function renderMessageActions(msg: ThreadMessage) {
    if (msg.role !== "assistant") return null;
    const savedEntries = Object.entries(msg.briefs ?? {});
    const isBriefSource =
      sideKind === "brief" && openBrief?.messageId === msg.id;
    const branch = !inDiscuss ? threads[msg.id] : undefined;
    const hasBranch = Boolean(branch);
    const turns = branch ? turnCount(branch) : 0;

    return (
      <div className="flex max-w-[95%] flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {msg.confidence ? (
            <Badge>confidence · {msg.confidence}</Badge>
          ) : null}

          {(msg.hooks?.length
            ? msg.hooks
            : inDiscuss
              ? activeThread?.chips
              : undefined
          )?.map((hook) => (
            <button
              key={hook.id}
              type="button"
              disabled={busy}
              onClick={() => onHookClick(msg, hook)}
              className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            >
              {hook.label}
            </button>
          ))}

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

          {!inDiscuss ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => openCanvas(msg)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50",
                showCanvasPane
                  ? "border-sky-700 bg-sky-700 text-white"
                  : "border-sky-800/70 bg-sky-50 text-sky-950 hover:bg-sky-100 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-100",
              )}
              title="Open ground-truth canvas seeded from this answer"
            >
              <PanelRight className="h-3 w-3" />
              {canvas ? "Open canvas" : "Canvas"}
            </button>
          ) : null}

          {!inDiscuss ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => enterDiscuss(msg)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50",
                hasBranch
                  ? "border-amber-600 bg-amber-600 text-white"
                  : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400",
              )}
              title={
                hasBranch
                  ? "Reopen Discuss branch (alternate lane)"
                  : "Discuss — alternate branch lane"
              }
            >
              <MessageSquare className="h-3 w-3" />
              {hasBranch ? "Reopen discuss" : "Discuss"}
            </button>
          ) : null}
        </div>

        {!inDiscuss && hasBranch ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => enterDiscuss(msg)}
            className={cn(
              "flex w-fit max-w-full flex-col gap-0.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left transition hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:hover:bg-amber-950/70",
              isBriefSource && "ring-2 ring-zinc-400",
            )}
          >
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-950 dark:text-amber-100">
              <MessageSquare className="h-3 w-3" />
              Discussed
              {turns > 0 ? ` · ${turns} turn${turns === 1 ? "" : "s"}` : ""}
              <span className="font-medium text-amber-800/80 dark:text-amber-200/80">
                · Reopen
              </span>
            </span>
            <span className="truncate text-[11px] text-amber-900/80 dark:text-amber-200/70">
              {branch!.notes.topic || previewOf(branch!.rootPreview, 80)}
              {branch!.notes.agreed[0]
                ? ` · Settled: ${previewOf(branch!.notes.agreed[0], 60)}`
                : ""}
            </span>
          </button>
        ) : null}

        {savedEntries.length > 1 ? (
          <div className="flex flex-wrap gap-1">
            {savedEntries.map(([key, brief]) => (
              <button
                key={key}
                type="button"
                onClick={() =>
                  openSavedBrief(msg.id, key, inDiscuss ? "discuss" : "consult")
                }
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <ChevronRight className="h-3 w-3" />
                {brief.title}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-dvh flex-col overflow-hidden text-zinc-900 dark:text-zinc-50",
        inDiscuss
          ? "bg-amber-50/40 dark:bg-zinc-950"
          : "bg-zinc-50 dark:bg-zinc-950",
      )}
    >
      <header
        className={cn(
          "shrink-0 border-b backdrop-blur",
          inDiscuss
            ? "border-amber-200 bg-amber-50/90 dark:border-amber-900 dark:bg-amber-950/40"
            : "border-zinc-200 bg-white/80 dark:border-zinc-800 dark:bg-zinc-950/80",
        )}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {inDiscuss ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={backToConsult}
                  className="shrink-0 border-amber-300 bg-white text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Consult
                </Button>
              ) : (
                <Sparkles className="h-4 w-4 text-zinc-500" />
              )}
              <h1 className="truncate text-sm font-semibold tracking-tight">
                {inDiscuss
                  ? activeThread?.notes.topic || "Discuss"
                  : "Two-lane LLM demo"}
              </h1>
              {inDiscuss ? (
                <Badge className="border-amber-300 bg-white text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                  discuss mode
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {inDiscuss
                ? `Branch on: ${previewOf(rootAnswer?.content ?? activeThread?.rootPreview ?? "", 100)}`
                : "Consult for short answers. Elaborate to read deeper. Canvas is the ground-truth doc."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {modelHint ? (
              <Badge className="hidden sm:inline-flex">{modelHint}</Badge>
            ) : null}
            {!inDiscuss && canvas && sideKind !== "canvas" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openCanvas()}
                title="Reopen the canvas document"
              >
                <PanelRight className="h-3.5 w-3.5" />
                Canvas
              </Button>
            ) : null}
            {inDiscuss ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={backToConsult}
                title="Return to consult spine. Discuss branch is kept."
              >
                Done
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearSession}
              title="Clear consult and all Discuss branches"
            >
              <Plus className="h-3.5 w-3.5" />
              New chat
            </Button>
          </div>
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
            {!inDiscuss && messages.length === 0 ? (
              <div
                className={cn("mx-auto flex flex-col gap-4 pt-10", chatMaxWidth)}
              >
                <div>
                  <h2 className="text-base font-semibold">
                    Ask something operational
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Short answers stay on this spine — chips ask follow-ups.
                    Elaborate is a deep read. Canvas is the checked ledger
                    you and chat edit toward decisions.
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
                {inDiscuss ? (
                  <div className="rounded-2xl border border-amber-200 bg-white/80 px-3.5 py-3 shadow-sm dark:border-amber-900 dark:bg-zinc-900/80">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                      Root answer
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-800 dark:text-zinc-100">
                      {rootAnswer?.content ?? activeThread?.rootPreview}
                    </p>
                    {activeThread && turnCount(activeThread) === 0 ? (
                      <p className="mt-2 text-xs text-zinc-500">
                        Ask a follow-up — this timeline stays separate from
                        Consult.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {visibleMessages.map((msg) => {
                  const isBriefSource =
                    sideKind === "brief" && openBrief?.messageId === msg.id;
                  const isRootInConsult =
                    !inDiscuss && Boolean(threads[msg.id]);

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
                          isRootInConsult && "ring-2 ring-amber-500/50",
                        )}
                      >
                        {msg.content}
                      </div>
                      {renderMessageActions(msg)}
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

          <div
            className={cn(
              "shrink-0 border-t p-3",
              inDiscuss
                ? "border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/30"
                : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950",
            )}
          >
            {error ? (
              <p className="mb-2 text-xs text-red-600 dark:text-red-400">
                {error}
              </p>
            ) : null}

            {inDiscuss && activeThread && !showMemoPane ? (
              <div className="mx-auto mb-2 flex w-full max-w-2xl items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2 dark:border-amber-900 dark:bg-amber-950/50">
                <MessageSquare className="h-3.5 w-3.5 shrink-0 text-amber-800 dark:text-amber-200" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-amber-950 dark:text-amber-100">
                    Memo hidden · {activeThread.notes.topic || "this branch"}
                  </p>
                  <p className="truncate text-[11px] text-amber-800/80 dark:text-amber-200/80">
                    Still in Discuss — consult spine stays clean
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0 border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
                  onClick={showMemo}
                >
                  Show memo
                </Button>
              </div>
            ) : null}

            {inDiscuss && activeThread ? (
              <div className="mx-auto mb-2 flex max-w-lg flex-wrap gap-1.5">
                {activeThread.chips.map((hook) => (
                  <button
                    key={hook.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void onSubmit(hook.label)}
                    className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-950 transition hover:bg-amber-100 disabled:opacity-50 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
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
                  inDiscuss
                    ? "Discuss this answer — stays off the consult spine…"
                    : showCanvasPane
                      ? "Ask to draft or edit the canvas…"
                      : "Ask a consult question…"
                }
                className={cn(
                  "min-h-[44px] flex-1 resize-none rounded-xl border bg-white px-3 py-2.5 text-sm outline-none ring-zinc-400 placeholder:text-zinc-400 focus:ring-2 dark:bg-zinc-900",
                  inDiscuss
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
                  {showBriefPane && activeBrief
                    ? `Brief · ${activeBrief.brief.title}`
                    : showCanvasPane
                      ? "Canvas"
                      : "Discuss memo"}
                </h2>
                <p className="text-xs text-zinc-500">
                  {showBriefPane
                    ? "Deep read — promote keepers into Canvas"
                    : showCanvasPane
                      ? canvasStatus
                        ? `${canvasStatus.decisions} decided · ${canvasStatus.open} open — edit or ask in chat`
                        : "Ground-truth doc — edit here or ask in chat"
                      : "Updates as you talk in this branch"}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                {showMemoPane && activeThread ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={
                        busy ||
                        (!activeThread.notes.whereWeAre &&
                          !activeThread.notes.topic)
                      }
                      onClick={() => void onCleanUp()}
                    >
                      Clean up
                    </Button>
                    {rootAnswer ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        title="Wipe this Discuss branch and start fresh from the root answer"
                        onClick={() => enterDiscuss(rootAnswer, { reseeds: true })}
                      >
                        Start over
                      </Button>
                    ) : null}
                  </>
                ) : null}
                {showBriefPane && inDiscuss ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setOpenBrief(null);
                      setSideKind("memo");
                    }}
                  >
                    Back to memo
                  </Button>
                ) : null}
                {showBriefPane && !inDiscuss && canvas ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setOpenBrief(null);
                      setSideKind("canvas");
                    }}
                  >
                    Back to canvas
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={hideSidePane}
                  title={
                    showBriefPane
                      ? inDiscuss
                        ? "Close brief (stay in Discuss)"
                        : "Close brief"
                      : showCanvasPane
                        ? "Hide canvas"
                        : "Hide memo (stay in Discuss)"
                  }
                >
                  <X className="h-4 w-4" />
                  <span className="ml-1 hidden sm:inline">
                    {showBriefPane || showCanvasPane ? "Close" : "Hide"}
                  </span>
                </Button>
              </div>
            </div>
            <ScrollArea className="min-h-0 flex-1 px-4 py-4">
              {showCanvasPane && canvas ? (
                <CanvasEditor
                  key={canvasEpoch}
                  doc={canvas}
                  disabled={busy}
                  onChange={setCanvas}
                />
              ) : showBriefPane && activeBrief ? (
                <div className="space-y-4">
                  {(() => {
                    const src = activeBrief.message;
                    const angles = src.angles ?? [];
                    const fullSaved = Boolean(src.briefs?.[FULL_BRIEF_KEY]);
                    const fullOpen = openBrief?.key === FULL_BRIEF_KEY;
                    if (angles.length === 0 && !fullSaved) return null;
                    return (
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                          Angles
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void onElaborate(src)}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50",
                              fullOpen || (!openBrief?.key && fullSaved)
                                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                                : fullSaved
                                  ? "border-zinc-300 bg-zinc-100 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
                            )}
                          >
                            {fullSaved ? (
                              <FileText className="h-3 w-3" />
                            ) : null}
                            Overview
                          </button>
                          {angles.map((angle) => {
                            const saved = src.briefs?.[angle.id];
                            const isOpen =
                              openBrief?.messageId === src.id &&
                              openBrief.key === angle.id;
                            return (
                              <button
                                key={angle.id}
                                type="button"
                                disabled={busy}
                                onClick={() => void onElaborate(src, angle)}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50",
                                  isOpen
                                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                                    : saved
                                      ? "border-zinc-300 bg-zinc-100 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                                      : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
                                )}
                              >
                                {saved ? <FileText className="h-3 w-3" /> : null}
                                {angle.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                  <div className="flex flex-wrap gap-1.5 rounded-xl border border-sky-200 bg-sky-50/80 p-2 dark:border-sky-900 dark:bg-sky-950/30">
                    <p className="w-full text-[11px] font-medium text-sky-950 dark:text-sky-100">
                      Keep in Canvas
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => promoteBrief("bottom")}
                      className="border-sky-300 bg-white text-sky-950 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100"
                    >
                      Bottom line
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => promoteBrief("unknowns")}
                      className="border-sky-300 bg-white text-sky-950 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100"
                    >
                      Open questions
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => promoteBrief("full")}
                      className="border-sky-300 bg-white text-sky-950 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100"
                    >
                      Full brief
                    </Button>
                  </div>
                  <SimpleMarkdown text={activeBrief.brief.markdown} />
                </div>
              ) : showMemoPane && activeThread ? (
                <DiscussView notes={activeThread.notes} tip={tightenTip} />
              ) : null}
            </ScrollArea>
          </section>
        ) : null}
      </main>
    </div>
  );
}
