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
  return !t || /^new chat$/i.test(t) || /^grounding$/i.test(t);
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
