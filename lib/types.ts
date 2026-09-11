export type Mode = "consult" | "research";

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
};

export const FULL_BRIEF_KEY = "full";

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
