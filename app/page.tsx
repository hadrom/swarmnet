"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  ChevronRight,
  FileText,
  Loader2,
  Maximize2,
  PanelRight,
  PenLine,
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
  CanvasDoc,
  Hook,
  PromoteBriefMode,
  SavedBrief,
  ThreadMessage,
} from "@/lib/types";
import {
  FULL_BRIEF_KEY,
  canvasConvergenceStatus,
  promoteBriefIntoCanvas,
  seedWorkingCanvas,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/** Consult spine + Grounding doc. Discuss removed. */
const STORAGE_KEY = "two-lane-session-v7";
const LEGACY_KEYS = [
  "two-lane-session-v6",
  "two-lane-session-v5",
  "two-lane-session-v4",
  "two-lane-session-v3",
  "two-lane-session-v2",
  "two-lane-session-v1",
  "two-lane-notepad-v2",
  "two-lane-working-notes-v1",
];

type SideKind = "brief" | "grounding";

type PersistedSession = {
  messages: ThreadMessage[];
  sideKind: SideKind | null;
  canvas: CanvasDoc | null;
  groundingEditing?: boolean;
};

type OpenBriefRef = { messageId: string; key: string };

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function briefKeyFor(hook?: Hook) {
  return hook?.id ?? FULL_BRIEF_KEY;
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
    const parsed = JSON.parse(raw) as PersistedSession & {
      canvasEditing?: boolean;
      sideKind?: string | null;
    };
    if (!Array.isArray(parsed.messages) || parsed.messages.length === 0) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    const side: SideKind | null =
      parsed.sideKind === "brief"
        ? "brief"
        : parsed.sideKind === "grounding" || parsed.sideKind === "canvas"
          ? "grounding"
          : null;
    return {
      messages: parsed.messages,
      sideKind: side,
      canvas: parsed.canvas ?? null,
      groundingEditing: Boolean(
        parsed.groundingEditing ?? parsed.canvasEditing,
      ),
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

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelHint, setModelHint] = useState<string | null>(null);

  const [openBrief, setOpenBrief] = useState<OpenBriefRef | null>(null);
  const [sideKind, setSideKind] = useState<SideKind | null>(null);
  const [canvas, setCanvas] = useState<CanvasDoc | null>(null);
  const [canvasEpoch, setCanvasEpoch] = useState(0);
  const [groundingEditing, setGroundingEditing] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const saved = loadSession();
    if (saved) {
      setMessages(saved.messages);
      setCanvas(saved.canvas ?? null);
      if (saved.sideKind === "brief") {
        setSideKind("brief");
        setGroundingEditing(false);
      } else if (saved.sideKind === "grounding" && saved.canvas) {
        setSideKind("grounding");
        setGroundingEditing(Boolean(saved.groundingEditing));
      } else {
        setSideKind(null);
        setGroundingEditing(false);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const groundingOpen = sideKind === "grounding" && canvas != null;
    saveSession({
      messages,
      canvas,
      groundingEditing: groundingOpen ? groundingEditing : false,
      sideKind:
        sideKind === "brief"
          ? "brief"
          : sideKind === "grounding"
            ? "grounding"
            : null,
    });
  }, [messages, sideKind, canvas, groundingEditing, hydrated]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, sideKind]);

  const activeBrief = useMemo(() => {
    if (!openBrief) return null;
    const msg = messages.find((m) => m.id === openBrief.messageId);
    const brief = msg?.briefs?.[openBrief.key];
    if (!msg || !brief) return null;
    return { message: msg, brief, key: openBrief.key };
  }, [openBrief, messages]);

  const showBriefPane = sideKind === "brief" && activeBrief !== null;
  const showGroundingPane = sideKind === "grounding" && canvas != null;
  const editingGrounding = showGroundingPane && groundingEditing;
  const showSidePane = showBriefPane || showGroundingPane;
  const groundingStatus = useMemo(
    () => (canvas ? canvasConvergenceStatus(canvas) : null),
    [canvas],
  );
  const chatMaxWidth = showSidePane ? "max-w-lg" : "max-w-2xl";

  function clearSession() {
    setMessages([]);
    setSideKind(null);
    setOpenBrief(null);
    setCanvas(null);
    setCanvasEpoch(0);
    setGroundingEditing(false);
    setError(null);
    setModelHint(null);
    setInput("");
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(STORAGE_KEY);
      clearLegacyStorage();
    }
  }

  function hideSidePane() {
    setOpenBrief(null);
    if (sideKind === "grounding") setGroundingEditing(false);
    setSideKind(null);
  }

  function openGrounding(msg?: ThreadMessage) {
    const seedText = msg?.content?.trim() ?? "";
    const next =
      canvas ??
      seedWorkingCanvas(
        seedText
          ? {
              title:
                seedText.split(/[.!?]/)[0]?.trim().slice(0, 72) ||
                "Working note",
              seedAnswer: seedText,
            }
          : { title: "Working note" },
      );
    setCanvas(next);
    setOpenBrief(null);
    setSideKind("grounding");
    setGroundingEditing(false);
    setError(null);
  }

  function armGroundingEditing(armed: boolean) {
    if (!canvas) return;
    setSideKind("grounding");
    setOpenBrief(null);
    setGroundingEditing(armed);
    if (armed) {
      window.setTimeout(() => composerRef.current?.focus(), 50);
    }
  }

  function promoteBrief(mode: PromoteBriefMode) {
    if (!activeBrief) return;
    const seedText = activeBrief.message.content.trim();
    const base =
      canvas ??
      seedWorkingCanvas({
        title:
          seedText.split(/[.!?]/)[0]?.trim().slice(0, 72) || "Working note",
        seedAnswer: seedText,
      });
    const next = promoteBriefIntoCanvas(base, activeBrief.brief, mode);
    setCanvas(next);
    setCanvasEpoch((n) => n + 1);
    setOpenBrief(null);
    setSideKind("grounding");
    setGroundingEditing(false);
    setError(null);
  }

  function openSavedBrief(messageId: string, key: string) {
    setOpenBrief({ messageId, key });
    setSideKind("brief");
    setGroundingEditing(false);
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
    setGroundingEditing(false);
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
      data.mocked
        ? "mock · fallback"
        : data.modelUsed || "gemini-3.5-flash-lite",
    );
    return data as {
      answer: string;
      confidence: ThreadMessage["confidence"];
      hooks: Hook[];
      angles?: Hook[];
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
      kind: editingGrounding ? "grounding" : "consult",
    };

    setBusy(true);
    try {
      if (editingGrounding && canvas) {
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
        if (!res.ok) throw new Error(data.error || "Grounding edit failed");
        if (data.doc) {
          setCanvas(data.doc);
          setCanvasEpoch((n) => n + 1);
        }
        setMessages([
          ...nextSpine,
          {
            id: uid(),
            role: "assistant",
            kind: "grounding",
            content: String(data.reply ?? "Updated grounding."),
            hooks: [],
            angles: [],
            briefs: {},
          },
        ]);
        setModelHint(
          data.mocked
            ? "mock · fallback"
            : data.modelUsed || "gemini-3.5-flash-lite",
        );
        setSideKind("grounding");
      } else {
        const nextSpine = [...messages, userMsg];
        setMessages(nextSpine);
        const data = await sendConsult(question, messages);
        setMessages([
          ...nextSpine,
          {
            id: uid(),
            role: "assistant",
            kind: "consult",
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
      const prior = idx >= 0 ? messages.slice(0, idx + 1) : [msg];
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
        data.mocked ? "mock · fallback" : data.modelUsed || "gemini-3.8-flash",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Brief failed");
    } finally {
      setBusy(false);
    }
  }

  function onHookClick(_msg: ThreadMessage, hook: Hook) {
    void onSubmit(hook.label);
  }

  function isGroundingMsg(msg: ThreadMessage) {
    return msg.kind === "grounding" || msg.kind === "canvas";
  }

  function renderMessageActions(msg: ThreadMessage) {
    if (msg.role !== "assistant") return null;

    if (isGroundingMsg(msg)) {
      return (
        <div className="flex max-w-[95%] flex-wrap items-center gap-1.5">
          <Badge className="border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-100">
            grounding edit
          </Badge>
          <button
            type="button"
            disabled={busy}
            onClick={() => armGroundingEditing(true)}
            className="inline-flex items-center gap-1 rounded-full border border-sky-700 bg-sky-700 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-sky-800 disabled:opacity-50"
          >
            {showGroundingPane ? (
              <>
                <PenLine className="h-3 w-3" />
                Edit again
              </>
            ) : (
              <>
                <PanelRight className="h-3 w-3" />
                Open grounding
              </>
            )}
          </button>
        </div>
      );
    }

    const savedEntries = Object.entries(msg.briefs ?? {});
    const isBriefSource =
      sideKind === "brief" && openBrief?.messageId === msg.id;

    return (
      <div className="flex max-w-[95%] flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {msg.confidence ? (
            <Badge>confidence · {msg.confidence}</Badge>
          ) : null}

          {msg.hooks?.map((hook) => (
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
              isBriefSource && "ring-2 ring-zinc-400",
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
            onClick={() => openGrounding(msg)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50",
              showGroundingPane
                ? "border-sky-700 bg-sky-700 text-white"
                : "border-sky-800/70 bg-sky-50 text-sky-950 hover:bg-sky-100 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-100",
            )}
            title="Open grounding doc seeded from this answer"
          >
            <PanelRight className="h-3 w-3" />
            {canvas ? "Open grounding" : "Grounding"}
          </button>
        </div>

        {savedEntries.length > 1 ? (
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
    );
  }

  return (
    <div
      className={cn(
        "flex h-dvh flex-col overflow-hidden text-zinc-900 dark:text-zinc-50",
        editingGrounding
          ? "bg-sky-50/50 dark:bg-zinc-950"
          : "bg-zinc-50 dark:bg-zinc-950",
      )}
    >
      <header
        className={cn(
          "shrink-0 border-b backdrop-blur",
          editingGrounding
            ? "border-sky-300 bg-sky-50/95 dark:border-sky-900 dark:bg-sky-950/50"
            : "border-zinc-200 bg-white/80 dark:border-zinc-800 dark:bg-zinc-950/80",
        )}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-zinc-500" />
              <h1 className="truncate text-sm font-semibold tracking-tight">
                Two-lane LLM demo
              </h1>
              {editingGrounding ? (
                <Badge className="border-sky-400 bg-sky-700 text-white dark:border-sky-600 dark:bg-sky-600">
                  editing grounding
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {editingGrounding
                ? "Composer targets Grounding — turn off Edit with chat to consult again."
                : "Consult for short answers. Elaborate to read deeper. Grounding is the ground-truth doc."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {modelHint ? (
              <Badge className="hidden sm:inline-flex">{modelHint}</Badge>
            ) : null}
            {canvas && sideKind !== "grounding" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openGrounding()}
                title="Reopen the grounding document"
              >
                <PanelRight className="h-3.5 w-3.5" />
                Grounding
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearSession}
              title="Clear consult and grounding"
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
            {messages.length === 0 ? (
              <div
                className={cn("mx-auto flex flex-col gap-4 pt-10", chatMaxWidth)}
              >
                <div>
                  <h2 className="text-base font-semibold">
                    Ask something operational
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Short answers stay on this spine — chips ask follow-ups.
                    Elaborate is a deep read. Grounding is the checked ledger
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
                {messages.map((msg) => {
                  const isBriefSource =
                    sideKind === "brief" && openBrief?.messageId === msg.id;
                  const groundingTurn = isGroundingMsg(msg);

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
                            ? groundingTurn
                              ? "bg-sky-800 text-white dark:bg-sky-200 dark:text-sky-950"
                              : "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                            : groundingTurn
                              ? "bg-sky-50 text-sky-950 shadow-sm ring-1 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-50 dark:ring-sky-900"
                              : "bg-white text-zinc-800 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-800",
                          isBriefSource &&
                            "ring-2 ring-zinc-900 dark:ring-zinc-100",
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
              editingGrounding
                ? "border-sky-300 bg-sky-100/90 dark:border-sky-900 dark:bg-sky-950/40"
                : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950",
            )}
          >
            {error ? (
              <p className="mb-2 text-xs text-red-600 dark:text-red-400">
                {error}
              </p>
            ) : null}

            {editingGrounding ? (
              <div className="mx-auto mb-2 flex w-full max-w-2xl items-center gap-2 rounded-xl border border-sky-400 bg-sky-700 px-3 py-2.5 text-white shadow-sm dark:border-sky-600 dark:bg-sky-800">
                <PenLine className="h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold tracking-wide">
                    Edit with chat · armed
                  </p>
                  <p className="truncate text-[11px] text-sky-100/90">
                    Your next message patches Grounding — not a consult answer
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0 border-white/40 bg-white/10 text-white hover:bg-white/20"
                  onClick={() => armGroundingEditing(false)}
                >
                  Back to consult
                </Button>
              </div>
            ) : null}

            {showGroundingPane && !editingGrounding ? (
              <div className="mx-auto mb-2 flex w-full max-w-2xl items-center gap-2 rounded-xl border border-sky-200 bg-white px-3 py-2 dark:border-sky-900 dark:bg-sky-950/40">
                <PanelRight className="h-3.5 w-3.5 shrink-0 text-sky-800 dark:text-sky-200" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-sky-950 dark:text-sky-100">
                    Grounding open · reading
                  </p>
                  <p className="truncate text-[11px] text-sky-800/80 dark:text-sky-200/80">
                    Chat still consults — arm Edit with chat to patch the doc
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0 bg-sky-700 text-white hover:bg-sky-800"
                  onClick={() => armGroundingEditing(true)}
                >
                  <PenLine className="h-3.5 w-3.5" />
                  Edit with chat
                </Button>
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
                ref={composerRef}
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
                  editingGrounding
                    ? "Edit grounding — e.g. lock this as a Decision…"
                    : "Ask a consult question…"
                }
                className={cn(
                  "min-h-[44px] flex-1 resize-none rounded-xl border bg-white px-3 py-2.5 text-sm outline-none placeholder:text-zinc-400 focus:ring-2 dark:bg-zinc-900",
                  editingGrounding
                    ? "border-sky-400 bg-sky-50/80 ring-sky-500 dark:border-sky-700 dark:bg-sky-950/30"
                    : "border-zinc-200 ring-zinc-400 dark:border-zinc-700",
                )}
              />
              <Button
                type="submit"
                disabled={busy || !input.trim()}
                size="lg"
                className={cn(
                  "shrink-0",
                  editingGrounding && "bg-sky-700 hover:bg-sky-800",
                )}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </section>

        {showSidePane ? (
          <section className="flex min-h-0 flex-col overflow-hidden bg-white dark:bg-zinc-950">
            <div
              className={cn(
                "flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3",
                editingGrounding
                  ? "border-sky-300 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40"
                  : "border-zinc-200 dark:border-zinc-800",
              )}
            >
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">
                  {showBriefPane && activeBrief
                    ? `Brief · ${activeBrief.brief.title}`
                    : editingGrounding
                      ? "Grounding · chat editing"
                      : "Grounding"}
                </h2>
                <p className="text-xs text-zinc-500">
                  {showBriefPane
                    ? "Deep read — add keepers into Grounding"
                    : editingGrounding
                      ? "Composer is locked onto this doc until you disarm"
                      : groundingStatus
                        ? `${groundingStatus.decisions} decided · ${groundingStatus.open} open — read or edit yourself`
                        : "Ground-truth doc — edit here; arm chat to patch"}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                {showGroundingPane ? (
                  <Button
                    type="button"
                    size="sm"
                    variant={editingGrounding ? "outline" : "primary"}
                    className={cn(
                      editingGrounding
                        ? "border-sky-400 bg-white text-sky-950 hover:bg-sky-50 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100"
                        : "bg-sky-700 text-white hover:bg-sky-800",
                    )}
                    onClick={() => armGroundingEditing(!editingGrounding)}
                  >
                    <PenLine className="h-3.5 w-3.5" />
                    {editingGrounding ? "Stop editing" : "Edit with chat"}
                  </Button>
                ) : null}
                {showBriefPane && canvas ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setOpenBrief(null);
                      setSideKind("grounding");
                      setGroundingEditing(false);
                    }}
                  >
                    Back to grounding
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={hideSidePane}
                  title={showBriefPane ? "Close brief" : "Hide grounding"}
                >
                  <X className="h-4 w-4" />
                  <span className="ml-1 hidden sm:inline">Close</span>
                </Button>
              </div>
            </div>
            <ScrollArea className="min-h-0 flex-1 px-4 py-4">
              {showGroundingPane && canvas ? (
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
                      Add to Grounding
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => promoteBrief("half")}
                      className="border-sky-300 bg-white text-sky-950 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100"
                      title="Bottom line + open questions"
                    >
                      Half
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => promoteBrief("full")}
                      className="border-sky-300 bg-white text-sky-950 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100"
                      title="Full brief into grounding sections"
                    >
                      Full
                    </Button>
                  </div>
                  <SimpleMarkdown text={activeBrief.brief.markdown} />
                </div>
              ) : null}
            </ScrollArea>
          </section>
        ) : null}
      </main>
    </div>
  );
}
