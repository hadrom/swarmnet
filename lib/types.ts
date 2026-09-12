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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Soft working-note skeleton — canvas is ground truth; sections guide convergence. */
export function seedWorkingCanvas(opts?: {
  title?: string;
  seedAnswer?: string;
}): CanvasDoc {
  const seed = (opts?.seedAnswer ?? "").replace(/\s+/g, " ").trim();
  const title =
    opts?.title?.trim() ||
    seed.split(/[.!?]/)[0]?.trim().slice(0, 72) ||
    "Working note";
  const bottom = seed
    ? escapeHtml(seed.slice(0, 400))
    : "What we&apos;re currently holding as true.";
  const notes = seed
    ? escapeHtml(seed)
    : "Scratch context from consult. Promote brief lines or ask chat to draft.";
  const bodyHtml = [
    "<h2>Bottom line</h2>",
    `<p>${bottom}</p>`,
    "<h2>Decisions</h2>",
    "<ul><li><em>Nothing locked yet.</em></li></ul>",
    "<h2>Open questions</h2>",
    "<ul><li><em>What still needs settling?</em></li></ul>",
    "<h2>Notes</h2>",
    `<p>${notes}</p>`,
  ].join("");
  return {
    title,
    bodyHtml,
    bodyText: stripHtml(bodyHtml),
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
  const bodyHtml = seed?.bodyHtml ?? (bodyText ? textToHtml(bodyText) : "<p></p>");
  return {
    title: seed?.title ?? "Untitled canvas",
    bodyHtml,
    bodyText: bodyText || stripHtml(bodyHtml),
    updatedAt: Date.now(),
  };
}

/** Count real bullets under Decisions / Open questions (ignore placeholder italics). */
export function canvasConvergenceStatus(doc: CanvasDoc): {
  decisions: number;
  open: number;
} {
  const countFromHtml = (heading: string) => {
    const re = new RegExp(
      `<h2[^>]*>\\s*${heading}\\s*<\\/h2>([\\s\\S]*?)(?=<h2[^>]*>|$)`,
      "i",
    );
    const match = doc.bodyHtml.match(re);
    const block = match?.[1] ?? "";
    const items = [...block.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) =>
      stripHtml(m[1] ?? "").trim(),
    );
    return items.filter(
      (l) =>
        l.length > 0 &&
        !/^nothing locked/i.test(l) &&
        !/^what still needs/i.test(l),
    ).length;
  };
  return {
    decisions: countFromHtml("Decisions"),
    open: countFromHtml("Open questions"),
  };
}

export type PromoteBriefMode = "bottom" | "unknowns" | "full";

/** Insert HTML just before the end of an <h2>Section</h2>... block. */
function injectUnderHeading(
  bodyHtml: string,
  heading: string,
  injection: string,
): string {
  const re = new RegExp(
    `(<h2[^>]*>\\s*${heading}\\s*<\\/h2>)([\\s\\S]*?)(?=<h2[^>]*>|$)`,
    "i",
  );
  if (!re.test(bodyHtml)) {
    return `${bodyHtml}<h2>${heading}</h2>${injection}`;
  }
  return bodyHtml.replace(re, (_m, h2: string, rest: string) => {
    // Drop italic placeholders when real content arrives.
    const cleaned = rest.replace(
      /<li[^>]*>\s*<em[^>]*>[\s\S]*?<\/em>\s*<\/li>/gi,
      "",
    );
    return `${h2}${cleaned}${injection}`;
  });
}

/** Fold an Elaborate brief into the canvas ledger under the right headings. */
export function promoteBriefIntoCanvas(
  doc: CanvasDoc,
  brief: SavedBrief,
  mode: PromoteBriefMode,
): CanvasDoc {
  const bottom = sectionFromBrief(brief.markdown, "Bottom line");
  const unknowns = sectionFromBrief(brief.markdown, "Unknowns");
  const depends = sectionFromBrief(brief.markdown, "What this depends on");
  const detail = sectionFromBrief(brief.markdown, "Detail");

  const bullets = (block: string) =>
    block
      .split("\n")
      .map((l) => l.replace(/^[-*•]\s*/, "").trim())
      .filter(
        (l) =>
          l.length > 0 &&
          !/^none material/i.test(l) &&
          !/^none from/i.test(l),
      );

  const li = (items: string[]) =>
    items.map((i) => `<li>${escapeHtml(i)}</li>`).join("");

  let bodyHtml = doc.bodyHtml;
  let changed = false;

  if (mode === "bottom" || mode === "full") {
    const text = (bottom || brief.markdown.slice(0, 400)).replace(/\s+/g, " ").trim();
    if (text) {
      bodyHtml = injectUnderHeading(
        bodyHtml,
        "Bottom line",
        `<p><strong>${escapeHtml(brief.title)}:</strong> ${escapeHtml(text)}</p>`,
      );
      changed = true;
    }
  }
  if (mode === "unknowns" || mode === "full") {
    const items = bullets(unknowns);
    if (items.length) {
      bodyHtml = injectUnderHeading(
        bodyHtml,
        "Open questions",
        `<ul>${li(items)}</ul>`,
      );
      changed = true;
    }
  }
  if (mode === "full") {
    const dep = bullets(depends);
    const det = bullets(detail);
    const chunks: string[] = [];
    if (dep.length) chunks.push(`<p><strong>Depends on</strong></p><ul>${li(dep)}</ul>`);
    if (det.length) chunks.push(`<p><strong>Detail</strong></p><ul>${li(det)}</ul>`);
    if (chunks.length) {
      bodyHtml = injectUnderHeading(
        bodyHtml,
        "Notes",
        `<p><em>From brief · ${escapeHtml(brief.title)}</em></p>${chunks.join("")}`,
      );
      changed = true;
    }
  }
  if (!changed) {
    bodyHtml = injectUnderHeading(
      bodyHtml,
      "Notes",
      `<p><strong>${escapeHtml(brief.title)}:</strong> ${escapeHtml(brief.markdown.slice(0, 500))}</p>`,
    );
  }
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

