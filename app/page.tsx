"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  ChevronRight,
  FileText,
  FlaskConical,
  Loader2,
  Maximize2,
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
  Sediment,
  SedimentDelta,
  ThreadMessage,
} from "@/lib/types";
import {
  FULL_BRIEF_KEY,
  RESEARCH_MOVES,
  emptyDelta,
  emptySediment,
  seedSedimentFromAnswer,
} from "@/lib/types";
import { cn } from "@/lib/utils";

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function briefKeyFor(hook?: Hook) {
  return hook?.id ?? FULL_BRIEF_KEY;
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

function SedimentView({
  sediment,
  delta,
  note,
}: {
  sediment: Sediment;
  delta: SedimentDelta | null;
  note?: string | null;
}) {
  const empty = !sediment.claim && sediment.tensions.length === 0;
  if (empty) {
    return (
      <div className="flex h-full flex-col justify-center gap-2 text-sm text-zinc-500">
        <p className="font-medium text-zinc-700 dark:text-zinc-200">
          Sediment is empty
        </p>
        <p>
          Pressure-test an answer to seed a working claim here. Short chat
          moves then revise this memo.
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
      <div className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Working claim
        </h3>
        <p className="text-sm font-medium leading-relaxed text-zinc-900 dark:text-zinc-50">
          {sediment.claim || "—"}
        </p>
      </div>
      <Section title="Tensions" items={sediment.tensions} />
      <Section title="Evidence" items={sediment.evidence} />
      <Section title="Open questions" items={sediment.openQuestions} />

      {delta ? (
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
            This turn
          </h3>
          <div className="space-y-2 text-xs text-amber-950 dark:text-amber-100">
            <DeltaLine label="Strengthened" items={delta.strengthened} />
            <DeltaLine label="Weakened" items={delta.weakened} />
            <DeltaLine label="New tension" items={delta.newTension} />
            <DeltaLine label="Still open" items={delta.stillOpen} />
          </div>
        </div>
      ) : null}

      {note ? <p className="text-xs italic text-zinc-500">{note}</p> : null}
    </div>
  );
}

function DeltaLine({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <span className="font-semibold">{label}: </span>
      {items.join(" · ")}
    </div>
  );
}

type OpenBriefRef = { messageId: string; key: string };
type SideKind = "brief" | "sediment";

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelHint, setModelHint] = useState<string | null>(null);

  const [openBrief, setOpenBrief] = useState<OpenBriefRef | null>(null);
  const [researchActive, setResearchActive] = useState(false);
  const [sideKind, setSideKind] = useState<SideKind | null>(null);
  const [promotedFromId, setPromotedFromId] = useState<string | null>(null);
  const [moveHooks, setMoveHooks] = useState<Hook[]>(RESEARCH_MOVES);

  const [sediment, setSediment] = useState<Sediment>(() => emptySediment());
  const [delta, setDelta] = useState<SedimentDelta | null>(null);
  const [compactNote, setCompactNote] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const activeBrief = useMemo(() => {
    if (!openBrief) return null;
    const msg = messages.find((m) => m.id === openBrief.messageId);
    const brief = msg?.briefs?.[openBrief.key];
    if (!msg || !brief) return null;
    return { message: msg, brief, key: openBrief.key };
  }, [openBrief, messages]);

  const showSidePane =
    (sideKind === "brief" && activeBrief !== null) ||
    (sideKind === "sediment" && researchActive);

  const chatMaxWidth = showSidePane ? "max-w-lg" : "max-w-2xl";

  const paneTitle =
    sideKind === "brief" && activeBrief
      ? `Brief · ${activeBrief.brief.title}`
      : "Sediment";

  function minimizeSide() {
    if (sideKind === "brief") {
      setOpenBrief(null);
      setSideKind(researchActive ? "sediment" : null);
      return;
    }
    // Minimize sediment → back to clean consult chat; sediment kept in memory
    setSideKind(null);
  }

  function resumeSediment() {
    setOpenBrief(null);
    setSideKind("sediment");
    setResearchActive(true);
  }

  function exitResearch() {
    setResearchActive(false);
    setSideKind(null);
    setDelta(null);
    setMoveHooks(RESEARCH_MOVES);
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

  function pressureTest(msg: ThreadMessage) {
    const preferredKey =
      (openBrief?.messageId === msg.id ? openBrief.key : null) ??
      (msg.briefs?.[FULL_BRIEF_KEY] ? FULL_BRIEF_KEY : null) ??
      Object.keys(msg.briefs ?? {})[0] ??
      null;
    const brief = preferredKey ? msg.briefs?.[preferredKey] : null;
    const seeded = seedSedimentFromAnswer(msg.content, brief ?? null);

    setSediment(seeded);
    setDelta({
      ...emptyDelta(),
      strengthened: ["Provisional claim seeded from consult"],
      stillOpen: seeded.openQuestions.slice(0, 2),
    });
    setCompactNote(null);
    setPromotedFromId(msg.id);
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, promoted: true } : m)),
    );
    setOpenBrief(null);
    setResearchActive(true);
    setSideKind("sediment");
    setMoveHooks(RESEARCH_MOVES);
    setModelHint("sediment seeded · local");
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

  async function sendResearch(
    move: string,
    prior: ThreadMessage[],
    sed: Sediment,
  ) {
    const history = prior.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const res = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ move, sediment: sed, history }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Research request failed");
    setModelHint(
      data.mocked ? `mock · fallback` : data.modelUsed || "gemini-3.5-flash-lite",
    );
    return data as {
      reply: string;
      sediment: Sediment;
      delta: SedimentDelta;
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
      if (researchActive) {
        // Dialectic move against sediment
        setSideKind("sediment");
        setOpenBrief(null);
        const data = await sendResearch(question, messages, sediment);
        setSediment(data.sediment);
        setDelta(data.delta ?? emptyDelta());
        setCompactNote(null);
        if (data.hooks?.length) setMoveHooks(data.hooks);
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

  async function onCompact() {
    if (busy || !sediment.claim) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/compact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sediment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Compact failed");
      setSediment(data.sediment);
      setDelta(null);
      setCompactNote(data.note);
      setSideKind("sediment");
      setModelHint(
        data.mocked ? `mock · fallback` : data.modelUsed || "gemini-3.8-flash",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Compact failed");
    } finally {
      setBusy(false);
    }
  }

  function onHookClick(msg: ThreadMessage, hook: Hook) {
    if (researchActive && !msg.confidence) {
      // Research replies: hooks are dialectic moves
      void onSubmit(hook.label);
      return;
    }
    void onElaborate(msg, hook);
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-zinc-500" />
              <h1 className="truncate text-sm font-semibold tracking-tight">
                Two-lane LLM demo
              </h1>
              {researchActive ? (
                <Badge className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                  research branch
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              Consult is the spine. Elaborate opens a brief. Pressure-test
              branches into sediment dialectic.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {modelHint ? (
              <Badge className="hidden sm:inline-flex">{modelHint}</Badge>
            ) : null}
            {researchActive ? (
              <>
                {sideKind !== "sediment" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={resumeSediment}
                  >
                    <FlaskConical className="h-3.5 w-3.5" />
                    Sediment
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={exitResearch}
                  title="Return to plain consult replies"
                >
                  Back to consult
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main
        className={cn(
          "mx-auto grid w-full max-w-7xl flex-1 gap-0",
          showSidePane ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1",
        )}
      >
        <section
          className={cn(
            "flex min-h-[60vh] flex-col",
            showSidePane && "border-r border-zinc-200 dark:border-zinc-800",
          )}
        >
          <ScrollArea className="flex-1 px-4 py-4">
            {messages.length === 0 ? (
              <div
                className={cn("mx-auto flex flex-col gap-4 pt-10", chatMaxWidth)}
              >
                <div>
                  <h2 className="text-base font-semibold">
                    Ask something operational
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Answers stay short. Elaborate for a brief. Pressure-test
                    when you want a living claim to argue with.
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
                    sideKind === "brief" &&
                    openBrief?.messageId === msg.id;
                  const isPromotedSource = promotedFromId === msg.id;
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
                          isPromotedSource &&
                            researchActive &&
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
                              : researchActive
                                ? msg.hooks?.length
                                  ? msg.hooks
                                  : moveHooks
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
                                      : "Apply this dialectic move"
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
                                  onClick={() => pressureTest(msg)}
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50",
                                    msg.promoted
                                      ? "border-amber-600 bg-amber-600 text-white"
                                      : "border-amber-700/80 bg-amber-50 text-amber-950 hover:bg-amber-100 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/70",
                                  )}
                                  title="Promote this answer into a living claim to argue with"
                                >
                                  <FlaskConical className="h-3 w-3" />
                                  {msg.promoted
                                    ? "Re-seed research"
                                    : "Pressure-test"}
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

          <div className="border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            {error ? (
              <p className="mb-2 text-xs text-red-600 dark:text-red-400">
                {error}
              </p>
            ) : null}
            {researchActive ? (
              <div className="mx-auto mb-2 flex max-w-lg flex-wrap gap-1.5">
                {moveHooks.map((hook) => (
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
                  researchActive
                    ? "Attack, constrain, or falsify the claim…"
                    : "Ask a consult question…"
                }
                className="min-h-[44px] flex-1 resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm outline-none ring-zinc-400 placeholder:text-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
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
          <section className="flex min-h-[40vh] flex-col bg-white dark:bg-zinc-950 lg:min-h-0">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">{paneTitle}</h2>
                <p className="text-xs text-zinc-500">
                  {sideKind === "brief"
                    ? "Snapshot of one answer — minimize anytime"
                    : "Living working paper revised by each move"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {sideKind === "sediment" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy || !sediment.claim}
                    onClick={() => void onCompact()}
                  >
                    <Minimize2 className="h-3.5 w-3.5" />
                    Compact
                  </Button>
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
            <ScrollArea className="flex-1 px-4 py-4">
              {sideKind === "brief" && activeBrief ? (
                <SimpleMarkdown text={activeBrief.brief.markdown} />
              ) : sideKind === "sediment" ? (
                <SedimentView
                  sediment={sediment}
                  delta={delta}
                  note={compactNote}
                />
              ) : null}
            </ScrollArea>
          </section>
        ) : null}
      </main>
    </div>
  );
}
