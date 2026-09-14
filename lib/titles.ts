/** Compact label for chat tabs / auto grounding titles. */
export function shortTitle(raw: string, fallback = "New chat"): string {
  let t = raw.replace(/\s+/g, " ").trim();
  if (!t) return fallback;

  // Ask-about-this: What is “entanglement”?
  const quoted = t.match(
    /^(?:what|who|why|how|when|where)\s+(?:is|are|was|were)\s+[“"\'‘](.+?)[”"\'’]\??$/i,
  );
  if (quoted?.[1]) {
    t = quoted[1].trim();
  } else {
    t = t.replace(/^[“"\'‘]+|[”"\'’]+$/g, "");
    t = t.replace(
      /^(?:hey|hi|hello|please|can you|could you|would you|tell me|explain|describe|define|summarize|outline)\s+/i,
      "",
    );
    t = t.replace(
      /^(?:what(?:'s| is| are| was| were)|who(?:'s| is| are)|why(?: is| are| do| does| did| can)|how(?: do| does| did| can| to| is| are)|when(?: is| are| do| does)|where(?: is| are| do| does))\s+/i,
      "",
    );
    t = t.replace(/^(?:a|an|the)\s+/i, "");
  }

  // Declarative answer openings: "Coral reef is a complex…" → "Coral reef"
  const beforeIs = t.match(
    /^((?:[\w'’.-]+\s+){0,3}[\w'’.-]+)\s+(?:is|are|was|were|means|refers)\b/i,
  );
  if (beforeIs?.[1] && beforeIs[1].length >= 2) {
    t = beforeIs[1].trim();
  }

  t = t.replace(/[?!.:;]+$/g, "").trim();
  if (!t) return fallback;

  t = t.charAt(0).toUpperCase() + t.slice(1);

  const max = 28;
  if (t.length <= max) return t;
  const sliced = t.slice(0, max);
  const breakAt = sliced.lastIndexOf(" ");
  const cut = breakAt > 10 ? sliced.slice(0, breakAt) : sliced;
  return `${cut.trimEnd()}…`;
}
