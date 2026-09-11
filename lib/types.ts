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

export type ThreadMessage = {
  id: string;
  role: ChatRole;
  content: string;
  confidence?: LiteResponse["confidence"];
  hooks?: Hook[];
};

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
