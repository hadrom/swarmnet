"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Loader2, Maximize2, Minimize2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CONSULT_STARTERS, RESEARCH_STARTERS } from "@/lib/prompts";
import type {
  Hook,
  Mode,
  Sediment,
  SedimentDelta,
  ThreadMessage,
} from "@/lib/types";
import { emptyDelta, emptySediment } from "@/lib/types";
import { cn } from "@/lib/utils";

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
          Make a move on the left. The working claim, tensions, and open
          questions will accumulate here — not in the chat transcript.
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

      {delta && (
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
      )}

      {note ? (
        <p className="text-xs italic text-zinc-500">{note}</p>
      ) : null}
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

export default function Home() {
  const [mode, setMode] = useState<Mode>("consult");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelHint, setModelHint] = useState<string | null>(null);

  // Consult right pane
  const [brief, setBrief] = useState<string | null>(null);
  const [briefTitle, setBriefTitle] = useState<string | null>(null);

  // Research right pane
  const [sediment, setSediment] = useState<Sediment>(emptySediment);
  const [delta, setDelta] = useState<SedimentDelta | null>(null);
  const [compactNote, setCompactNote] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const starters = mode === "consult" ? CONSULT_STARTERS : RESEARCH_STARTERS;

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setMessages([]);
    setInput("");
    setError(null);
    setModelHint(null);
    setBrief(null);
    setBriefTitle(null);
    setSediment(emptySediment());
    setDelta(null);
    setCompactNote(null);
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

  async function sendResearch(move: string, prior: ThreadMessage[], sed: Sediment) {
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
      if (mode === "consult") {
        const data = await sendConsult(question, messages);
        setMessages([
          ...nextThread,
          {
            id: uid(),
            role: "assistant",
            content: data.answer,
            confidence: data.confidence,
            hooks: data.hooks,
          },
        ]);
      } else {
        const data = await sendResearch(question, messages, sediment);
        setSediment(data.sediment);
        setDelta(data.delta ?? emptyDelta());
        setCompactNote(null);
        setMessages([
          ...nextThread,
          {
            id: uid(),
            role: "assistant",
            content: data.reply,
            hooks: data.hooks,
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
    setBusy(true);
    setError(null);
    try {
      // Find the nearest preceding user question
      const idx = messages.findIndex((m) => m.id === msg.id);
      const priorUser = [...messages]
        .slice(0, idx)
        .reverse()
        .find((m) => m.role === "user");
      const question = priorUser?.content ?? msg.content;
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          liteAnswer: msg.content,
          hookLabel: hook?.label,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Brief failed");
      setBrief(data.markdown);
      setBriefTitle(hook?.label ?? "Elaborate");
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
    if (mode === "consult") {
      void onElaborate(msg, hook);
    } else {
      void onSubmit(hook.label);
    }
  }

  const paneTitle = useMemo(() => {
    if (mode === "consult") return briefTitle ? `Brief · ${briefTitle}` : "Brief";
    return "Sediment";
  }, [mode, briefTitle]);

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
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              Consult = compressed answers. Research = dialectic + sediment.
              Gemini is a stand-in for on-prem.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {modelHint ? (
              <Badge className="hidden sm:inline-flex">{modelHint}</Badge>
            ) : null}
            <div className="flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-900">
              <button
                type="button"
                onClick={() => switchMode("consult")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition",
                  mode === "consult"
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
                )}
              >
                Consult
              </button>
              <button
                type="button"
                onClick={() => switchMode("research")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition",
                  mode === "research"
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
                )}
              >
                Research
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-0 lg:grid-cols-2">
        {/* Left: thread */}
        <section className="flex min-h-[60vh] flex-col border-r border-zinc-200 dark:border-zinc-800">
          <ScrollArea className="flex-1 px-4 py-4">
            {messages.length === 0 ? (
              <div className="mx-auto flex max-w-lg flex-col gap-4 pt-10">
                <div>
                  <h2 className="text-base font-semibold">
                    {mode === "consult"
                      ? "Ask something operational"
                      : "Open with a claim or a pressure move"}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    {mode === "consult"
                      ? "Answers stay to one paragraph. Click a chip or Elaborate when you want depth."
                      : "Short moves on the left. The living memo grows on the right."}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  {starters.map((s) => (
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
              <div className="mx-auto flex max-w-lg flex-col gap-4">
                {messages.map((msg) => (
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
                      )}
                    >
                      {msg.content}
                    </div>
                    {msg.role === "assistant" ? (
                      <div className="flex max-w-[95%] flex-wrap items-center gap-1.5">
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
                        {mode === "consult" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void onElaborate(msg)}
                            className="inline-flex items-center gap-1 rounded-full border border-zinc-900 bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                          >
                            <Maximize2 className="h-3 w-3" />
                            Elaborate
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
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
            <form
              className="mx-auto flex max-w-lg items-end gap-2"
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
                  mode === "consult"
                    ? "Ask a consult question…"
                    : "Make a dialectic move…"
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

        {/* Right: brief / sediment */}
        <section className="flex min-h-[50vh] flex-col bg-white dark:bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <div>
              <h2 className="text-sm font-semibold">{paneTitle}</h2>
              <p className="text-xs text-zinc-500">
                {mode === "consult"
                  ? "Depth on demand — not another chat bubble"
                  : "Living working paper revised by each move"}
              </p>
            </div>
            {mode === "research" ? (
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
            ) : brief ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setBrief(null);
                  setBriefTitle(null);
                }}
              >
                Clear
              </Button>
            ) : null}
          </div>
          <ScrollArea className="flex-1 px-4 py-4">
            {mode === "consult" ? (
              brief ? (
                <SimpleMarkdown text={brief} />
              ) : (
                <div className="flex h-full flex-col justify-center gap-2 text-sm text-zinc-500">
                  <p className="font-medium text-zinc-700 dark:text-zinc-200">
                    No brief yet
                  </p>
                  <p>
                    Stay compressed on the left. Click a chip or{" "}
                    <span className="font-medium text-zinc-700 dark:text-zinc-200">
                      Elaborate
                    </span>{" "}
                    when you want a structured document here.
                  </p>
                </div>
              )
            ) : (
              <SedimentView
                sediment={sediment}
                delta={delta}
                note={compactNote}
              />
            )}
          </ScrollArea>
        </section>
      </main>
    </div>
  );
}
