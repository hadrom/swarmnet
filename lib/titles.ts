const STOP = new Set(
  [
    "a",
    "an",
    "the",
    "and",
    "or",
    "but",
    "if",
    "then",
    "so",
    "to",
    "of",
    "in",
    "on",
    "for",
    "with",
    "from",
    "about",
    "into",
    "over",
    "after",
    "before",
    "between",
    "this",
    "that",
    "these",
    "those",
    "it",
    "its",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "do",
    "does",
    "did",
    "can",
    "could",
    "would",
    "should",
    "will",
    "just",
    "please",
    "me",
    "my",
    "we",
    "our",
    "you",
    "your",
    "i",
    "vs",
    "versus",
  ].map((w) => w.toLowerCase()),
);

/** Max length that fits the left chat tab comfortably. */
export const TAB_TITLE_MAX = 34;

export function isBlankTitle(title: string | null | undefined) {
  const t = (title ?? "").replace(/\s+/g, " ").trim();
  return !t || /^new chat$/i.test(t) || /^grounding$/i.test(t) || /^shared memory$/i.test(t);
}

/** Normalize model/heuristic output into a clean tab label. */
export function clampTabTitle(raw: string, fallback = "New chat"): string {
  let t = raw.replace(/\s+/g, " ").trim();
  t = t.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
  t = t.replace(/[?!.:;]+$/g, "").trim();
  // Drop trailing filler the model sometimes adds.
  t = t.replace(/\b(overview|summary|explained|basics|recap)$/i, "").trim();
  if (!t) return fallback;
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (t.length <= TAB_TITLE_MAX) return t;
  const sliced = t.slice(0, TAB_TITLE_MAX);
  const breakAt = sliced.lastIndexOf(" ");
  const cut = breakAt > 12 ? sliced.slice(0, breakAt) : sliced;
  return cut.trimEnd();
}

/**
 * Local fallback when the model title is missing.
 * Prefer a compact topic phrase over "first N words of the prompt".
 */
export function shortTitle(raw: string, fallback = "New chat"): string {
  let t = raw.replace(/\s+/g, " ").trim();
  if (!t) return fallback;

  const quoted = t.match(
    /^(?:what|who|why|how|when|where)\s+(?:is|are|was|were)\s+[“"'‘](.+?)[”"'’]\??$/i,
  );
  if (quoted?.[1]) {
    return clampTabTitle(quoted[1], fallback);
  }

  t = t.replace(/^[“"'‘]+|[”"'’]+$/g, "");
  t = t.replace(
    /^(?:hey|hi|hello|please|can you|could you|would you|tell me about|tell me|explain|describe|define|summarize|outline|help me (?:with|understand)|i (?:want|need) to (?:know|understand)|walk me through)\s+/i,
    "",
  );
  t = t.replace(
    /^(?:what(?:'s| is| are| was| were)|who(?:'s| is| are)|why(?: is| are| do| does| did| can| should| would)|how(?: do| does| did| can| to| is| are| should| would| could)|when(?: is| are| do| does)|where(?: is| are| do| does))\s+/i,
    "",
  );
  t = t.replace(/^(?:should we|do we|can we|could we|would we|we)\s+/i, "");
  t = t.replace(/^(?:prepare for|prep for|get ready for)\s+/i, "");
  t = t.replace(/^(?:a|an|the)\s+/i, "");
  t = t.replace(/[?!.:;]+$/g, "").trim();

  // "difference between X and Y" → "X vs Y"
  const diff = t.match(
    /^(?:the\s+)?(?:difference|differences|diff)\s+between\s+(.+?)\s+and\s+(.+)$/i,
  );
  if (diff) {
    return clampTabTitle(`${diff[1]} vs ${diff[2]}`, fallback);
  }

  // Keep content words; drop stopwords; aim for 2–5 words.
  const words = t
    .split(/\s+/)
    .map((w) => w.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9'-]+$/g, ""))
    .filter(Boolean);
  const kept: string[] = [];
  for (const w of words) {
    if (STOP.has(w.toLowerCase()) && kept.length > 0) continue;
    kept.push(w);
    if (kept.length >= 5) break;
  }
  const phrase = (kept.length >= 2 ? kept : words.slice(0, 4)).join(" ");
  return clampTabTitle(phrase || t, fallback);
}

/** Build a contextual tab title from question + answer when no model title yet. */
export function titleFromExchange(
  question: string,
  answer?: string,
  fallback = "New chat",
): string {
  const q = question.replace(/\s+/g, " ").trim();
  const a = (answer ?? "").replace(/\s+/g, " ").trim();
  if (!q && !a) return fallback;

  const fromQuestion = q ? shortTitle(q, "") : "";

  // Prefer a named entity / subject from the answer lead when it adds clarity.
  if (a) {
    const lead = a.split(/(?<=[.!?])\s+/)[0] ?? a;
    const subject = lead.match(
      /^((?:[A-Z][\w'’.-]*(?:\s+[A-Z][\w'’.-]*){0,3})|(?:[\w'’.-]+\s+){0,3}[\w'’.-]+)\s+(?:is|are|was|were|means|refers|describes)\b/,
    );
    if (subject?.[1] && subject[1].length >= 3) {
      const fromAnswer = clampTabTitle(
        subject[1].replace(/^(?:a|an|the)\s+/i, ""),
        "",
      );
      // Keep the richer phrase when the answer subject is too thin (1 token).
      if (
        fromAnswer &&
        (fromAnswer.split(/\s+/).length >= 2 ||
          !fromQuestion ||
          fromQuestion.split(/\s+/).length <= 1)
      ) {
        return fromAnswer;
      }
    }
  }

  return fromQuestion || shortTitle(a, fallback);
}

/** Max length for chat-path / timeline node labels. */
export const PATH_TITLE_MAX = 24;

function clampPathTitle(raw: string, fallback = "Consult"): string {
  let t = raw.replace(/\s+/g, " ").trim();
  t = t.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
  t = t.replace(/[?!.:;]+$/g, "").trim();
  if (!t) return fallback;
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (t.length <= PATH_TITLE_MAX) return t;
  const sliced = t.slice(0, PATH_TITLE_MAX);
  const breakAt = sliced.lastIndexOf(" ");
  const cut = breakAt > 8 ? sliced.slice(0, breakAt) : sliced;
  return cut.trimEnd();
}

/** Interrogative / process frames — not the concept the turn is about. */
const META_FRAMES = new Set(
  [
    "biggest risk",
    "main risk",
    "key risk",
    "risk",
    "first step",
    "smallest step",
    "next step",
    "owner",
    "timing",
    "cost",
    "alternatives",
    "success",
    "measure success",
    "trade-off",
    "tradeoff",
    "blocker",
    "constraint",
  ].map((s) => s.toLowerCase()),
);

function normalizeConcept(raw: string): string {
  return raw
    .replace(/^[“"'(]+|[”"'.,:;!?)]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function conceptKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isWeakConcept(label: string): boolean {
  const key = conceptKey(label);
  if (!key || key.length < 3) return true;
  if (META_FRAMES.has(key)) return true;
  const words = key.split(/\s+/);
  if (words.every((w) => STOP.has(w))) return true;
  if (words.length === 1 && (STOP.has(words[0]) || words[0].length < 4)) {
    return true;
  }
  return false;
}

function compressToConcept(raw: string): string {
  let t = normalizeConcept(raw);
  t = t.replace(/^(?:a|an|the|to|with|by)\s+/i, "");
  // Cut trailing prepositional / clause tails — keep the head noun phrase.
  // Use whitespace around short preps so "lock-in" is not split on "in".
  t = t
    .replace(
      /\s+(?:with|from|using|via|for|into|onto|in|on|at|after|before|until|once|depends|that|which|who)\b.*$/i,
      "",
    )
    .trim();
  t = t.replace(/[,;:].*$/, "").trim();
  const words = t
    .split(/\s+/)
    .map((w) => w.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9'-]+$/g, ""))
    .filter(Boolean)
    .filter((w) => !/^(depends|should|must|can|will)$/i.test(w));
  const kept: string[] = [];
  for (const w of words) {
    if (STOP.has(w.toLowerCase()) && kept.length > 0) continue;
    kept.push(w);
    if (kept.length >= 3) break;
  }
  return (kept.length ? kept : words.slice(0, 3)).join(" ");
}

type ConceptHit = { label: string; score: number };

/**
 * Pull concept-like noun phrases from a stretch of prose.
 * Prefers quoted / proper / framed topics over lead-sentence stubs.
 */
function extractConceptHits(text: string, sourceBoost: number): ConceptHit[] {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return [];
  const hits: ConceptHit[] = [];
  const seen = new Set<string>();

  const push = (raw: string, score: number) => {
    const label = compressToConcept(raw);
    if (isWeakConcept(label)) return;
    if (label.length > PATH_TITLE_MAX + 8) return;
    const words = label.split(/\s+/);
    if (words.length > 4) return;
    const key = conceptKey(label);
    if (seen.has(key)) return;
    seen.add(key);
    let s = score + sourceBoost;
    if (words.length >= 2) s += 4;
    if (words.length === 1 && /^[A-Z]/.test(label) && label.length >= 5) s += 1;
    // Lone adjectives / openers are almost never the concept.
    if (
      words.length === 1 &&
      /^(biggest|smallest|main|key|primary|first|next|best|worst|start|begin|try|focus)$/i.test(
        label,
      )
    ) {
      return;
    }
    if (META_FRAMES.has(key)) s -= 10;
    hits.push({ label, score: s });
  };

  // Quoted phrases — usually the named concept.
  for (const m of t.matchAll(/[“"']([^”"']{3,40})[”"']/g)) {
    push(m[1], 12);
  }

  // "… risk/issue/step is X" → X is the concept.
  for (const m of t.matchAll(
    /(?:biggest|main|key|primary|core|real|first|next|smallest)?\s*(?:risk|issue|problem|blocker|gap|trade-?offs?|constraint|step|move|owner|cost|metric|priority|focus)\s*(?:is|are|:)\s+([^.?!\n]{3,80})/gi,
  )) {
    push(m[1], 16);
  }

  // "Start with X" / "focus on X" / "prioritize X" / "depends on X"
  for (const m of t.matchAll(
    /(?:start with|start by|focus on|prioritize|driven by|about|regarding|concerning)\s+([^.?!\n,]{3,50})/gi,
  )) {
    push(m[1], 14);
  }

  // "X depends on …" → X is often the concept being discussed.
  for (const m of t.matchAll(
    /\b([A-Za-z][\w'’.-]+(?:\s+[A-Za-z][\w'’.-]+){0,2})\s+depends on\b/gi,
  )) {
    push(m[1], 15);
  }

  // "Ship/deliver X" (avoid bare "launch X" — collides with "Launch readiness")
  for (const m of t.matchAll(
    /\b(?:ship|deliver|schedule|roll out)\s+(?:the\s+)?([^.?!\n,]{3,40})/gi,
  )) {
    push(m[1], 12);
  }
  for (const m of t.matchAll(
    /\blaunch\s+(?:the|a|an|in|on)\s+([^.?!\n,]{3,40})/gi,
  )) {
    push(m[1], 12);
  }

  // "after/before the X" — often the gating concept (2-word max)
  for (const m of t.matchAll(
    /\b(?:after|before|until|once)\s+(?:the\s+)?([A-Za-z][\w'’.-]+(?:\s+[A-Za-z][\w'’.-]+)?)/gi,
  )) {
    push(m[1], 11);
  }

  // "X should/must own Y" → prefer Y (the owned thing)
  for (const m of t.matchAll(
    /\bown(?:s|ed)?\s+(?:the\s+)?([A-Za-z][\w'’.-]+(?:\s+[A-Za-z][\w'’.-]+){0,2})/gi,
  )) {
    push(m[1], 12);
  }

  // After "depends on", also keep a short object if it's concrete.
  for (const m of t.matchAll(
    /\bdepends on\s+([^.?!\n,]{3,50})/gi,
  )) {
    push(m[1], 7);
  }

  // "X is/are/means …" subject as concept
  for (const m of t.matchAll(
    /\b((?:[A-Z][\w'’.-]*(?:\s+[A-Z][\w'’.-]*){0,3})|(?:[A-Za-z][\w'’.-]+)(?:\s+[A-Za-z][\w'’.-]+){0,2})\s+(?:is|are|was|were|means|refers to)\b/g,
  )) {
    push(m[1], 9);
  }

  // Capitalized multi-word runs (proper concepts / titles)
  for (const m of t.matchAll(
    /\b([A-Z][\w'’.-]*(?:\s+[A-Z][\w'’.-]*){1,3})\b/g,
  )) {
    push(m[1], 8);
  }

  // Noun-ish content tokens (prefer longer / Capitalized)
  for (const m of t.matchAll(/\b([A-Za-z][\w'’.-]{4,})\b/g)) {
    const w = m[1];
    if (STOP.has(w.toLowerCase())) continue;
    if (/^[A-Z]/.test(w) || w.length >= 8) push(w, 2);
  }

  return hits;
}

function rankConceptHits(
  fromAnswer: ConceptHit[],
  fromQuestion: ConceptHit[],
): ConceptHit[] {
  const merged = new Map<string, ConceptHit>();
  for (const hit of [...fromAnswer, ...fromQuestion]) {
    const key = conceptKey(hit.label);
    const inBoth =
      fromAnswer.some((h) => conceptKey(h.label) === key) &&
      fromQuestion.some((h) => conceptKey(h.label) === key);
    const score = hit.score + (inBoth ? 6 : 0);
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, { label: hit.label, score });
      continue;
    }
    const richer =
      hit.label.split(/\s+/).length > prev.label.split(/\s+/).length
        ? hit.label
        : prev.label;
    merged.set(key, {
      label: richer,
      score: Math.max(score, prev.score),
    });
  }
  return [...merged.values()].sort(
    (x, y) =>
      y.score - x.score ||
      y.label.split(/\s+/).length - x.label.split(/\s+/).length ||
      x.label.length - y.label.length,
  );
}

/** Looks like a question / imperative prompt rather than a noun-phrase topic. */
function looksLikePromptStub(label: string): boolean {
  const t = label.trim();
  if (/\?$/.test(t)) return true;
  if (
    /^(what|who|why|how|when|where|should|could|would|can|do|does|did|is|are|tell|explain|describe)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Concise microtitle for a Contents section.
 * Noun-phrase topic (2–4 words) — never the first words of the prompt.
 */
export function microTitle(
  question: string,
  answer?: string,
  fallback = "Topic",
): string {
  const q = question.replace(/\s+/g, " ").trim();
  const a = (answer ?? "").replace(/\s+/g, " ").trim();
  if (!q && !a) return fallback;

  const fromAnswer = extractConceptHits(a, 5);
  const fromQuestion = extractConceptHits(q, 0);
  const ranked = rankConceptHits(fromAnswer, fromQuestion);

  for (const hit of ranked) {
    if (META_FRAMES.has(conceptKey(hit.label))) continue;
    if (looksLikePromptStub(hit.label)) continue;
    const words = hit.label.split(/\s+/);
    if (words.length >= 2 || hit.score >= 10) {
      return clampPathTitle(hit.label, fallback);
    }
  }

  if (a) {
    const lead = a.split(/(?<=[.!?])\s+/)[0] ?? a;
    const cleaned = lead
      .replace(
        /^(?:in short|in brief|basically|simply put|overall|tl;?dr|yes[,.]?\s+|no[,.]?\s+)/i,
        "",
      )
      .trim();
    const fromA = shortTitle(cleaned, "");
    if (
      fromA &&
      !looksLikePromptStub(fromA) &&
      !META_FRAMES.has(conceptKey(fromA))
    ) {
      return clampPathTitle(fromA, fallback);
    }
  }

  const fromQ = q ? shortTitle(q, "") : "";
  if (
    fromQ &&
    !looksLikePromptStub(fromQ) &&
    !META_FRAMES.has(conceptKey(fromQ))
  ) {
    return clampPathTitle(fromQ, fallback);
  }

  return clampPathTitle(fromQ || shortTitle(a || q, fallback), fallback);
}

/** @deprecated Prefer microTitle */
export function pathNodeTitle(
  question: string,
  answer?: string,
  fallback = "Consult",
): string {
  return microTitle(question, answer, fallback);
}

/** Distinctive content tokens for topic clustering. */
export function contentWordSet(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().match(/[a-z][a-z0-9'-]{3,}/g) ?? []) {
    if (STOP.has(raw)) continue;
    if (META_FRAMES.has(raw)) continue;
    out.add(raw);
  }
  return out;
}

/** Concept keys extracted from Q+A for overlap checks. */
export function topicKeySet(question: string, answer?: string): Set<string> {
  const hits = rankConceptHits(
    extractConceptHits(answer ?? "", 4),
    extractConceptHits(question, 0),
  );
  const out = new Set<string>();
  for (const h of hits.slice(0, 8)) {
    const key = conceptKey(h.label);
    if (key) out.add(key);
    for (const w of key.split(/\s+/)) {
      if (w.length >= 4 && !STOP.has(w)) out.add(w);
    }
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}
