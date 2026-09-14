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
    intent: {
      primary: "decide_now",
      secondary: ["plan"],
      userJob: "Pick the smallest safe next move",
    },
    hooks: [
      {
        id: "owner",
        label: "Who owns this?",
        why: "Answer left ownership open",
      },
      {
        id: "kill",
        label: "Kill criterion?",
        why: "Needs a stop condition",
      },
      {
        id: "scope",
        label: "What's in v1?",
        why: "Scope is still fuzzy",
      },
    ],
    hotspots: [
      {
        id: "hs-owner",
        text: "owner",
        ask: "Who owns this?",
      },
      {
        id: "hs-kill",
        text: "kill criterion",
        ask: "What's the kill criterion?",
      },
      {
        id: "hs-step",
        text: "reversible step",
        ask: "What's the smallest reversible step?",
      },
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
    markdown: `Building on the short consult take, here's the fuller picture with focus on **${focus}**.

The lite answer is the starting point, not a standalone prompt — earlier turns already set the topic and constraints (${contextLine.slice(0, 180)}${contextLine.length > 180 ? "…" : ""}). The trigger question was: ${question}

In practice you'd unpack why that short answer holds, what it implies for owners and timing, where the tradeoffs sit, and what to watch if conditions change. This mock elaborate is used when live depth models are unavailable; a live reply would stay in the same operational voice, just with more detail than the spine answer.`,
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
  const topic = message.replace(/\s+/g, " ").trim().slice(0, 160);
  const empty = !doc.bodyText.trim();
  if (empty || /draft|write|start|create|journal|grounding|canvas/i.test(message)) {
    const title =
      !doc.title ||
      /untitled|working note|grounding journal/i.test(doc.title)
        ? topic.slice(0, 72) || "Grounding journal"
        : doc.title;
    const html = `<p><em>Journal opened.</em></p><hr/><p>${topic || "Conversation started."}</p>`;
    return {
      reply: `Opened the grounding journal as “${title}”. Keep talking and I will extend the trail.`,
      ops: [
        { op: "setTitle", title },
        { op: "setBodyHtml", html },
      ],
    };
  }
  if (/title|rename|call it/i.test(message)) {
    const title =
      topic
        .replace(/^(please\s+)?(set\s+)?(the\s+)?title\s*(to|:)?\s*/i, "")
        .slice(0, 80) || "Grounding journal";
    return {
      reply: `Renamed the journal to “${title}”.`,
      ops: [{ op: "setTitle", title }],
    };
  }
  return {
    reply: `Appended that to the grounding journal. Disagree, correct me, or keep going.`,
    ops: [
      {
        op: "appendHtml",
        html: `<hr/><p>${topic}</p>`,
      },
    ],
  };
}

