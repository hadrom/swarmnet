import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import {
  CANVAS_SYSTEM,
  COMPACT_SYSTEM,
  CONSULT_BRIEF_SYSTEM,
  CONSULT_LITE_SYSTEM,
  RESEARCH_SYSTEM,
} from "@/lib/prompts";
import {
  mockBrief,
  mockCanvasEdit,
  mockCompact,
  mockDiscuss,
  mockLite,
} from "@/lib/mock";
import type {
  BriefResponse,
  CanvasDoc,
  CanvasEditResponse,
  CanvasOp,
  CompactResponse,
  DiscussResponse,
  LiteResponse,
  WorkingNotes,
} from "@/lib/types";
import { applyCanvasOps, emptyNotes } from "@/lib/types";

const LITE_MODEL = "gemini-3.5-flash-lite";
const DEPTH_MODEL = "gemini-3.8-flash";
const DEPTH_FALLBACK_MODEL = "gemini-3.5-flash";
const FALLBACK_MODEL = "gemma-4-31b-it";

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Model did not return JSON");
  }
  return JSON.parse(raw.slice(start, end + 1));
}

function responseText(response: {
  text?: string;
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
  }>;
}): string {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const visible = parts
    .filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("");
  if (visible) return visible;
  if (response.text) return response.text;
  return parts.map((p) => p.text ?? "").join("");
}

function isTransient(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /429|500|503|RESOURCE_EXHAUSTED|UNAVAILABLE|INTERNAL|quota|rate.?limit|high demand|did not return JSON|Empty model response/i.test(
    msg,
  );
}

function asStringList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
}

function normalizeHooks(raw: unknown, limit?: number) {
  if (!Array.isArray(raw)) return [];
  const hooks = raw.map((h, i) => {
    const obj = (h ?? {}) as Record<string, unknown>;
    const why = obj.why != null ? String(obj.why).trim() : "";
    return {
      id: String(obj.id ?? `hook-${i}`),
      label: String(obj.label ?? obj.id ?? `Option ${i + 1}`),
      ...(why ? { why } : {}),
    };
  });
  return typeof limit === "number" ? hooks.slice(0, limit) : hooks;
}

const INTENT_PRIMARIES = new Set([
  "decide_now",
  "unblock",
  "assess_risk",
  "persuade",
  "plan",
  "diagnose",
] as const);

function normalizeIntent(raw: unknown): LiteResponse["intent"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const primaryRaw = String(obj.primary ?? "");
  const primary = INTENT_PRIMARIES.has(primaryRaw as never)
    ? (primaryRaw as NonNullable<LiteResponse["intent"]>["primary"])
    : undefined;
  const userJob = String(obj.userJob ?? obj.user_job ?? "").trim();
  if (!primary && !userJob) return undefined;
  const secondary = asStringList(obj.secondary).slice(0, 2);
  return {
    primary: primary ?? "plan",
    ...(secondary.length ? { secondary } : {}),
    userJob: userJob || "Move the decision forward",
  };
}


function normalizeLite(raw: Record<string, unknown>): LiteResponse {
  const confidence =
    raw.confidence === "high" ||
    raw.confidence === "medium" ||
    raw.confidence === "low"
      ? raw.confidence
      : "medium";
  const answer = String(raw.answer ?? "");
  return {
    answer,
    confidence,
    intent: normalizeIntent(raw.intent),
    hooks: normalizeHooks(raw.hooks, 3),
    angles: normalizeHooks(raw.angles, 4),
  };
}

function normalizeNotes(raw: unknown): WorkingNotes {
  const s = (raw ?? {}) as Record<string, unknown>;
  return {
    topic: String(s.topic ?? ""),
    whereWeAre: String(s.whereWeAre ?? s.where_we_are ?? ""),
    agreed: asStringList(s.agreed),
    stillOpen: asStringList(s.stillOpen ?? s.still_open),
    trail: asStringList(s.trail),
  };
}

async function generateJson<T>(
  model: string,
  system: string,
  user: string,
  opts: {
    thinking?: ThinkingLevel;
    maxOutputTokens?: number;
    allowFallback?: boolean;
    fallbackModels?: string[];
  } = {},
): Promise<{ data: T; modelUsed: string }> {
  const client = getClient();
  if (!client) throw new Error("NO_API_KEY");

  const tryModel = async (modelId: string) => {
    const isGemma = modelId.startsWith("gemma-");
    const isLite = modelId.includes("flash-lite");
    const thinking = isLite
      ? ThinkingLevel.MINIMAL
      : isGemma
        ? ThinkingLevel.MINIMAL
        : opts.thinking;
    const response = await client.models.generateContent({
      model: modelId,
      contents: isGemma
        ? `${system}\n\n---\n\n${user}\n\nRespond with JSON only. No preamble.`
        : user,
      config: {
        ...(isGemma ? {} : { systemInstruction: system }),
        temperature: 0.4,
        maxOutputTokens: isGemma
          ? Math.max(opts.maxOutputTokens ?? 1024, 2048)
          : (opts.maxOutputTokens ?? 1024),
        ...(isGemma
          ? {
              thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
            }
          : {
              responseMimeType: "application/json" as const,
              ...(thinking
                ? { thinkingConfig: { thinkingLevel: thinking } }
                : {}),
            }),
      },
    });
    const text = responseText(response);
    if (!text) throw new Error("Empty model response");
    return extractJson(text) as T;
  };

  try {
    const data = await tryModel(model);
    return { data, modelUsed: model };
  } catch (err) {
    if (opts.allowFallback === false) throw err;
    const chain = (opts.fallbackModels ?? [FALLBACK_MODEL]).filter(
      (m) => m !== model,
    );
    if (!isTransient(err) || chain.length === 0) throw err;

    let lastErr: unknown = err;
    for (const alt of chain) {
      try {
        console.warn(`primary ${model} failed; trying ${alt}`);
        const data = await tryModel(alt);
        return { data, modelUsed: alt };
      } catch (fallbackErr) {
        console.error(`fallback ${alt} failed:`, fallbackErr);
        lastErr = fallbackErr;
      }
    }
    throw lastErr;
  }
}

export async function generateLite(input: {
  question: string;
  history: { role: string; content: string }[];
}): Promise<LiteResponse & { modelUsed: string; mocked: boolean }> {
  const historyBlock = input.history
    .slice(-6)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");
  const user = `Conversation so far:\n${historyBlock || "(none)"}\n\nUser question:\n${input.question}\n\nAfter writing the short answer, infer their likely next intent from the question + your answer, then return exactly 3 ranked Ask-next hooks (most → least likely click).`;

  try {
    const { data, modelUsed } = await generateJson<Record<string, unknown>>(
      LITE_MODEL,
      CONSULT_LITE_SYSTEM,
      user,
      { thinking: ThinkingLevel.MINIMAL, maxOutputTokens: 550 },
    );
    return { ...normalizeLite(data), modelUsed, mocked: false };
  } catch (err) {
    console.error("lite failed, using mock:", err);
    return { ...mockLite(input.question), modelUsed: "mock", mocked: true };
  }
}

export async function generateBrief(input: {
  question: string;
  liteAnswer: string;
  hookLabel?: string;
  history?: { role: string; content: string }[];
}): Promise<BriefResponse & { modelUsed: string; mocked: boolean }> {
  const historyBlock = (input.history ?? [])
    .slice(-12)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");
  const user = `Conversation so far (established context — treat earlier turns as given):\n${historyBlock || "(none)"}\n\nTrigger question for this brief:\n${input.question}\n\nLite answer being expanded:\n${input.liteAnswer}\n\nVariation focus (reweight the same deep read; blank = main):\n${input.hookLabel ?? "(main deep read)"}`;

  try {
    const { data, modelUsed } = await generateJson<{ markdown?: string }>(
      DEPTH_MODEL,
      CONSULT_BRIEF_SYSTEM,
      user,
      {
        thinking: ThinkingLevel.HIGH,
        maxOutputTokens: 1200,
        allowFallback: true,
        fallbackModels: [DEPTH_FALLBACK_MODEL, LITE_MODEL, FALLBACK_MODEL],
      },
    );
    const markdown = String(data.markdown ?? "").trim();
    if (!markdown) throw new Error("Empty model response");
    return { markdown, modelUsed, mocked: false };
  } catch (err) {
    console.error("brief failed, using mock:", err);
    return {
      ...mockBrief(input.question, input.hookLabel, input.history),
      modelUsed: "mock",
      mocked: true,
    };
  }
}

export async function reviseNotes(input: {
  message: string;
  notes: WorkingNotes;
  history: { role: string; content: string }[];
}): Promise<DiscussResponse & { modelUsed: string; mocked: boolean }> {
  const historyBlock = input.history
    .slice(-8)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");
  const user = `Current working notes JSON (update quietly; do not narrate them in reply):\n${JSON.stringify(input.notes)}\n\nRecent conversation:\n${historyBlock || "(none)"}\n\nUser message:\n${input.message}`;

  try {
    const { data, modelUsed } = await generateJson<Record<string, unknown>>(
      LITE_MODEL,
      RESEARCH_SYSTEM,
      user,
      { thinking: ThinkingLevel.MINIMAL, maxOutputTokens: 900 },
    );
    return {
      reply: String(data.reply ?? ""),
      notes: normalizeNotes(data.notes),
      hooks: normalizeHooks(data.hooks),
      modelUsed,
      mocked: false,
    };
  } catch (err) {
    console.error("discuss failed, using mock:", err);
    return {
      ...mockDiscuss(input.message, input.notes),
      modelUsed: "mock",
      mocked: true,
    };
  }
}

export async function compactNotes(input: {
  notes: WorkingNotes;
}): Promise<CompactResponse & { modelUsed: string; mocked: boolean }> {
  const user = `Working notes to tighten:\n${JSON.stringify(input.notes)}`;
  try {
    const { data, modelUsed } = await generateJson<Record<string, unknown>>(
      DEPTH_MODEL,
      COMPACT_SYSTEM,
      user,
      {
        thinking: ThinkingLevel.HIGH,
        maxOutputTokens: 900,
        allowFallback: true,
        fallbackModels: [DEPTH_FALLBACK_MODEL, LITE_MODEL, FALLBACK_MODEL],
      },
    );
    return {
      notes: normalizeNotes(data.notes),
      note: String(data.note ?? "Tightened."),
      modelUsed,
      mocked: false,
    };
  } catch (err) {
    console.error("compact failed, using mock:", err);
    return {
      ...mockCompact(input.notes ?? emptyNotes()),
      modelUsed: "mock",
      mocked: true,
    };
  }
}

/** @deprecated Prefer reviseNotes */
export const reviseSediment = async (input: {
  move: string;
  sediment: WorkingNotes;
  history: { role: string; content: string }[];
}) => {
  const result = await reviseNotes({
    message: input.move,
    notes: input.sediment,
    history: input.history,
  });
  return {
    ...result,
    sediment: result.notes,
    delta: {
      strengthened: [],
      weakened: [],
      newTension: [],
      stillOpen: result.notes.stillOpen.slice(0, 2),
    },
  };
};

/** @deprecated Prefer compactNotes */
export const compactSediment = async (input: { sediment: WorkingNotes }) => {
  const result = await compactNotes({ notes: input.sediment });
  return { ...result, sediment: result.notes };
};


function normalizeCanvasOps(raw: unknown): CanvasOp[] {
  if (!Array.isArray(raw)) return [];
  const ops: CanvasOp[] = [];
  for (const item of raw) {
    const o = (item ?? {}) as Record<string, unknown>;
    const op = String(o.op ?? "");
    if (op === "setTitle") {
      ops.push({ op: "setTitle", title: String(o.title ?? "") });
    } else if (op === "setBodyHtml") {
      ops.push({ op: "setBodyHtml", html: String(o.html ?? "") });
    } else if (op === "setBodyText") {
      ops.push({ op: "setBodyText", text: String(o.text ?? "") });
    } else if (op === "appendHtml") {
      ops.push({ op: "appendHtml", html: String(o.html ?? "") });
    } else if (op === "replaceText") {
      ops.push({
        op: "replaceText",
        find: String(o.find ?? ""),
        replace: String(o.replace ?? ""),
      });
    }
  }
  return ops;
}

export async function generateCanvasEdit(input: {
  message: string;
  doc: CanvasDoc;
  history: { role: string; content: string }[];
}): Promise<CanvasEditResponse & { modelUsed: string; mocked: boolean; doc: CanvasDoc }> {
  const historyBlock = input.history
    .slice(-8)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");
  const user = `Current canvas JSON:\n${JSON.stringify({
    title: input.doc.title,
    bodyText: input.doc.bodyText,
    bodyHtml: input.doc.bodyHtml,
  })}\n\nRecent consult conversation:\n${historyBlock || "(none)"}\n\nUser request:\n${input.message}`;

  try {
    const { data, modelUsed } = await generateJson<Record<string, unknown>>(
      LITE_MODEL,
      CANVAS_SYSTEM,
      user,
      { thinking: ThinkingLevel.MINIMAL, maxOutputTokens: 1200 },
    );
    let ops = normalizeCanvasOps(data.ops);
    let reply = String(data.reply ?? "Updated the canvas.");
    // Model sometimes narrates an edit but returns no ops — fall back to mock patch.
    if (ops.length === 0) {
      const mocked = mockCanvasEdit(input.message, input.doc);
      ops = mocked.ops;
      if (!String(data.reply ?? "").trim()) reply = mocked.reply;
    }
    const next = applyCanvasOps(input.doc, ops);
    return {
      reply,
      ops,
      doc: next,
      modelUsed,
      mocked: false,
    };
  } catch (err) {
    console.error("canvas edit failed, using mock:", err);
    const mocked = mockCanvasEdit(input.message, input.doc);
    return {
      ...mocked,
      doc: applyCanvasOps(input.doc, mocked.ops),
      modelUsed: "mock",
      mocked: true,
    };
  }
}

