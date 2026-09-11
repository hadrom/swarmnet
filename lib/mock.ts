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

export function mockBrief(question: string, hook?: string): BriefResponse {
  const focus = hook ?? "full elaborate";
  return {
    markdown: `## Bottom line
Prototype the interaction pattern before investing in model quality. Focus for this brief: **${focus}**.

## What this depends on
- Operators will accept short answers if depth is one click away
- The brief pane stays a document, not a second chat
- Latency of the lite lane stays under ~2s

## Detail
Question under review: ${question}

The consult lane should refuse to ramble. Expansion is explicit. In a cofounder demo, show that most questions never need the brief — and that when they do, the brief is structured (bottom line → dependencies → detail → unknowns).

## Unknowns
- Whether your on-prem model will obey length constraints without token caps
- How often operators actually click Elaborate in real incidents
- Whether sediment (research mode) should share history with consult`,
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
