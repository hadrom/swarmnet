import { shortTitle, clampTabTitle, titleFromExchange } from "@/lib/titles";
export type Hook = {
  id: string;
  label: string;
  /** Optional rank rationale — not shown in UI. */
  why?: string;
};

export type ConsultIntent = {
  /** Coarse job the user is trying to do next. */
  primary:
    | "decide_now"
    | "unblock"
    | "assess_risk"
    | "persuade"
    | "plan"
    | "diagnose";
  secondary?: string[];
  /** Short phrase of what they're trying to accomplish. */
  userJob: string;
};

/** In-answer phrase you can click like an Ask-next hook. */
export type AnswerHotspot = {
  id: string;
  /** Exact substring that appears in `answer` (case-insensitive match OK). */
  text: string;
  /** Consult question to send when the phrase is clicked. */
  ask: string;
};

export type LiteResponse = {
  answer: string;
  confidence: "high" | "medium" | "low";
  /** Short sidebar label for this chat — topic noun phrase. */
  tabTitle?: string;
  /** Inferred user intent used to rank Ask next. */
  intent?: ConsultIntent;
  /** Exactly 3 Ask-next chips, ranked most → least likely next click. */
  hooks: Hook[];
  /** Variations: noun-phrase emphases of the same deep read. */
  angles: Hook[];
  /** 2-4 clickable phrases inside the answer for type-free follow-ups. */
  hotspots?: AnswerHotspot[];
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
  intent?: LiteResponse["intent"];
  /** Exactly 3 Ask-next chips when present, ranked most → least likely. */
  hooks?: Hook[];
  /** Variations — noun-phrase emphases shown inside Depth, not on the spine. */
  angles?: Hook[];
  /** Clickable in-answer phrases that send a consult follow-up. */
  hotspots?: AnswerHotspot[];
  /** Saved deep reads for this answer. Key is lens id, or "full". */
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
  const title = clampTabTitle(
    opts?.title?.trim() ||
      titleFromExchange("", seed, "Grounding") ||
      "Grounding",
    "Grounding",
  );
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
 * half = short excerpt from the start of the elaborate
 * full = the entire elaborate reply (no truncation)
 */
export type PromoteBriefMode = "half" | "full" | "bottom" | "unknowns";

function appendJournalEntry(bodyHtml: string, entryHtml: string): string {
  const base = (bodyHtml || "").trim();
  const chunk = `<hr/>${entryHtml}`;
  if (!base || !stripHtml(base)) return entryHtml;
  return `${base}${chunk}`;
}

/** Soft truncate at a paragraph or sentence boundary when possible. */
function softTruncate(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const sliced = trimmed.slice(0, maxChars);
  const breakAt = Math.max(
    sliced.lastIndexOf("\n\n"),
    sliced.lastIndexOf(". "),
    sliced.lastIndexOf("! "),
    sliced.lastIndexOf("? "),
  );
  if (breakAt > maxChars * 0.4) {
    return sliced.slice(0, breakAt + 1).trim();
  }
  return sliced.trim();
}

function inlineMarkdownHtml(escaped: string): string {
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

/** Convert light elaborate markdown into journal HTML. Preserves paragraphs/lists. */
function markdownToJournalHtml(
  markdown: string,
  maxChars?: number,
): string {
  const source =
    maxChars != null ? softTruncate(markdown, maxChars) : markdown.trim();
  if (!source) return "";

  const blocks = source.split(/\n\n+/);
  const parts: string[] = [];

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trimEnd())
      .filter((l) => l.trim().length > 0);
    if (lines.length === 0) continue;

    const bulletish = lines.every((l) => /^[-*•]\s+/.test(l.trim()));
    if (bulletish) {
      const items = lines.map((l) => {
        const raw = l.trim().replace(/^[-*•]\s+/, "");
        return `<li>${inlineMarkdownHtml(escapeHtml(raw))}</li>`;
      });
      parts.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    const heading = lines[0].match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 3); // h2–h4 feel right in journal
      const tag = `h${level}` as const;
      parts.push(
        `<${tag}>${inlineMarkdownHtml(escapeHtml(heading[2].trim()))}</${tag}>`,
      );
      const rest = lines
        .slice(1)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (rest) {
        parts.push(`<p>${inlineMarkdownHtml(escapeHtml(rest))}</p>`);
      }
      continue;
    }

    const plain = lines.join(" ").replace(/\s+/g, " ").trim();
    if (plain) {
      parts.push(`<p>${inlineMarkdownHtml(escapeHtml(plain))}</p>`);
    }
  }

  return parts.join("");
}

/** Append an Elaborate reply into the Grounding journal as a new trail entry. */
export function promoteBriefIntoCanvas(
  doc: CanvasDoc,
  brief: SavedBrief,
  mode: PromoteBriefMode,
): CanvasDoc {
  // Full keeps the entire elaborate. Half is a short lead-in excerpt.
  const maxChars =
    mode === "full" ? undefined : mode === "half" || mode === "bottom" ? 420 : 280;
  const body = markdownToJournalHtml(brief.markdown, maxChars);
  const header = `<p><strong>From elaborate · ${escapeHtml(brief.title)}</strong></p>`;
  const entry = body
    ? `${header}${body}`
    : `${header}<p>${escapeHtml(
        maxChars != null
          ? softTruncate(brief.markdown, maxChars)
          : brief.markdown.trim(),
      )}</p>`;
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

const NOTES_HEADING_RE = /<h3[^>]*>\s*NOTES\s*<\/h3>/i;
const NOTE_ITEM_RE = /<p[^>]*>\s*<strong>\s*(\d+)\.\s*<\/strong>/gi;

/** How many Ask-about-this notes already sit under the NOTES heading. */
export function countAskNotes(doc: CanvasDoc): number {
  const html = doc.bodyHtml || "";
  const start = html.search(NOTES_HEADING_RE);
  if (start < 0) return 0;
  const after = html.slice(start);
  let max = 0;
  for (const m of after.matchAll(NOTE_ITEM_RE)) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

/**
 * Append an Ask-about-this Q&A under a trailing NOTES section.
 * Creates the section on first use; numbers entries 1., 2., 3., …
 */
export function appendAskNoteToCanvas(
  doc: CanvasDoc,
  question: string,
  answer: string,
): CanvasDoc {
  const q = question.replace(/\s+/g, " ").trim();
  const a = answer.replace(/\s+/g, " ").trim();
  if (!q || !a) return doc;

  const nextNum = countAskNotes(doc) + 1;
  const noteHtml =
    `<p><strong>${nextNum}.</strong> <em>${escapeHtml(q)}</em><br/>${escapeHtml(a)}</p>`;

  let bodyHtml = (doc.bodyHtml || "").trim();
  if (!NOTES_HEADING_RE.test(bodyHtml)) {
    const sep = bodyHtml && stripHtml(bodyHtml) ? "<hr/>" : "";
    bodyHtml = `${bodyHtml}${sep}<h3>NOTES</h3>${noteHtml}`;
  } else {
    bodyHtml = `${bodyHtml}${noteHtml}`;
  }

  return applyCanvasOps(doc, [{ op: "setBodyHtml", html: bodyHtml }]);
}

