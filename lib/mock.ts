import type {
  BriefResponse,
  CompactResponse,
  LiteResponse,
  ResearchResponse,
  Sediment,
} from "@/lib/types";
import { emptyDelta } from "@/lib/types";

export function mockLite(question: string): LiteResponse {
  const short = question.slice(0, 80);
  return {
    answer: `Compressed take: treat this as a scoped decision, not a platform project. For “${short}${question.length > 80 ? "…" : ""}”, ship the smallest reversible step, name the owner, and set a kill criterion before expanding scope.`,
    confidence: "medium",
    hooks: [
      { id: "risks", label: "Failure modes" },
      { id: "deps", label: "Dependencies" },
      { id: "alt", label: "Vs alternatives" },
      { id: "metric", label: "Success metric" },
    ],
  };
}

export function mockBrief(
  question: string,
  hook?: string,
  history?: { role: string; content: string }[],
): BriefResponse {
  const focus = hook ?? "full elaborate";
  const prior = (history ?? [])
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .slice(-3);
  const contextLine =
    prior.length > 0
      ? prior.map((q, i) => `${i + 1}. ${q}`).join(" ")
      : question;
  return {
    markdown: `## Bottom line
Expand the compressed answer in light of the thread so far. Focus for this brief: **${focus}**.

## What this depends on
- Prior turns in this consult thread establish the topic and constraints
- The lite answer is treated as the starting claim, not a standalone prompt
- Operators only open a brief when the short reply is not enough

## Detail
Thread context: ${contextLine}

Trigger question: ${question}

This mock brief is used when live depth models are unavailable. In production, the brief should inherit entities and constraints from earlier turns rather than treating the latest follow-up as a new topic.

## Unknowns
- None material from the conversation so far.`,
  };
}

export function mockResearch(
  move: string,
  sediment: Sediment,
): ResearchResponse {
  const hasClaim = Boolean(sediment.claim);
  const next: Sediment = hasClaim
    ? {
        claim: sediment.claim,
        tensions: unique([
          ...sediment.tensions,
          "Chat transcripts hide the working claim",
        ]).slice(0, 5),
        evidence: unique([
          ...sediment.evidence,
          `User move applied: ${move.slice(0, 100)}`,
        ]).slice(0, 5),
        openQuestions: unique([
          ...sediment.openQuestions,
          "What counts as 'done' for a sediment session?",
        ]).slice(0, 5),
      }
    : {
        claim: `Provisional: ${move.slice(0, 180)}`,
        tensions: ["Claim is still thin — needs pressure"],
        evidence: [],
        openQuestions: [
          "What would falsify this?",
          "Who is the primary user?",
        ],
      };

  return {
    reply: hasClaim
      ? "Applied your move. Sediment updated — check the diff for what strengthened or opened."
      : "Bootstrapped a provisional claim from your first move. Attack it or add a constraint next.",
    sediment: next,
    delta: {
      ...emptyDelta(),
      strengthened: hasClaim ? [] : ["New provisional claim"],
      newTension: hasClaim ? ["Chat transcripts hide the working claim"] : [],
      stillOpen: next.openQuestions.slice(0, 2),
    },
    hooks: [
      { id: "attack", label: "Attack this" },
      { id: "contradiction", label: "Find contradiction" },
      { id: "falsify", label: "What would falsify" },
      { id: "steelman", label: "Steelman other side" },
    ],
  };
}

export function mockCompact(sediment: Sediment): CompactResponse {
  return {
    sediment: {
      claim: sediment.claim || "No claim yet.",
      tensions: sediment.tensions.slice(0, 3),
      evidence: sediment.evidence.slice(0, 3),
      openQuestions: sediment.openQuestions.slice(0, 3),
    },
    note: "Mock compact: truncated lists and kept the claim intact.",
  };
}

function unique(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}
