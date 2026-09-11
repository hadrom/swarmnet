export type Hook = {
  id: string;
  label: string;
};

export type LiteResponse = {
  answer: string;
  confidence: "high" | "medium" | "low";
  hooks: Hook[];
};

export type BriefResponse = {
  markdown: string;
};

/**
 * Living side memo for Discuss mode: shared understanding + audit trail.
 * Not a peer-review / debate scorecard.
 */
export type WorkingNotes = {
  /** Short label for the rabbit hole. */
  topic: string;
  /** Plain-language snapshot of where things stand right now. */
  whereWeAre: string;
  /** Points both sides have treated as settled in this thread. */
  agreed: string[];
  /** Unresolved items still worth chasing. */
  stillOpen: string[];
  /** Chronological audit trail (oldest → newest), one short line per turn. */
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
  hooks?: Hook[];
  /** Saved elaborations for this answer. Key is hook id, or "full". */
  briefs?: Record<string, SavedBrief>;
  /** True once this answer opened a Discuss notes pane. */
  promoted?: boolean;
};

export const FULL_BRIEF_KEY = "full";

/** Soft follow-up chips while discussing — same style as consult, not debate moves. */
export const DISCUSS_CHIPS: Hook[] = [
  { id: "agreed", label: "What have we agreed?" },
  { id: "open", label: "What's still open?" },
  { id: "change", label: "What would change this?" },
  { id: "next", label: "Suggested next step" },
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
        : ["Anything we should lock in before acting?"],
    trail: [
      brief
        ? `Started notes from consult + brief “${brief.title}”`
        : "Started notes from consult answer",
    ],
  };
}
