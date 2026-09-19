/**
 * Thread / journal table-of-contents: topic-spanning sections + microtitles.
 * Consecutive turns (or journal entries) about the same subject collapse into one row.
 */

import type { Hook, ThreadMessage } from "@/lib/types";
import { stripHtml } from "@/lib/types";
import {
  contentWordSet,
  jaccard,
  microTitle,
  topicKeySet,
} from "@/lib/titles";

export type ContentsSection = {
  id: string;
  index: number;
  title: string;
  meta?: string;
  /** Jump target in chat spine */
  messageId?: string;
  /** Jump target phrase in Shared memory */
  findText?: string;
  /** Seeds for optional model microtitle enrichment */
  seedQuestion: string;
  seedAnswer: string;
  turnCount: number;
};

type RawTurn = {
  id: string;
  messageId: string;
  question: string;
  answer: string;
  viaAskNext: boolean;
  hasDepth: boolean;
  keys: Set<string>;
  words: Set<string>;
};

function isConsultUser(msg: ThreadMessage) {
  return msg.role === "user" && msg.kind !== "grounding" && msg.kind !== "canvas";
}

function isConsultAssistant(msg: ThreadMessage) {
  return (
    msg.role === "assistant" &&
    msg.kind !== "grounding" &&
    msg.kind !== "canvas"
  );
}

function normalizeQ(s: string) {
  return s.replace(/\s+/g, " ").trim().toLowerCase().replace(/[?!.]+$/g, "");
}

function matchedAskNext(question: string, hooks: Hook[] | undefined): boolean {
  if (!hooks?.length) return false;
  const q = normalizeQ(question);
  return hooks.some((h) => {
    const label = normalizeQ(h.label);
    return label.length >= 3 && (q === label || q.includes(label) || label.includes(q));
  });
}

function isThinFollowUp(question: string): boolean {
  const q = question.replace(/\s+/g, " ").trim();
  if (q.length < 28) {
    if (
      /^(yes|no|ok|okay|sure|thanks|yep|nope|go on|continue|more|why|how|and\b)/i.test(
        q,
      )
    ) {
      return true;
    }
  }
  // Ask-next style meta questions are continuations, not new chapters.
  return /^(what(?:'s| is| are)?\s+the\s+)?(biggest|main|key|smallest|first|next)\s+(risk|step|issue|blocker|owner|cost|trade-?off)/i.test(
    q,
  ) || /^(who owns|by when|how (?:do|should) we measure|what(?:'s| are) the alternatives)/i.test(
    q,
  );
}

function sameTopic(prev: RawTurn, next: RawTurn): boolean {
  if (next.viaAskNext) return true;
  if (isThinFollowUp(next.question)) return true;
  const keyOverlap = jaccard(prev.keys, next.keys);
  if (keyOverlap >= 0.22) return true;
  const wordOverlap = jaccard(prev.words, next.words);
  if (wordOverlap >= 0.18) return true;
  // Shared distinctive key token
  for (const k of next.keys) {
    if (k.length >= 5 && prev.keys.has(k)) return true;
  }
  return false;
}

function collectTurns(messages: ThreadMessage[]): RawTurn[] {
  const turns: RawTurn[] = [];
  let i = 0;
  let prevHooks: Hook[] | undefined;

  while (i < messages.length) {
    const msg = messages[i];
    if (!isConsultUser(msg)) {
      i += 1;
      continue;
    }
    const question = msg.content.trim();
    const next = messages[i + 1];
    const answerMsg =
      next && isConsultAssistant(next) ? next : null;
    const answer = answerMsg?.content?.trim() ?? "";
    const messageId = answerMsg?.id ?? msg.id;
    const viaAskNext = matchedAskNext(question, prevHooks);
    const blob = `${question}\n${answer}`;
    turns.push({
      id: `ex-${messageId}`,
      messageId,
      question,
      answer,
      viaAskNext: Boolean(turns.length && viaAskNext),
      hasDepth: Boolean(
        answerMsg?.briefs && Object.keys(answerMsg.briefs).length > 0,
      ),
      keys: topicKeySet(question, answer),
      words: contentWordSet(blob),
    });
    prevHooks = answerMsg?.hooks;
    i += answerMsg ? 2 : 1;
  }
  return turns;
}

function sectionTitle(turns: RawTurn[]): string {
  // Prefer the densest answer in the span; fall back across turns.
  let best = "";
  let bestScore = -1;
  for (const t of turns) {
    const title = microTitle(t.question, t.answer, "");
    if (!title) continue;
    const score =
      (t.answer.length > 40 ? 2 : 0) +
      title.split(/\s+/).length * 2 +
      (t.viaAskNext ? -1 : 1) +
      Math.min(t.answer.length, 200) / 100;
    if (score > bestScore) {
      bestScore = score;
      best = title;
    }
  }
  if (best) return best;
  const first = turns[0];
  return microTitle(first.question, first.answer, "Topic");
}

function sectionMeta(turns: RawTurn[], fromStep: number, toStep: number): string {
  if (turns.some((t) => t.hasDepth) && fromStep === toStep) return "depth";
  if (fromStep === toStep) {
    return turns[0]?.viaAskNext ? "ask next" : `§${fromStep}`;
  }
  return `§${fromStep}–${toStep}`;
}

const MAX_TURNS_PER_SECTION = 6;

/**
 * Build topic-spanning Contents for the consult spine.
 */
export function buildChatContents(messages: ThreadMessage[]): ContentsSection[] {
  const turns = collectTurns(messages);
  if (turns.length === 0) return [];

  const groups: RawTurn[][] = [];
  let current: RawTurn[] = [turns[0]];

  for (let i = 1; i < turns.length; i++) {
    const prev = current[current.length - 1];
    const next = turns[i];
    if (
      current.length < MAX_TURNS_PER_SECTION &&
      sameTopic(prev, next)
    ) {
      current.push(next);
    } else {
      groups.push(current);
      current = [next];
    }
  }
  groups.push(current);

  let stepCursor = 1;
  return groups.map((group, gi) => {
    const fromStep = stepCursor;
    const toStep = stepCursor + group.length - 1;
    stepCursor = toStep + 1;
    const title = sectionTitle(group);
    const seedAnswer = group
      .map((t) => t.answer)
      .filter(Boolean)
      .join("\n")
      .slice(0, 800);
    return {
      id: `sec-${group[0].messageId}-${group.length}`,
      index: gi + 1,
      title,
      meta: sectionMeta(group, fromStep, toStep),
      messageId: group[0].messageId,
      seedQuestion: group[0].question,
      seedAnswer,
      turnCount: group.length,
    };
  });
}

function journalBodyWithoutNotes(html: string): string {
  const raw = (html || "").trim();
  if (!raw) return "";
  const cut = raw.search(/<h3[^>]*>\s*NOTES\s*<\/h3>/i);
  if (cut >= 0) return raw.slice(0, cut);
  return raw;
}

function splitEntryChunks(html: string): string[] {
  const body = journalBodyWithoutNotes(html);
  if (!body) return [];
  return body
    .split(/<hr\s*\/?>/i)
    .map((chunk) => stripHtml(chunk).replace(/\s+/g, " ").trim())
    .filter((t) => t.length >= 8);
}

function findSnippet(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 8) return text.slice(0, 80);
  return words.slice(0, 6).join(" ");
}

type RawEntry = {
  text: string;
  findText: string;
  keys: Set<string>;
  words: Set<string>;
};

function sameJournalTopic(prev: RawEntry, next: RawEntry): boolean {
  if (jaccard(prev.keys, next.keys) >= 0.2) return true;
  if (jaccard(prev.words, next.words) >= 0.16) return true;
  for (const k of next.keys) {
    if (k.length >= 5 && prev.keys.has(k)) return true;
  }
  return false;
}

/**
 * Build topic-spanning Contents for Shared memory journal entries.
 */
export function buildJournalContents(bodyHtml: string): ContentsSection[] {
  const chunks = splitEntryChunks(bodyHtml);
  if (chunks.length === 0) return [];

  const entries: RawEntry[] = chunks.map((text) => ({
    text,
    findText: findSnippet(text),
    keys: topicKeySet("", text),
    words: contentWordSet(text),
  }));

  const groups: RawEntry[][] = [];
  let current: RawEntry[] = [entries[0]];
  for (let i = 1; i < entries.length; i++) {
    const prev = current[current.length - 1];
    const next = entries[i];
    if (current.length < MAX_TURNS_PER_SECTION && sameJournalTopic(prev, next)) {
      current.push(next);
    } else {
      groups.push(current);
      current = [next];
    }
  }
  groups.push(current);

  let stepCursor = 1;
  return groups.map((group, gi) => {
    const fromStep = stepCursor;
    const toStep = stepCursor + group.length - 1;
    stepCursor = toStep + 1;
    const combined = group.map((e) => e.text).join(" ");
    const title = microTitle("", combined, `Entry ${gi + 1}`);
    return {
      id: `journal-${gi}-${group.length}`,
      index: gi + 1,
      title,
      meta:
        fromStep === toStep ? `§${fromStep}` : `§${fromStep}–${toStep}`,
      findText: group[0].findText,
      seedQuestion: title,
      seedAnswer: combined.slice(0, 800),
      turnCount: group.length,
    };
  });
}
