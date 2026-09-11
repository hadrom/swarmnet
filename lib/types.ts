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

export type Sediment = {
  claim: string;
  tensions: string[];
  evidence: string[];
  openQuestions: string[];
};

export type SedimentDelta = {
  strengthened: string[];
  weakened: string[];
  newTension: string[];
  stillOpen: string[];
};

export type ResearchResponse = {
  reply: string;
  sediment: Sediment;
  delta: SedimentDelta;
  hooks: Hook[];
};

export type CompactResponse = {
  sediment: Sediment;
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
  /** True once this answer was promoted into sediment. */
  promoted?: boolean;
};

export const FULL_BRIEF_KEY = "full";

export const RESEARCH_MOVES: Hook[] = [
  { id: "weak-spots", label: "Weak spots" },
  { id: "assumptions", label: "Key assumptions" },
  { id: "counter-evidence", label: "Counter-evidence" },
  { id: "decision-criteria", label: "Decision criteria" },
];

export function emptySediment(): Sediment {
  return {
    claim: "",
    tensions: [],
    evidence: [],
    openQuestions: [],
  };
}

export function emptyDelta(): SedimentDelta {
  return {
    strengthened: [],
    weakened: [],
    newTension: [],
    stillOpen: [],
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

export function seedSedimentFromAnswer(
  answer: string,
  brief?: SavedBrief | null,
): Sediment {
  const bottom = sectionFromBrief(brief?.markdown, "Bottom line");
  const unknowns = sectionFromBrief(brief?.markdown, "Unknowns");
  const openQuestions = unknowns
    .split("\n")
    .map((line) => line.replace(/^[-*•]\s+/, "").trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !/^none material/i.test(line) &&
        !/^none from/i.test(line),
    )
    .slice(0, 5);

  const claim = (bottom || answer).replace(/\s+/g, " ").trim();

  return {
    claim: claim.slice(0, 600),
    tensions: [
      "Provisional claim — still needs scrutiny before treating as decided",
    ],
    evidence: brief
      ? [`Seeded from brief “${brief.title}” on the consult answer`]
      : [`Seeded from compressed consult answer`],
    openQuestions:
      openQuestions.length > 0
        ? openQuestions
        : ["What would change this recommendation?"],
  };
}
