import type { CanvasDoc, ThreadMessage } from "@/lib/types";

export const CHATS_STORAGE_KEY = "two-lane-chats-v1";
export const LEGACY_SESSION_KEY = "two-lane-session-v9";

export type SideKind = "grounding";

export type ChatSnapshot = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ThreadMessage[];
  sideKind: SideKind | null;
  canvas: CanvasDoc | null;
  groundingEditing: boolean;
};

export type ChatHistoryStore = {
  activeId: string;
  chats: ChatSnapshot[];
};

export function newChatId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function titleFromMessages(messages: ThreadMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  const raw = firstUser?.content?.replace(/\s+/g, " ").trim() ?? "";
  if (!raw) return "New chat";
  if (raw.length <= 48) return raw;
  return `${raw.slice(0, 45).trimEnd()}…`;
}

export function emptyChat(id = newChatId()): ChatSnapshot {
  const now = Date.now();
  return {
    id,
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    messages: [],
    sideKind: null,
    canvas: null,
    groundingEditing: false,
  };
}

export function snapshotFromState(input: {
  id: string;
  createdAt?: number;
  prevTitle?: string;
  messages: ThreadMessage[];
  sideKind: SideKind | null;
  canvas: CanvasDoc | null;
  groundingEditing: boolean;
}): ChatSnapshot {
  const title = titleFromMessages(input.messages);
  return {
    id: input.id,
    title: title === "New chat" && input.prevTitle ? input.prevTitle : title,
    createdAt: input.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    messages: input.messages,
    sideKind: input.sideKind === "grounding" ? "grounding" : null,
    canvas: input.canvas,
    groundingEditing: Boolean(input.groundingEditing),
  };
}

/** Keep non-empty chats; upsert active when it has messages. */
export function upsertChat(
  chats: ChatSnapshot[],
  snap: ChatSnapshot,
): ChatSnapshot[] {
  const without = chats.filter((c) => c.id !== snap.id);
  if (snap.messages.length === 0) {
    return without.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  return [snap, ...without].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadChatHistory(): ChatHistoryStore | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CHATS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatHistoryStore;
    if (!parsed || !Array.isArray(parsed.chats) || typeof parsed.activeId !== "string") {
      return null;
    }
    const chats = parsed.chats
      .filter(
        (c) =>
          c &&
          typeof c.id === "string" &&
          Array.isArray(c.messages) &&
          c.messages.length > 0,
      )
      .map((c) => ({
        ...c,
        title: c.title || titleFromMessages(c.messages),
        sideKind:
          c.sideKind === "grounding" ||
          (c as { sideKind?: string | null }).sideKind === "canvas"
            ? ("grounding" as const)
            : null,
        canvas: c.canvas ?? null,
        groundingEditing: Boolean(c.groundingEditing),
        createdAt: c.createdAt || c.updatedAt || Date.now(),
        updatedAt: c.updatedAt || Date.now(),
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return { activeId: parsed.activeId, chats };
  } catch {
    return null;
  }
}

export function saveChatHistory(store: ChatHistoryStore) {
  if (typeof window === "undefined") return;
  try {
    const chats = store.chats.filter((c) => c.messages.length > 0);
    localStorage.setItem(
      CHATS_STORAGE_KEY,
      JSON.stringify({ activeId: store.activeId, chats }),
    );
  } catch {
    // ignore quota / private mode
  }
}

/** One-shot migrate of the old single sessionStorage slot into chat history. */
export function migrateLegacySession(): ChatSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(LEGACY_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      messages?: ThreadMessage[];
      sideKind?: string | null;
      canvas?: CanvasDoc | null;
      groundingEditing?: boolean;
      canvasEditing?: boolean;
    };
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
    if (!Array.isArray(parsed.messages) || parsed.messages.length === 0) {
      return null;
    }
    const side: SideKind | null =
      parsed.sideKind === "grounding" || parsed.sideKind === "canvas"
        ? "grounding"
        : null;
    const now = Date.now();
    return {
      id: newChatId(),
      title: titleFromMessages(parsed.messages),
      createdAt: now,
      updatedAt: now,
      messages: parsed.messages,
      sideKind: side,
      canvas: parsed.canvas ?? null,
      groundingEditing: Boolean(
        parsed.groundingEditing ?? parsed.canvasEditing,
      ),
    };
  } catch {
    try {
      sessionStorage.removeItem(LEGACY_SESSION_KEY);
    } catch {
      // ignore
    }
    return null;
  }
}

export function formatChatTime(ts: number): string {
  const diff = Date.now() - ts;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "Just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
