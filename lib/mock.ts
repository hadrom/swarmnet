import type {
  BriefResponse,
  CanvasDoc,
  CanvasEditResponse,
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
      { id: "owner", label: "Who owns the next call?" },
      { id: "rollback", label: "What's the rollback trigger?" },
      { id: "notify", label: "Do we notify customers yet?" },
    ],
    angles: [
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

export function mockCanvasEdit(
  message: string,
  doc: CanvasDoc,
): CanvasEditResponse {
  const topic = message.replace(/\s+/g, " ").trim().slice(0, 72);
  const empty = !doc.bodyText.trim();
  if (empty || /draft|write|start|create|canvas/i.test(message)) {
    const title =
      doc.title === "Untitled canvas" || doc.title === "Working note"
        ? topic || "Working note"
        : doc.title;
    const html = `<h2>Bottom line</h2><p>${topic || "Scoped decision note."}</p><h2>Decisions</h2><ul><li><em>Nothing locked yet.</em></li></ul><h2>Open questions</h2><ul><li>What should we lock before acting?</li></ul><h2>Notes</h2><ul><li>Seeded from consult.</li><li>Edit freely or ask for changes.</li></ul>`;
    return {
      reply: `Drafted a working canvas${title ? ` titled “${title}”` : ""}. Lock decisions or tell me what to change.`,
      ops: [
        { op: "setTitle", title },
        { op: "setBodyHtml", html },
      ],
    };
  }
  if (/settled|decided|lock|agree/i.test(message)) {
    return {
      reply: `Logged that under Decisions and cleared the placeholder. Say if an open question should come off the list.`,
      ops: [
        {
          op: "replaceText",
          find: "Nothing locked yet.",
          replace: topic || "Decision captured from chat.",
        },
      ],
    };
  }
  if (/title|rename|call it/i.test(message)) {
    const title = topic.replace(/^(please\s+)?(set\s+)?(the\s+)?title\s*(to|:)?\s*/i, "").slice(0, 80) || "Working note";
    return {
      reply: `Renamed the canvas to “${title}”.`,
      ops: [{ op: "setTitle", title }],
    };
  }
  return {
    reply: `Appended a note from your latest ask. Say if you want a tighter rewrite of a section.`,
    ops: [
      {
        op: "appendHtml",
        html: `<h3>Update</h3><p>${topic}</p>`,
      },
    ],
  };
}

