"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  BookOpen,
  ChevronDown,
  List,
  Loader2,
  MessageCircle,
  PanelRight,
  PenLine,
  Sparkles,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CanvasEditor } from "@/components/canvas-editor";
import { ContentsIndex } from "@/components/contents-index";
import { ChatSidebar, ChatSidebarToggle } from "@/components/chat-sidebar";
import {
  PointableAnswer,
  type DescribedPhrase,
} from "@/components/pointable-answer";
import {
  emptyChat,
  loadChatHistory,
  migrateLegacySession,
  newChatId,
  saveChatHistory,
  snapshotFromState,
  titleFromMessages,
  upsertChat,
  type ChatSnapshot,
  type SideKind,
} from "@/lib/chat-history";
import { buildChatContents, buildJournalContents } from "@/lib/thread-contents";
import { pickConsultStarters } from "@/lib/prompts";
import type {
  CanvasDoc,
  Hook,
  PromoteBriefMode,
  SavedBrief,
  ThreadMessage,
} from "@/lib/types";
import {
  FULL_BRIEF_KEY,
  appendAskNoteToCanvas,
  canvasJournalStatus,
  listAskNotes,
  phraseFromAskQuestion,
  promoteBriefIntoCanvas,
  seedWorkingCanvas,
} from "@/lib/types";
import {
  clampTabTitle,
  isBlankTitle,
  shortTitle,
  titleFromExchange,
} from "@/lib/titles";
import { cn } from "@/lib/utils";

const LEGACY_KEYS = [
  "two-lane-session-v8",
  "two-lane-session-v7",
  "two-lane-session-v6",
  "two-lane-session-v5",
  "two-lane-session-v4",
  "two-lane-session-v3",
  "two-lane-session-v2",
  "two-lane-session-v1",
  "two-lane-notepad-v2",
  "two-lane-working-notes-v1",
];

type OpenBriefRef = { messageId: string; key: string };

function uid() {
  return newChatId();
}

function briefKeyFor(hook?: Hook) {
  return hook?.id ?? FULL_BRIEF_KEY;
}

/** Precompute the Main deep read once the user has dwelled on a consult answer this long. */
const DWELL_PREFETCH_MS = 2000;

/** Generic high-signal follow-ups used to backfill to a full 6 when the model returns fewer. */
const FALLBACK_ASK_NEXT: Hook[] = [
  { id: "fallback-risk", label: "What's the biggest risk?" },
  { id: "fallback-step", label: "Smallest first step?" },
  { id: "fallback-owner", label: "Who owns the next step?" },
  { id: "fallback-timing", label: "By when?" },
  { id: "fallback-cost", label: "What's the cost?" },
  { id: "fallback-alt", label: "What are the alternatives?" },
  { id: "fallback-measure", label: "How do we measure success?" },
  { id: "fallback-change", label: "What would change this?" },
];

/** Always return exactly 6 distinct hooks, padding with fallbacks when needed. */
function ensureSixHooks(hooks: Hook[]): Hook[] {
  const out: Hook[] = [];
  const seen = new Set<string>();
  const push = (h: Hook) => {
    const key = h.label.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(h);
  };
  hooks.forEach(push);
  for (const f of FALLBACK_ASK_NEXT) {
    if (out.length >= 6) break;
    push(f);
  }
  return out.slice(0, 6);
}

/**
 * "Ask next" as a dropdown menu of the most-probable follow-up questions,
 * ranked most → least likely. Picking one sends it as the next consult
 * question so the user rarely has to type a prompt. Always shows a full
 * 2×3 grid of 6 suggestions.
 */
function AskNextMenu({
  hooks,
  userJob,
  busy,
  onPick,
}: {
  hooks: Hook[];
  userJob?: string;
  busy: boolean;
  onPick: (hook: Hook) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (hooks.length === 0) return null;

  const items = ensureSixHooks(hooks);

  return (
    <div className="space-y-1" ref={ref}>
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        <MessageCircle className="h-3 w-3" />
        Ask next
        {userJob ? (
          <span className="font-normal normal-case tracking-normal text-zinc-400">
            · {userJob}
          </span>
        ) : null}
      </p>
      <div className="relative">
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-950 transition hover:border-amber-300 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/70"
        >
          <Sparkles className="h-3 w-3" />
          Suggested follow-ups
          <ChevronDown
            className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
          />
        </button>
        {open ? (
          <div
            role="listbox"
            className="absolute left-0 z-30 mt-1 grid max-w-[90vw] grid-cols-[max-content_max-content] grid-rows-3 justify-items-start gap-1.5 overflow-x-auto rounded-lg border border-amber-200 bg-white p-1.5 shadow-lg dark:border-amber-900/70 dark:bg-zinc-900"
          >
            {items.map((hook) => (
              <button
                key={hook.id}
                type="button"
                role="option"
                aria-selected={false}
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  onPick(hook);
                }}
                title={hook.why || "Send this as the next consult question"}
                className="inline-flex w-fit items-center whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-950 transition hover:border-amber-300 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/70"
              >
                {hook.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function shouldReplaceGroundingTitle(title: string) {
  const t = title.replace(/\s+/g, " ").trim();
  if (!t) return true;
  if (/^(grounding|shared memory|working note|untitled)$/i.test(t)) return true;
  if (t.length > 28) return true;
  if (/\?$/.test(t)) return true;
  if (/\b(?:is|are|was|were)\b/i.test(t)) return true;
  return false;
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

function applyChatToUi(
  chat: ChatSnapshot,
  setters: {
    setMessages: (m: ThreadMessage[]) => void;
    setCanvas: (c: CanvasDoc | null) => void;
    setSideKind: (s: SideKind | null) => void;
    setGroundingEditing: (v: boolean) => void;
    setOpenBrief: (v: OpenBriefRef | null) => void;
    setCanvasEpoch: (n: number | ((p: number) => number)) => void;
    setError: (e: string | null) => void;
    setModelHint: (h: string | null) => void;
    setInput: (s: string) => void;
  },
) {
  setters.setMessages(chat.messages);
  setters.setCanvas(chat.canvas);
  if (chat.sideKind === "grounding" && chat.canvas) {
    setters.setSideKind("grounding");
    setters.setGroundingEditing(Boolean(chat.groundingEditing));
  } else {
    setters.setSideKind(null);
    setters.setGroundingEditing(false);
  }
  setters.setOpenBrief(null);
  setters.setCanvasEpoch((n) => n + 1);
  setters.setError(null);
  setters.setModelHint(null);
  setters.setInput("");
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
  // Testing metric for the dwell precompute: how often the deep read was ready
  // (ready), still computing (waited), or not yet started (early) at click time.
  const [computeStats, setComputeStats] = useState({
    ready: 0,
    waited: 0,
    early: 0,
  });

  const [openBrief, setOpenBrief] = useState<OpenBriefRef | null>(null);
  const [streamingBrief, setStreamingBrief] = useState<{
    messageId: string;
    key: string;
    title: string;
    hookId?: string;
    markdown: string;
  } | null>(null);
  const [sideKind, setSideKind] = useState<SideKind | null>(null);
  const [canvas, setCanvas] = useState<CanvasDoc | null>(null);
  const canvasRef = useRef<CanvasDoc | null>(null);
  const [canvasEpoch, setCanvasEpoch] = useState(0);
  const [groundingEditing, setGroundingEditing] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [starters, setStarters] = useState<string[]>([]);
  const [activeChatId, setActiveChatId] = useState("");
  const [chats, setChats] = useState<ChatSnapshot[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [memoryView, setMemoryView] = useState<"journal" | "contents">(
    "journal",
  );
  const [conceptFocus, setConceptFocus] = useState<{
    phrase: string;
    nonce: number;
  } | null>(null);
  const [consultView, setConsultView] = useState<"chat" | "contents">("chat");

  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const chatsRef = useRef<ChatSnapshot[]>([]);
  const prefetchRef = useRef<{
    id: string;
    key: string;
    controller: AbortController;
  } | null>(null);
  const activeMetaRef = useRef<{
    id: string;
    createdAt: number;
    title: string;
    titleLocked: boolean;
  }>({
    id: "",
    createdAt: Date.now(),
    title: "New chat",
    titleLocked: false,
  });

  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  useEffect(() => {
    canvasRef.current = canvas;
  }, [canvas]);

  useEffect(() => {
    clearLegacyStorage();
    const existing = loadChatHistory();
    const migrated = migrateLegacySession();
    let nextChats = existing?.chats ?? [];
    let activeId = existing?.activeId ?? "";

    if (migrated) {
      nextChats = upsertChat(nextChats, migrated);
      activeId = migrated.id;
    }

    const active =
      (activeId && nextChats.find((c) => c.id === activeId)) || nextChats[0];

    if (active) {
      setActiveChatId(active.id);
      activeMetaRef.current = {
        id: active.id,
        createdAt: active.createdAt,
        title: active.title,
        titleLocked: Boolean(active.titleLocked),
      };
      setMessages(active.messages);
      setCanvas(active.canvas);
      if (active.sideKind === "grounding" && active.canvas) {
        setSideKind("grounding");
        setGroundingEditing(Boolean(active.groundingEditing));
      }
      setChats(nextChats);
      saveChatHistory({ activeId: active.id, chats: nextChats });
    } else {
      const draft = emptyChat();
      setActiveChatId(draft.id);
      activeMetaRef.current = {
        id: draft.id,
        createdAt: draft.createdAt,
        title: draft.title,
        titleLocked: false,
      };
      setChats([]);
      saveChatHistory({ activeId: draft.id, chats: [] });
    }

    setStarters(pickConsultStarters(3));
    setHydrated(true);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || !activeChatId) return;
    const groundingOpen = sideKind === "grounding" && canvas != null;
    const snap = snapshotFromState({
      id: activeChatId,
      createdAt: activeMetaRef.current.createdAt,
      prevTitle: activeMetaRef.current.title,
      titleLocked: activeMetaRef.current.titleLocked,
      messages,
      canvas,
      groundingEditing: groundingOpen ? groundingEditing : false,
      sideKind: sideKind === "grounding" ? "grounding" : null,
    });
    activeMetaRef.current = {
      id: snap.id,
      createdAt: snap.createdAt,
      title: snap.title,
      titleLocked: Boolean(snap.titleLocked),
    };
    const next = upsertChat(chatsRef.current, snap);
    chatsRef.current = next;
    setChats(next);
    saveChatHistory({ activeId: activeChatId, chats: next });
  }, [messages, sideKind, canvas, groundingEditing, hydrated, activeChatId]);

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

  const streamingOpen = Boolean(
    streamingBrief &&
      openBrief &&
      streamingBrief.messageId === openBrief.messageId &&
      streamingBrief.key === openBrief.key,
  );
  const showBriefPane = activeBrief !== null || streamingOpen;
  const showGroundingPane = sideKind === "grounding" && canvas != null;
  const describedPhrases: DescribedPhrase[] = useMemo(
    () =>
      listAskNotes(canvas).map((n) => ({
        phrase: n.phrase,
        noteId: n.id,
      })),
    [canvas],
  );

  function openAskNote(noteId: string) {
    setSideKind("grounding");
    setGroundingEditing(false);
    setError(null);
    // Wait for the grounding pane + canvas HTML to mount, then scroll.
    window.setTimeout(() => {
      const el = document.getElementById(noteId);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ask-note-flash");
      window.setTimeout(() => el.classList.remove("ask-note-flash"), 1600);
    }, 60);
  }

  const editingGrounding = showGroundingPane && groundingEditing;
  const columnCount =
    (showBriefPane ? 1 : 0) + 1 + (showGroundingPane ? 1 : 0);
  const groundingStatus = useMemo(
    () => (canvas ? canvasJournalStatus(canvas) : null),
    [canvas],
  );
  const journalContents = useMemo(
    () => (canvas ? buildJournalContents(canvas.bodyHtml) : []),
    [canvas],
  );
  const chatContentsLocal = useMemo(
    () => buildChatContents(messages),
    [messages],
  );
  const [contentsTitleOverrides, setContentsTitleOverrides] = useState<
    Record<string, string>
  >({});
  const contentsTitleCacheRef = useRef<Record<string, string>>({});

  const chatContents = useMemo(
    () =>
      chatContentsLocal.map((s) => ({
        ...s,
        title: contentsTitleOverrides[s.id] ?? s.title,
      })),
    [chatContentsLocal, contentsTitleOverrides],
  );
  const journalIndex = useMemo(
    () =>
      journalContents.map((s) => ({
        ...s,
        title: contentsTitleOverrides[s.id] ?? s.title,
      })),
    [journalContents, contentsTitleOverrides],
  );

  // When Contents opens, refine microtitles via /api/title (cached per section).
  useEffect(() => {
    const openChat = consultView === "contents";
    const openJournal = memoryView === "contents";
    if (!openChat && !openJournal) return;
    const sections = openChat ? chatContentsLocal : journalContents;
    let cancelled = false;

    async function enrich() {
      const pending = sections.filter(
        (s) =>
          !contentsTitleCacheRef.current[s.id] &&
          (s.seedAnswer.trim().length >= 24 || s.seedQuestion.trim().length >= 12),
      );
      await Promise.all(
        pending.slice(0, 8).map(async (s) => {
          try {
            const res = await fetch("/api/title", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                question: s.seedQuestion || s.title,
                answer: s.seedAnswer,
              }),
            });
            if (!res.ok || cancelled) return;
            const data = (await res.json()) as { title?: string };
            const title = clampTabTitle(String(data.title ?? ""), s.title);
            if (!title || cancelled) return;
            contentsTitleCacheRef.current[s.id] = title;
            setContentsTitleOverrides((prev) =>
              prev[s.id] === title ? prev : { ...prev, [s.id]: title },
            );
          } catch {
            // keep local microtitle
          }
        }),
      );
    }

    void enrich();
    return () => {
      cancelled = true;
    };
  }, [consultView, memoryView, chatContentsLocal, journalContents]);

  function jumpToPathMessage(messageId: string) {
    setConsultView("chat");
    window.setTimeout(() => {
      const el = document.querySelector(
        `[data-message-id="${CSS.escape(messageId)}"]`,
      );
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ask-note-flash");
      window.setTimeout(() => el.classList.remove("ask-note-flash"), 1600);
    }, 60);
  }
  const chatMaxWidth =
    columnCount >= 3 ? "max-w-md" : columnCount === 2 ? "max-w-lg" : "max-w-2xl";

  const uiSetters = {
    setMessages,
    setCanvas,
    setSideKind,
    setGroundingEditing,
    setOpenBrief,
    setCanvasEpoch,
    setError,
    setModelHint,
    setInput,
  };

  function flushCurrentChat(): ChatSnapshot[] {
    if (!activeChatId) return chatsRef.current;
    const groundingOpen = sideKind === "grounding" && canvas != null;
    const snap = snapshotFromState({
      id: activeChatId,
      createdAt: activeMetaRef.current.createdAt,
      prevTitle: activeMetaRef.current.title,
      titleLocked: activeMetaRef.current.titleLocked,
      messages,
      canvas,
      groundingEditing: groundingOpen ? groundingEditing : false,
      sideKind: sideKind === "grounding" ? "grounding" : null,
    });
    const next = upsertChat(chatsRef.current, snap);
    chatsRef.current = next;
    setChats(next);
    return next;
  }

  function startNewChat() {
    if (busy) return;
    cancelPrefetch();
    const next = flushCurrentChat();
    const draft = emptyChat();
    setActiveChatId(draft.id);
    activeMetaRef.current = {
      id: draft.id,
      createdAt: draft.createdAt,
      title: draft.title,
      titleLocked: false,
    };
    applyChatToUi(draft, uiSetters);
    resetConsultView();
    setBusy(false);
    saveChatHistory({ activeId: draft.id, chats: next });
    setStarters(pickConsultStarters(3));
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }

  function selectChat(id: string) {
    if (busy || id === activeChatId) return;
    cancelPrefetch();
    const next = flushCurrentChat();
    const chat = next.find((c) => c.id === id);
    if (!chat) return;
    setActiveChatId(chat.id);
    activeMetaRef.current = {
      id: chat.id,
      createdAt: chat.createdAt,
      title: chat.title,
      titleLocked: Boolean(chat.titleLocked),
    };
    applyChatToUi(chat, uiSetters);
    resetConsultView();
    setBusy(false);
    saveChatHistory({ activeId: chat.id, chats: next });
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
    void maybeRefreshChatTitle(chat);
  }

  function deleteChat(id: string) {
    if (busy) return;
    let next = chatsRef.current.filter((c) => c.id !== id);
    if (id === activeChatId) {
      const fallback = next[0];
      if (fallback) {
        setActiveChatId(fallback.id);
        activeMetaRef.current = {
          id: fallback.id,
          createdAt: fallback.createdAt,
          title: fallback.title,
          titleLocked: Boolean(fallback.titleLocked),
        };
        applyChatToUi(fallback, uiSetters);
        resetConsultView();
        saveChatHistory({ activeId: fallback.id, chats: next });
      } else {
        const draft = emptyChat();
        next = [];
        setActiveChatId(draft.id);
        activeMetaRef.current = {
          id: draft.id,
          createdAt: draft.createdAt,
          title: draft.title,
          titleLocked: false,
        };
        applyChatToUi(draft, uiSetters);
        resetConsultView();
        setStarters(pickConsultStarters(3));
        saveChatHistory({ activeId: draft.id, chats: next });
      }
    } else {
      saveChatHistory({ activeId: activeChatId, chats: next });
    }
    chatsRef.current = next;
    setChats(next);
  }

  function closeElaborate() {
    setOpenBrief(null);
  }

  function hideGrounding() {
    if (sideKind === "grounding") setGroundingEditing(false);
    setSideKind(null);
    setMemoryView("journal");
  }

  function resetConsultView() {
    setConsultView("chat");
  }


  function applyChatTitle(rawTitle: string, opts?: { lock?: boolean }) {
    const nextTitle = clampTabTitle(rawTitle, activeMetaRef.current.title || "New chat");
    if (isBlankTitle(nextTitle)) return;
    const lock = opts?.lock ?? true;
    activeMetaRef.current = {
      ...activeMetaRef.current,
      title: nextTitle,
      titleLocked: lock,
    };
    const groundingOpen = sideKind === "grounding" && canvas != null;
    const snap = snapshotFromState({
      id: activeChatId || activeMetaRef.current.id,
      createdAt: activeMetaRef.current.createdAt,
      prevTitle: nextTitle,
      titleLocked: lock,
      messages,
      canvas:
        canvas && shouldReplaceGroundingTitle(canvas.title)
          ? { ...canvas, title: nextTitle, updatedAt: Date.now() }
          : canvas,
      groundingEditing: groundingOpen ? groundingEditing : false,
      sideKind: sideKind === "grounding" ? "grounding" : null,
    });
    if (canvas && shouldReplaceGroundingTitle(canvas.title)) {
      setCanvas({ ...canvas, title: nextTitle, updatedAt: Date.now() });
    }
    const next = upsertChat(chatsRef.current, snap);
    chatsRef.current = next;
    setChats(next);
    saveChatHistory({
      activeId: activeChatId || activeMetaRef.current.id,
      chats: next,
    });
  }

  async function maybeRefreshChatTitle(chat: ChatSnapshot) {
    if (chat.titleLocked) return;
    const firstUser = chat.messages.find((m) => m.role === "user");
    const firstAssistant = chat.messages.find((m) => m.role === "assistant");
    if (!firstUser || !firstAssistant) return;
    // Instant local upgrade from Q+A while the model title loads.
    const local = titleFromExchange(firstUser.content, firstAssistant.content);
    if (chat.id === activeMetaRef.current.id) {
      applyChatTitle(local, { lock: false });
    }
    try {
      const res = await fetch("/api/title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: firstUser.content,
          answer: firstAssistant.content,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.title) return;
      if (activeMetaRef.current.id !== chat.id) return;
      applyChatTitle(String(data.title), { lock: true });
    } catch {
      // keep local title
    }
  }

  function openGrounding(msg?: ThreadMessage) {
    const seedText = msg?.content?.trim() ?? "";
    const chatTitle = !isBlankTitle(activeMetaRef.current.title)
      ? activeMetaRef.current.title
      : titleFromMessages(messages);
    const titleSeed =
      chatTitle !== "New chat" ? chatTitle : seedText;
    const desiredTitle = clampTabTitle(titleSeed, "Shared memory");
    const next = canvas
      ? shouldReplaceGroundingTitle(canvas.title)
        ? { ...canvas, title: desiredTitle, updatedAt: Date.now() }
        : canvas
      : seedWorkingCanvas(
          seedText
            ? { title: desiredTitle, seedAnswer: seedText }
            : { title: desiredTitle },
        );
    setCanvas(next);
    setSideKind("grounding");
    setGroundingEditing(false);
    setError(null);
  }

  function armGroundingEditing(armed: boolean) {
    if (!canvas) return;
    setSideKind("grounding");
    setGroundingEditing(armed);
    if (armed) {
      window.setTimeout(() => composerRef.current?.focus(), 50);
    }
  }

  function promoteBrief(mode: PromoteBriefMode) {
    if (!activeBrief) return;
    const seedText = activeBrief.message.content.trim();
    const chatTitle = !isBlankTitle(activeMetaRef.current.title)
      ? activeMetaRef.current.title
      : titleFromMessages(messages);
    const titleSeed =
      chatTitle !== "New chat" ? chatTitle : seedText;
    const base =
      canvas ??
      seedWorkingCanvas({
        title: clampTabTitle(titleSeed, "Shared memory"),
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
      intent?: ThreadMessage["intent"];
      hooks: Hook[];
      angles?: Hook[];
      tabTitle?: string;
    };
  }


  async function askAboutIntoNotes(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setError(null);
    setBusy(true);
    try {
      const chatTitle = !isBlankTitle(activeMetaRef.current.title)
        ? activeMetaRef.current.title
        : titleFromMessages(messages);
      const base =
        canvasRef.current ??
        seedWorkingCanvas({
          title: clampTabTitle(chatTitle, "Shared memory"),
        });
      // Short answer only — do not append to the consult spine.
      const data = await sendConsult(q, messages);
      const next = appendAskNoteToCanvas(
        canvasRef.current ?? base,
        q,
        data.answer,
        phraseFromAskQuestion(q),
      );
      canvasRef.current = next;
      setCanvas(next);
      setCanvasEpoch((n) => n + 1);
      setSideKind("grounding");
      setGroundingEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ask about this failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(text?: string) {
    const question = (text ?? input).trim();
    if (!question || busy) return;
    cancelPrefetch();
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
        if (!res.ok) throw new Error(data.error || "Shared memory edit failed");
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
            content: String(data.reply ?? "Updated shared memory."),
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
            intent: data.intent,
            hooks: (data.hooks ?? []).slice(0, 6),
            angles: data.angles ?? [],
            briefs: {},
          },
        ]);
        const wasUntitled = !activeMetaRef.current.titleLocked;
        if (wasUntitled) {
          const fallback = titleFromExchange(question, data.answer);
          applyChatTitle(data.tabTitle || fallback, { lock: Boolean(data.tabTitle) });
          if (!data.tabTitle) {
            void (async () => {
              try {
                const res = await fetch("/api/title", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ question, answer: data.answer }),
                });
                const titled = await res.json();
                if (res.ok && titled.title) {
                  applyChatTitle(String(titled.title), { lock: true });
                } else {
                  applyChatTitle(fallback, { lock: true });
                }
              } catch {
                applyChatTitle(fallback, { lock: true });
              }
            })();
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  // Single streaming worker for a deep read, shared by the dwell precompute
  // (background) and an explicit "Read deeper" click. It streams from /api/brief,
  // surfaces progress into streamingBrief flushed per completed paragraph, and
  // caches the full result on completion. Only one runs at a time.
  async function computeBrief(msg: ThreadMessage, hook?: Hook) {
    if (msg.role !== "assistant") return;
    if (msg.kind === "grounding" || msg.kind === "canvas") return;
    const key = briefKeyFor(hook);
    if (msg.briefs?.[key]) return;
    if (prefetchRef.current) {
      if (prefetchRef.current.id === msg.id && prefetchRef.current.key === key) {
        return; // already computing this exact brief
      }
      prefetchRef.current.controller.abort(); // different target → take over
      prefetchRef.current = null;
    }
    const idx = messages.findIndex((m) => m.id === msg.id);
    const prior = idx >= 0 ? messages.slice(0, idx + 1) : [msg];
    const priorUser = [...prior].reverse().find((m) => m.role === "user");
    const question = priorUser?.content ?? msg.content;
    // Condensed topic title per deep read (not a generic "Main").
    const title = hook?.label
      ? clampTabTitle(hook.label, hook.label)
      : titleFromExchange(question, msg.content, "Deep read");
    const controller = new AbortController();
    prefetchRef.current = { id: msg.id, key, controller };
    setStreamingBrief({
      messageId: msg.id,
      key,
      title,
      hookId: hook?.id,
      markdown: "",
    });
    console.info("[read-deeper] compute start", { id: msg.id, key, title });
    try {
      const history = prior.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          liteAnswer: msg.content,
          hookLabel: hook?.label,
          history,
          stream: true,
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Brief failed");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let received = "";
      let shownLen = 0;
      let doneMarkdown = "";
      let modelUsed = "";
      let mocked = false;
      let streamError: string | null = null;

      // Reveal only whole paragraphs as they complete (no per-word pacing).
      const flushParagraphs = () => {
        const lastBreak = received.lastIndexOf("\n\n");
        if (lastBreak > shownLen) {
          shownLen = lastBreak;
          const shown = received.slice(0, shownLen);
          setStreamingBrief((s) =>
            s && s.messageId === msg.id && s.key === key
              ? { ...s, markdown: shown }
              : s,
          );
        }
      };
      const handle = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let ev: {
          type: string;
          text?: string;
          markdown?: string;
          modelUsed?: string;
          mocked?: boolean;
          error?: string;
        };
        try {
          ev = JSON.parse(trimmed);
        } catch {
          return;
        }
        if (ev.type === "answer") {
          received += ev.text ?? "";
          flushParagraphs();
        } else if (ev.type === "done") {
          doneMarkdown = ev.markdown || received;
          modelUsed = ev.modelUsed ?? "";
          mocked = Boolean(ev.mocked);
        } else if (ev.type === "error") {
          streamError = ev.error || "Brief failed";
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) handle(line);
      }
      if (buf) handle(buf);
      if (streamError) throw new Error(streamError);

      const finalMarkdown = (doneMarkdown || received).trim();
      if (!finalMarkdown) throw new Error("Empty deep read");
      saveBriefOnMessage(msg.id, key, {
        title,
        markdown: finalMarkdown,
        hookId: hook?.id,
      });
      setModelHint(
        mocked ? "mock · fallback" : modelUsed || "gemini-3.8-flash",
      );
      console.info("[read-deeper] compute done", { id: msg.id, key });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        console.info("[read-deeper] compute failed", err);
      }
    } finally {
      if (
        prefetchRef.current?.id === msg.id &&
        prefetchRef.current?.key === key
      ) {
        prefetchRef.current = null;
      }
      setStreamingBrief((s) =>
        s && s.messageId === msg.id && s.key === key ? null : s,
      );
    }
  }

  function cancelPrefetch() {
    prefetchRef.current?.controller.abort();
    prefetchRef.current = null;
    setStreamingBrief(null);
    setOpenBrief(null);
  }

  // After the user dwells on a fresh consult answer for DWELL_PREFETCH_MS, precompute
  // its Main deep read in the background (tokens buffer quietly; pane only on open).
  // New consult prompts / new chat call cancelPrefetch() so the old stream dies.
  useEffect(() => {
    if (busy) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    if (last.kind === "grounding" || last.kind === "canvas") return;
    if (last.briefs?.[FULL_BRIEF_KEY]) return;
    const timer = window.setTimeout(() => {
      void computeBrief(last);
    }, DWELL_PREFETCH_MS);
    return () => window.clearTimeout(timer);
    // computeBrief is stable enough for this dwell trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, busy]);

  async function onElaborate(msg: ThreadMessage, hook?: Hook) {
    const key = briefKeyFor(hook);

    // Testing metric: how often is the Main precompute ready when the user clicks?
    if (key === FULL_BRIEF_KEY) {
      const state: "ready" | "waited" | "early" = msg.briefs?.[FULL_BRIEF_KEY]
        ? "ready"
        : prefetchRef.current?.id === msg.id &&
            prefetchRef.current?.key === FULL_BRIEF_KEY
          ? "waited"
          : "early";
      setComputeStats((s) => ({ ...s, [state]: s[state] + 1 }));
      console.info("[read-deeper] open", { id: msg.id, state });
    }

    // Precompute finished before the click → show the full deep read immediately.
    const existing = msg.briefs?.[key];
    if (existing) {
      openSavedBrief(msg.id, key);
      return;
    }

    // Not ready yet: open the pane and attach to (or start) the compute. The pane
    // shows paragraphs as they complete, then the full text once done.
    setError(null);
    setOpenBrief({ messageId: msg.id, key });
    if (
      prefetchRef.current?.id === msg.id &&
      prefetchRef.current?.key === key
    ) {
      return; // a compute is already in flight; the pane will show its progress
    }
    void computeBrief(msg, hook);
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
            shared memory edit
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
                Open shared memory
              </>
            )}
          </button>
        </div>
      );
    }

    const isBriefSource =
      showBriefPane && openBrief?.messageId === msg.id;
    const askNext = msg.hooks ?? [];

    return (
      <div className="flex max-w-[95%] flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {msg.confidence ? (
            <Badge>confidence · {msg.confidence}</Badge>
          ) : null}

          <button
            type="button"
            disabled={busy}
            onClick={() => void onElaborate(msg)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-50",
              msg.briefs?.[FULL_BRIEF_KEY]
                ? "border-zinc-300 bg-zinc-100 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                : "border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900",
              isBriefSource && "ring-2 ring-zinc-400",
            )}
            title="Open a deeper read of this answer"
          >
            <>
              <BookOpen className="h-3 w-3" />
              Read deeper
            </>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => openGrounding(msg)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50",
              showGroundingPane
                ? "border-sky-700 bg-sky-700 text-white"
                : "border-sky-800/70 bg-sky-50 text-sky-950 hover:bg-sky-100 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-100",
            )}
            title="Open shared memory seeded from this answer"
          >
            <PanelRight className="h-3 w-3" />
            {canvas ? "Open shared memory" : "Shared memory"}
          </button>
        </div>

        {askNext.length > 0 ? (
          <AskNextMenu
            hooks={askNext.slice(0, 6)}
            userJob={msg.intent?.userJob}
            busy={busy}
            onPick={(hook) => onHookClick(msg, hook)}
          />
        ) : null}

      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-dvh overflow-hidden text-zinc-900 dark:text-zinc-50",
        editingGrounding
          ? "bg-sky-50/50 dark:bg-zinc-950"
          : "bg-zinc-50 dark:bg-zinc-950",
      )}
    >
      <ChatSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((o) => !o)}
        chats={chats}
        activeId={activeChatId}
        onNewChat={startNewChat}
        onSelect={selectChat}
        onDelete={deleteChat}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header
        className={cn(
          "shrink-0 border-b backdrop-blur",
          editingGrounding
            ? "border-sky-300 bg-sky-50/95 dark:border-sky-900 dark:bg-sky-950/50"
            : "border-zinc-200 bg-white/80 dark:border-zinc-800 dark:bg-zinc-950/80",
        )}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {!sidebarOpen ? (
              <ChatSidebarToggle onClick={() => setSidebarOpen(true)} />
            ) : null}
            <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-zinc-500" />
              <h1 className="truncate text-sm font-semibold tracking-tight">
                Unweaver chunked streaming variant
              </h1>
              {editingGrounding ? (
                <Badge className="border-sky-400 bg-sky-700 text-white dark:border-sky-600 dark:bg-sky-600">
                  editing shared memory
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {editingGrounding
                ? "Composer targets Shared memory — turn off Edit with chat to consult again."
                : "Consult for short answers. Ask next to steer. Read deeper for variations. Shared memory is ground truth."}
            </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge
              className="hidden sm:inline-flex"
              title="Read-deeper precompute at click: ready (cached in time) / waited (still computing) / early (before dwell precompute started)"
            >
              deep {computeStats.ready}✓ · {computeStats.waited}⏳ ·{" "}
              {computeStats.early}✗
            </Badge>
            {modelHint ? (
              <Badge className="hidden sm:inline-flex">{modelHint}</Badge>
            ) : null}
            {canvas && sideKind !== "grounding" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openGrounding()}
                title="Reopen the shared memory document"
              >
                <PanelRight className="h-3.5 w-3.5" />
                Shared memory
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={startNewChat}
              title="Start a new chat (current one stays in history)"
            >
              New chat
            </Button>
          </div>
        </div>
      </header>

      <main
        className={cn(
          "mx-auto grid w-full max-w-7xl min-h-0 flex-1 gap-0 overflow-hidden",
          columnCount === 3
            ? "grid-rows-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-1 lg:grid-cols-3"
            : columnCount === 2
              ? "grid-rows-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-1 lg:grid-cols-2"
              : "grid-cols-1",
        )}
      >
        {showBriefPane && (activeBrief || streamingOpen) ? (
          <section className="flex min-h-0 flex-col overflow-hidden border-b border-zinc-200 bg-white lg:border-b-0 lg:border-r dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 truncate text-sm font-semibold">
                  <span className="truncate">
                    Depth ·{" "}
                    {streamingOpen && streamingBrief
                      ? streamingBrief.title
                      : activeBrief?.brief.title}
                  </span>
                  {streamingOpen && streamingBrief ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      forming
                    </span>
                  ) : null}
                </h2>
                <p className="text-xs text-zinc-500">
                  Deep read left of consult — Summary / Full append into Shared memory
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={closeElaborate}
                title="Close elaborate"
              >
                <X className="h-4 w-4" />
                <span className="ml-1 hidden sm:inline">Close</span>
              </Button>
            </div>
            <ScrollArea className="min-h-0 flex-1 px-4 py-4">
              {streamingOpen && streamingBrief ? (
                <div className="space-y-4">
                  {streamingBrief.markdown ? (
                    <div>
                      <SimpleMarkdown text={streamingBrief.markdown} />
                      <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse rounded-sm bg-zinc-400 align-middle dark:bg-zinc-500" />
                    </div>
                  ) : (
                    <p className="flex items-center gap-1.5 text-xs text-zinc-500">
                      <Loader2 className="h-3 w-3 animate-spin" /> Forming the
                      deep read…
                    </p>
                  )}
                </div>
              ) : activeBrief ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-1.5 rounded-xl border border-sky-200 bg-sky-50/80 p-2 dark:border-sky-900 dark:bg-sky-950/30">
                    <p className="w-full text-[11px] font-medium text-sky-950 dark:text-sky-100">
                      Add to Shared memory
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => promoteBrief("summary")}
                      className="border-sky-300 bg-white text-sky-950 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100"
                      title="Append a short summary excerpt from this elaborate"
                    >
                      Summary
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => promoteBrief("full")}
                      className="border-sky-300 bg-white text-sky-950 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100"
                      title="Append the entire elaborate reply into Shared memory"
                    >
                      Full
                    </Button>
                  </div>
                  <PointableAnswer
                    disabled={busy}
                    described={describedPhrases}
                    onAsk={(q) => void askAboutIntoNotes(q)}
                    onOpenNote={openAskNote}
                  >
                    <SimpleMarkdown text={activeBrief.brief.markdown} />
                  </PointableAnswer>
                </div>
              ) : null}
            </ScrollArea>
          </section>
        ) : null}
        <section
          className={cn(
            "flex min-h-0 flex-col overflow-hidden",
            showGroundingPane &&
              "border-b border-zinc-200 lg:border-b-0 lg:border-r dark:border-zinc-800",
          )}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">
                {consultView === "contents" ? "Contents" : "Consult"}
              </h2>
              <p className="text-xs text-zinc-500">
                {consultView === "contents"
                  ? "Topics across this thread — one line can span several turns"
                  : "Short answers on the spine · Ask next · Read deeper"}
              </p>
            </div>
            <div className="inline-flex shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-900">
              <button
                type="button"
                onClick={() => setConsultView("chat")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition",
                  consultView === "chat"
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
                )}
              >
                <MessageCircle className="h-3 w-3" />
                Chat
              </button>
              <button
                type="button"
                onClick={() => setConsultView("contents")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition",
                  consultView === "contents"
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
                )}
                title="Table of contents for this consult thread"
              >
                <List className="h-3 w-3" />
                Contents
              </button>
            </div>
          </div>
          <ScrollArea className="min-h-0 flex-1 px-4 py-4">
            {consultView === "contents" ? (
              <div className={cn("mx-auto", chatMaxWidth)}>
                <ContentsIndex
                  heading="Thread contents"
                  entries={chatContents}
                  emptyMessage="No consult turns yet. Ask something to build the index."
                  onSelect={(entry) => {
                    if (entry.messageId) jumpToPathMessage(entry.messageId);
                  }}
                />
              </div>
            ) : messages.length === 0 ? (
              <div
                className={cn("mx-auto flex flex-col gap-4 pt-10", chatMaxWidth)}
              >
                <div>
                  <h2 className="text-base font-semibold">
                    Ask something operational
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Short answers stay on this spine — chips ask follow-ups.
                    Ask next steers consult. Read deeper opens variations. Shared memory is a living journal
                    that grows as you talk — agreements, clashes, and corrections.
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
              <div className={cn("mx-auto flex flex-col gap-4", chatMaxWidth)}>
                {messages.map((msg) => {
                  const isBriefSource =
                    showBriefPane && openBrief?.messageId === msg.id;
                  const groundingTurn = isGroundingMsg(msg);

                  return (
                    <div
                      key={msg.id}
                      data-message-id={msg.id}
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
                        {msg.role === "assistant" && !groundingTurn ? (
                          <PointableAnswer
                            text={msg.content}
                            disabled={busy}
                            described={describedPhrases}
                            onAsk={(q) => void askAboutIntoNotes(q)}
                            onOpenNote={openAskNote}
                          />
                        ) : (
                          msg.content
                        )}
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
                    Your next message extends the Shared memory journal — not a consult answer
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
                    Shared memory open · reading
                  </p>
                  <p className="truncate text-[11px] text-sky-800/80 dark:text-sky-200/80">
                    Chat still consults — arm Edit with chat to extend the journal
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
                    ? "Edit shared memory — e.g. lock this as a Decision…"
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

        {showGroundingPane && canvas ? (
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
                  {editingGrounding ? "Shared memory · chat editing" : "Shared memory"}
                </h2>
                <p className="text-xs text-zinc-500">
                  {editingGrounding
                    ? "Composer is locked onto this doc until you disarm"
                    : memoryView === "contents"
                      ? "Topics across the journal — related entries share one line"
                      : groundingStatus
                        ? `${groundingStatus.entries} ${groundingStatus.entries === 1 ? "entry" : "entries"} · journal grows as you talk`
                        : "Open journal — edit here; arm chat to extend the trail"}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                <div className="mr-1 inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-900">
                  <button
                    type="button"
                    onClick={() => setMemoryView("journal")}
                    className={cn(
                      "rounded-md px-2 py-1 text-[11px] font-medium transition",
                      memoryView === "journal"
                        ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                        : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
                    )}
                  >
                    Journal
                  </button>
                  <button
                    type="button"
                    onClick={() => setMemoryView("contents")}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition",
                      memoryView === "contents"
                        ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                        : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
                    )}
                    title="Table of contents for this journal"
                  >
                    <List className="h-3 w-3" />
                    Contents
                  </button>
                </div>
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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={hideGrounding}
                  title="Hide shared memory"
                >
                  <X className="h-4 w-4" />
                  <span className="ml-1 hidden sm:inline">Close</span>
                </Button>
              </div>
            </div>
            <ScrollArea className="min-h-0 flex-1 px-4 py-4">
              {memoryView === "contents" ? (
                <ContentsIndex
                  heading="Journal contents"
                  entries={journalIndex}
                  emptyMessage="Not enough journal text yet. Keep talking in Shared memory, then open Contents again."
                  onSelect={(entry) => {
                    if (!entry.findText) return;
                    setMemoryView("journal");
                    setConceptFocus((prev) => ({
                      phrase: entry.findText!,
                      nonce: (prev?.nonce ?? 0) + 1,
                    }));
                  }}
                />
              ) : (
                <CanvasEditor
                  key={canvasEpoch}
                  doc={canvas}
                  disabled={busy}
                  onChange={setCanvas}
                  onAsk={(q) => void askAboutIntoNotes(q)}
                  focusPhrase={conceptFocus?.phrase}
                  focusNonce={conceptFocus?.nonce}
                />
              )}
            </ScrollArea>
          </section>
        ) : null}
      </main>
      </div>
    </div>
  );
}
