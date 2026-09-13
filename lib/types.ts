export type Hook = {
  id: string;
  label: string;
};

export type LiteResponse = {
  answer: string;
  confidence: "high" | "medium" | "low";
  /** Short consult follow-up questions for the spine. */
  hooks: Hook[];
  /** Noun-phrase angles for scoped elaborates inside the brief pane. */
  angles: Hook[];
};

export type BriefResponse = {
  markdown: string;
};

/**
 * Kept for /api/research + /api/compact (unused by UI after Grounding merge).
 * Not shown in the product surface.
 */
export type WorkingNotes = {
  topic: string;
  whereWeAre: string;
  agreed: string[];
  stillOpen: string[];
  trail: string[];
};

export type DiscussResponse = {
  reply: string;
  notes: WorkingNotes;
  hooks: Hook[];
};

export type CompactResponse = {
  notes: WorkingNotes;
  note: string;
};

export type ChatRole = "user" | "assistant";

/** Which lane produced this message — drives action chips. */
export type MessageKind = "consult" | "grounding" | "canvas";

/** One saved elaboration, keyed on the message under `briefs`. */
export type SavedBrief = {
  title: string;
  markdown: string;
  hookId?: string;
};

export type ThreadMessage = {
  id: string;
  role: ChatRole;
  content: string;
  /** Routing provenance. Grounding replies hide consult action chips. */
  kind?: MessageKind;
  confidence?: LiteResponse["confidence"];
  hooks?: Hook[];
  /** Brief angles — shown inside the Elaborate pane, not on the spine. */
  angles?: Hook[];
  /** Saved elaborations for this answer. Key is angle id, or "full". */
  briefs?: Record<string, SavedBrief>;
};

export const FULL_BRIEF_KEY = "full";

export function emptyNotes(): WorkingNotes {
  return {
    topic: "",
    whereWeAre: "",
    agreed: [],
    stillOpen: [],
    trail: [],
  };
}

/** Editable ground-truth document (Grounding lane). Internal name stays CanvasDoc. */
export type CanvasDoc = {
  title: string;
  /** HTML body from the contenteditable surface. */
  bodyHtml: string;
  /** Plain-text snapshot for model context. */
  bodyText: string;
  updatedAt: number;
};

export type CanvasOp =
  | { op: "setTitle"; title: string }
  | { op: "setBodyHtml"; html: string }
  | { op: "setBodyText"; text: string }
  | { op: "appendHtml"; html: string }
  | { op: "replaceText"; find: string; replace: string };

export type CanvasEditResponse = {
  reply: string;
  ops: CanvasOp[];
  doc?: Partial<Pick<CanvasDoc, "title" | "bodyHtml" | "bodyText">>;
};

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-3]>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const html = escaped
    .split(/\n\n+/)
    .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return html || "<p></p>";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Growing journal — no section skeleton; the trail expands as you talk. */
export function seedWorkingCanvas(opts?: {
  title?: string;
  seedAnswer?: string;
}): CanvasDoc {
  const seed = (opts?.seedAnswer ?? "").replace(/\s+/g, " ").trim();
  const title =
    opts?.title?.trim() ||
    seed.split(/[.!?]/)[0]?.trim().slice(0, 72) ||
    "Grounding journal";
  const opener = seed
    ? `<p><em>Journal opened from consult.</em></p><hr/><p>${escapeHtml(seed.slice(0, 600))}</p>`
    : `<p><em>Journal opened.</em> Entries accumulate here as you talk — agreements, disagreements, and corrections in the same trail.</p>`;
  return {
    title,
    bodyHtml: opener,
    bodyText: stripHtml(opener),
    updatedAt: Date.now(),
  };
}

export function emptyCanvas(seed?: {
  title?: string;
  bodyHtml?: string;
  bodyText?: string;
}): CanvasDoc {
  if (!seed?.bodyHtml && !seed?.bodyText) {
    return seedWorkingCanvas({ title: seed?.title });
  }
  const bodyText = seed?.bodyText ?? "";
  const bodyHtml =
    seed?.bodyHtml ?? (bodyText ? textToHtml(bodyText) : "<p></p>");
  return {
    title: seed?.title ?? "Grounding journal",
    bodyHtml,
    bodyText: bodyText || stripHtml(bodyHtml),
    updatedAt: Date.now(),
  };
}

/** Entry count for chrome — separators mark entries; bare prose counts as one. */
export function canvasJournalStatus(doc: CanvasDoc): { entries: number } {
  const html = doc.bodyHtml || "";
  const hrs = (html.match(/<hr\b[^>]*>/gi) || []).length;
  const prose = stripHtml(html);
  if (!prose) return { entries: 0 };
  if (hrs === 0) return { entries: 1 };
  return { entries: hrs + 1 };
}

/** @deprecated Use canvasJournalStatus — kept so old imports fail loudly in search. */
export function canvasConvergenceStatus(doc: CanvasDoc): {
  decisions: number;
  open: number;
  entries: number;
} {
  const { entries } = canvasJournalStatus(doc);
  return { decisions: 0, open: 0, entries };
}

/**
 * half = short journal entry from the first stretch of the elaborate
 * full = longer journal entry from more of the elaborate
 */
export type PromoteBriefMode = "half" | "full" | "bottom" | "unknowns";

function appendJournalEntry(bodyHtml: string, entryHtml: string): string {
  const base = (bodyHtml || "").trim();
  const chunk = `<hr/>${entryHtml}`;
  if (!base || !stripHtml(base)) return entryHtml;
  return `${base}${chunk}`;
}

function markdownToJournalParagraphs(markdown: string, maxChars: number): string {
  const plain = markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
  if (!plain) return "";
  // Split into ~sentence-sized paragraphs for the journal.
  const chunks = plain.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [plain];
  const paras: string[] = [];
  let buf = "";
  for (const chunk of chunks) {
    const next = `${buf}${chunk}`.trim();
    if (next.length > 220 && buf) {
      paras.push(`<p>${escapeHtml(buf.trim())}</p>`);
      buf = chunk;
    } else {
      buf = next;
    }
  }
  if (buf.trim()) paras.push(`<p>${escapeHtml(buf.trim())}</p>`);
  return paras.join("");
}

/** Append an Elaborate reply into the Grounding journal as a new trail entry. */
export function promoteBriefIntoCanvas(
  doc: CanvasDoc,
  brief: SavedBrief,
  mode: PromoteBriefMode,
): CanvasDoc {
  const maxChars =
    mode === "full" ? 900 : mode === "half" || mode === "bottom" ? 380 : 280;
  const body = markdownToJournalParagraphs(brief.markdown, maxChars);
  const header = `<p><strong>From elaborate · ${escapeHtml(brief.title)}</strong></p>`;
  const entry = body
    ? `${header}${body}`
    : `${header}<p>${escapeHtml(brief.markdown.slice(0, maxChars))}</p>`;
  const bodyHtml = appendJournalEntry(doc.bodyHtml, entry);
  return applyCanvasOps(doc, [{ op: "setBodyHtml", html: bodyHtml }]);
}

export function applyCanvasOps(doc: CanvasDoc, ops: CanvasOp[]): CanvasDoc {
  let next: CanvasDoc = { ...doc };
  for (const op of ops) {
    if (op.op === "setTitle") {
      next = { ...next, title: op.title.trim() || next.title };
    } else if (op.op === "setBodyHtml") {
      next = { ...next, bodyHtml: op.html, bodyText: stripHtml(op.html) };
    } else if (op.op === "setBodyText") {
      next = {
        ...next,
        bodyHtml: textToHtml(op.text),
        bodyText: op.text.trim(),
      };
    } else if (op.op === "appendHtml") {
      const bodyHtml = `${next.bodyHtml}${op.html}`;
      next = { ...next, bodyHtml, bodyText: stripHtml(bodyHtml) };
    } else if (op.op === "replaceText") {
      if (!op.find) continue;
      const bodyText = next.bodyText.split(op.find).join(op.replace);
      const safe = op.replace
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const bodyHtml = next.bodyHtml.split(op.find).join(safe);
      next = { ...next, bodyText, bodyHtml };
    }
  }
  return { ...next, updatedAt: Date.now() };
}
