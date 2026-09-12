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
 * Living Discuss memo — shared understanding that grows as you talk.
 * Not a peer-review / debate scorecard.
 */
export type WorkingNotes = {
  /** Short label for what you're talking about. */
  topic: string;
  /** Plain-language snapshot of where things stand right now. */
  whereWeAre: string;
  /** Things you've clearly settled together. */
  agreed: string[];
  /** Things still fuzzy or undecided. */
  stillOpen: string[];
  /** How you got here (oldest → newest), one short line per turn. */
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
  confidence?: LiteResponse["confidence"];
  /** Consult follow-ups (spine) or Discuss follow-ups (branch). */
  hooks?: Hook[];
  /** Brief angles — shown inside the Elaborate pane, not on the spine. */
  angles?: Hook[];
  /** Saved elaborations for this answer. Key is angle id, or "full". */
  briefs?: Record<string, SavedBrief>;
};

/**
 * A Discuss branch rooted on one consult answer.
 * Lives outside the consult spine — own timeline + living memo.
 */
export type DiscussThread = {
  rootAnswerId: string;
  /** Short preview of the root answer for chrome / markers. */
  rootPreview: string;
  messages: ThreadMessage[];
  notes: WorkingNotes;
  chips: Hook[];
};

export type AppMode = "consult" | "discuss";

export const FULL_BRIEF_KEY = "full";

/** Soft follow-ups while Discuss is active. */
export const DISCUSS_CHIPS: Hook[] = [
  { id: "settled", label: "What have we settled?" },
  { id: "unsure", label: "What are we still unsure about?" },
  { id: "change", label: "What would change our minds?" },
  { id: "next", label: "Sensible next step" },
];

export function emptyNotes(): WorkingNotes {
  return {
    topic: "",
    whereWeAre: "",
    agreed: [],
    stillOpen: [],
    trail: [],
  };
}

/** Pull a section body from brief markdown by heading text. */
export function sectionFromBrief(
  markdown: string | undefined,
  heading: string,
): string {
  if (!markdown) return "";
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`,
    "i",
  );
  const match = markdown.match(re);
  return (match?.[1] ?? "").trim();
}

export function seedNotesFromAnswer(
  answer: string,
  brief?: SavedBrief | null,
): WorkingNotes {
  const bottom = sectionFromBrief(brief?.markdown, "Bottom line");
  const unknowns = sectionFromBrief(brief?.markdown, "Unknowns");
  const stillOpen = unknowns
    .split("\n")
    .map((line) => line.replace(/^[-*•]\s+/, "").trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !/^none material/i.test(line) &&
        !/^none from/i.test(line),
    )
    .slice(0, 5);

  const whereWeAre = (bottom || answer).replace(/\s+/g, " ").trim().slice(0, 600);
  const topic =
    whereWeAre.split(/[.!?]/)[0]?.trim().slice(0, 80) || "Open discussion";

  return {
    topic,
    whereWeAre,
    agreed: [],
    stillOpen:
      stillOpen.length > 0
        ? stillOpen
        : ["Anything we should settle before acting?"],
    trail: [
      brief
        ? `Started Discuss from the answer + brief “${brief.title}”`
        : "Started Discuss from this answer",
    ],
  };
}

/** Editable document living beside consult (Canvas lane). */
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

export function emptyCanvas(seed?: {
  title?: string;
  bodyHtml?: string;
  bodyText?: string;
}): CanvasDoc {
  const bodyText = seed?.bodyText ?? "";
  const bodyHtml = seed?.bodyHtml ?? (bodyText ? textToHtml(bodyText) : "<p></p>");
  return {
    title: seed?.title ?? "Untitled canvas",
    bodyHtml,
    bodyText: bodyText || stripHtml(bodyHtml),
    updatedAt: Date.now(),
  };
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

