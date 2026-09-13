# Two-lane LLM demo

Local prototype for cofounder demos. The core mix is:

- **Consult** — short answers on a clean spine  
- **Elaborate** — disposable deep read on one answer  
- **Grounding** — a living journal that grows as you talk (agreements, clashes, corrections)

Gemini is a disposable stand-in for an on-prem model.

## Run

```bash
cp .env.example .env.local   # then paste GEMINI_API_KEY
npm install
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

## Flow

### Consult

- Short answers on the main spine; chips send **consult follow-ups**
- Three suggested topics are **randomized on each page load** (any walk of life)
- **Elaborate** opens a longer freeform expansion of the short answer; deeper **angles** live as chips inside that pane
- **Grounding** opens the journal beside consult

### Elaborate → Grounding

Elaborate replies are deeper reads, not source of truth. From an open elaborate:

- **Half** — append a short excerpt from the start of the elaborate  
- **Full** — append the entire elaborate reply (nothing truncated) 

### Grounding (journal lane)

1. Click **Grounding** on an answer (or reopen from the header) — opens for **reading**; chat still consults
2. Doc seeds as an open journal (no fixed sections). It grows like an RPG trail
3. Edit with the toolbar yourself, or click **Edit with chat** to arm the composer
4. While armed, sky chrome shows; turns **append** to the journal (agreements, disagreements, and “you’re wrong because…” live in the trail itself — not special subtitles)
5. **Back to consult** / **Stop editing** disarms — Grounding can stay open while you ask normal questions
6. Status chrome shows entry count
7. Hide anytime — the journal persists with the session until **New chat**

Persistence: `two-lane-session-v8` (consult + grounding journal + edit-armed flag).

## Models

| Job | Model | Notes |
|---|---|---|
| Lite / grounding turns | `gemini-3.5-flash-lite` | High free-tier volume |
| Brief | `gemini-3.8-flash` | Use sparingly in demos |
| 429 fallback | `gemma-4-31b-it` | High RPD, tight TPM |
| Offline / errors | in-memory mock | Same JSON shapes |

## Demo script

1. Refresh — note three new starter topics.
2. Click a starter (and maybe a chip follow-up).
3. **Elaborate** — skim angles; **Half → Grounding**.
4. Arm **Edit with chat**, then disagree or lock something — watch the journal grow.
5. Disarm and ask a normal consult question — Grounding stays visible.
6. **New chat** for a clean slate.

## Swap to on-prem later

Provider surface in [`lib/gemini.ts`](lib/gemini.ts): `generateLite`, `generateBrief`, `reviseNotes`, `compactNotes`, `generateCanvasEdit`.

## Security

`.env.local` is gitignored. Do not commit API keys.
