import type {
  BriefResponse,
  CompactResponse,
  DiscussResponse,
  LiteResponse,
  WorkingNotes,
} from "@/lib/types";

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
- The lite answer is treated as the starting point, not a standalone prompt
- Operators only open a brief when the short reply is not enough

## Detail
Thread context: ${contextLine}

Trigger question: ${question}

This mock brief is used when live depth models are unavailable. In production, the brief should inherit entities and constraints from earlier turns rather than treating the latest follow-up as a new topic.

## Unknowns
- None material from the conversation so far.`,
  };
}

export function mockDiscuss(
  message: string,
  notes: WorkingNotes,
): DiscussResponse {
  const hasNotes = Boolean(notes.whereWeAre || notes.topic);
  const next: WorkingNotes = hasNotes
    ? {
        topic: notes.topic || "Open discussion",
        whereWeAre: notes.whereWeAre,
        agreed: unique([
          ...notes.agreed,
          "Keep chatting until the next step is explicit",
        ]).slice(0, 6),
        stillOpen: unique([
          ...notes.stillOpen,
          "What should we lock in before acting?",
        ]).slice(0, 6),
        trail: [
          ...notes.trail,
          `Clarified follow-up: ${message.slice(0, 80)}${message.length > 80 ? "…" : ""}`,
        ].slice(-12),
      }
    : {
        topic: message.slice(0, 60) || "Open discussion",
        whereWeAre: `Provisional take on “${message.slice(0, 120)}${message.length > 120 ? "…" : ""}”.`,
        agreed: [],
        stillOpen: [
          "What should we lock in before acting?",
          "Who owns the next step?",
        ],
        trail: ["Started notes from this discussion"],
      };

  return {
    reply: hasNotes
      ? `On “${message.slice(0, 72)}${message.length > 72 ? "…" : ""}”: stay with the current working picture, name anything still fuzzy, and only commit once the next step and owner are clear.`
      : `Compressed take: treat “${message.slice(0, 72)}${message.length > 72 ? "…" : ""}” as a scoped decision. Ship the smallest reversible step, name an owner, and keep the notes open until the kill criterion is clear.`,
    notes: next,
    hooks: [
      { id: "agreed", label: "What have we agreed?" },
      { id: "open", label: "What's still open?" },
      { id: "change", label: "What would change this?" },
      { id: "next", label: "Suggested next step" },
    ],
  };
}

export function mockCompact(notes: WorkingNotes): CompactResponse {
  return {
    notes: {
      topic: notes.topic || "Open discussion",
      whereWeAre: notes.whereWeAre || "Nothing captured yet.",
      agreed: notes.agreed.slice(0, 4),
      stillOpen: notes.stillOpen.slice(0, 4),
      trail: notes.trail.slice(-8),
    },
    note: "Mock tighten: trimmed lists and kept the current understanding.",
  };
}

function unique(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}
