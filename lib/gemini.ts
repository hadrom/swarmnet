import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import {
  COMPACT_SYSTEM,
  CONSULT_BRIEF_SYSTEM,
  CONSULT_LITE_SYSTEM,
  RESEARCH_SYSTEM,
} from "@/lib/prompts";
import {
  mockBrief,
  mockCompact,
  mockLite,
  mockResearch,
} from "@/lib/mock";
import type {
  BriefResponse,
  CompactResponse,
  LiteResponse,
  ResearchResponse,
  Sediment,
  SedimentDelta,
} from "@/lib/types";

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
  // Last resort: include non-empty parts even if marked thought
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

function normalizeHooks(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.map((h, i) => {
    const obj = (h ?? {}) as Record<string, unknown>;
    return {
      id: String(obj.id ?? `hook-${i}`),
      label: String(obj.label ?? obj.id ?? `Option ${i + 1}`),
    };
  });
}

function normalizeLite(raw: Record<string, unknown>): LiteResponse {
  const confidence =
    raw.confidence === "high" ||
    raw.confidence === "medium" ||
    raw.confidence === "low"
      ? raw.confidence
      : "medium";
  return {
    answer: String(raw.answer ?? ""),
    confidence,
    hooks: normalizeHooks(raw.hooks),
  };
}

function normalizeSediment(raw: unknown): Sediment {
  const s = (raw ?? {}) as Record<string, unknown>;
  return {
    claim: String(s.claim ?? ""),
    tensions: asStringList(s.tensions),
    evidence: asStringList(s.evidence),
    openQuestions: asStringList(s.openQuestions),
  };
}

function normalizeDelta(raw: unknown): SedimentDelta {
  const d = (raw ?? {}) as Record<string, unknown>;
  return {
    strengthened: asStringList(d.strengthened),
    weakened: asStringList(d.weakened),
    newTension: asStringList(d.newTension),
    stillOpen: asStringList(d.stillOpen),
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
              ...(opts.thinking
                ? { thinkingConfig: { thinkingLevel: opts.thinking } }
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
  const user = `Conversation so far:\n${historyBlock || "(none)"}\n\nUser question:\n${input.question}`;

  try {
    const { data, modelUsed } = await generateJson<Record<string, unknown>>(
      LITE_MODEL,
      CONSULT_LITE_SYSTEM,
      user,
      { thinking: ThinkingLevel.MINIMAL, maxOutputTokens: 400 },
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
}): Promise<BriefResponse & { modelUsed: string; mocked: boolean }> {
  const user = `Original question:\n${input.question}\n\nLite answer:\n${input.liteAnswer}\n\nFocus hook:\n${input.hookLabel ?? "(full elaborate)"}`;

  try {
    const { data, modelUsed } = await generateJson<{ markdown?: string }>(
      DEPTH_MODEL,
      CONSULT_BRIEF_SYSTEM,
      user,
      {
        thinking: ThinkingLevel.HIGH,
        maxOutputTokens: 1200,
        allowFallback: true,
        fallbackModels: [
          DEPTH_FALLBACK_MODEL,
          LITE_MODEL,
          FALLBACK_MODEL,
        ],
      },
    );
    return {
      markdown: String(data.markdown ?? ""),
      modelUsed,
      mocked: false,
    };
  } catch (err) {
    console.error("brief failed, using mock:", err);
    return {
      ...mockBrief(input.question, input.hookLabel),
      modelUsed: "mock",
      mocked: true,
    };
  }
}

export async function reviseSediment(input: {
  move: string;
  sediment: Sediment;
  history: { role: string; content: string }[];
}): Promise<ResearchResponse & { modelUsed: string; mocked: boolean }> {
  const historyBlock = input.history
    .slice(-8)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");
  const user = `Current sediment JSON:\n${JSON.stringify(input.sediment)}\n\nRecent moves:\n${historyBlock || "(none)"}\n\nUser move:\n${input.move}`;

  try {
    const { data, modelUsed } = await generateJson<Record<string, unknown>>(
      LITE_MODEL,
      RESEARCH_SYSTEM,
      user,
      { thinking: ThinkingLevel.MINIMAL, maxOutputTokens: 900 },
    );
    return {
      reply: String(data.reply ?? ""),
      sediment: normalizeSediment(data.sediment),
      delta: normalizeDelta(data.delta),
      hooks: normalizeHooks(data.hooks),
      modelUsed,
      mocked: false,
    };
  } catch (err) {
    console.error("research failed, using mock:", err);
    return {
      ...mockResearch(input.move, input.sediment),
      modelUsed: "mock",
      mocked: true,
    };
  }
}

export async function compactSediment(input: {
  sediment: Sediment;
}): Promise<CompactResponse & { modelUsed: string; mocked: boolean }> {
  const user = `Sediment to compact:\n${JSON.stringify(input.sediment)}`;
  try {
    const { data, modelUsed } = await generateJson<Record<string, unknown>>(
      DEPTH_MODEL,
      COMPACT_SYSTEM,
      user,
      {
        thinking: ThinkingLevel.HIGH,
        maxOutputTokens: 900,
        allowFallback: true,
        fallbackModels: [
          DEPTH_FALLBACK_MODEL,
          LITE_MODEL,
          FALLBACK_MODEL,
        ],
      },
    );
    return {
      sediment: normalizeSediment(data.sediment),
      note: String(data.note ?? "Compacted."),
      modelUsed,
      mocked: false,
    };
  } catch (err) {
    console.error("compact failed, using mock:", err);
    return {
      ...mockCompact(input.sediment),
      modelUsed: "mock",
      mocked: true,
    };
  }
}
