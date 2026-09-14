# Two-lane LLM demo

Local prototype for cofounder demos. The core mix is:

- **Consult** — short answers on a clean spine, steered by **Ask next** chips  
- **Depth** — disposable deep read on one answer, switched by **Variations**  
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

- Short answers on the main spine
- **Ask next** — exactly **3** follow-up chips, ranked by inferred intent from the question + short answer (navigate without typing)
- Click a word or drag-select a phrase in a consult answer or in the Depth/Elaborate pane, confirm **Ask about this**, and consult answers as if you asked what that thing is — no typing. Follow-ups always land on the consult timeline.
- Three suggested topics are **randomized on each page load** (any walk of life)
- **Read deeper** opens **Depth** to the **left of consult**; **Variations** reweight that same deep read (Main + facet tabs — not chat chips)
- **Grounding** stays on the **right** and can stay open while you read deeper

### Depth → Grounding

Depth replies are deeper reads, not source of truth. From an open depth pane:

- **Half** — append a short excerpt from the start of the elaborate  
- **Full** — append the entire elaborate reply (nothing truncated)  

### Grounding (journal lane)

1. Click **Grounding** on an answer (or reopen from the header) — opens for **reading**; chat still consults
2. Doc seeds as an open journal (no fixed sections). It grows like an RPG trail
3. Edit with the toolbar yourself, or click **Edit with chat** to arm the composer
4. While armed, sky chrome shows; turns **append** to the journal (agreements, disagreements, and “you’re wrong because…” live in the trail itself — not special subtitles)
5. **Back to consult** / **Stop editing** disarms — Grounding can stay open while you ask normal questions
6. Status chrome shows entry count
7. Hide anytime — the journal persists with the chat until you start a new one

### Chat history

- Conversations auto-save to `localStorage` (`two-lane-chats-v1`) with title from the first question
- Left sidebar lists past chats — click to recall (consult + grounding included)
- **New chat** archives the current thread and opens a blank one; delete from the sidebar when done
- Survives tab close (unlike the old single-session `sessionStorage` slot)

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
3. **Read deeper** — switch **Variations**; **Half → Grounding**.
4. Arm **Edit with chat**, then disagree or lock something — watch the journal grow.
5. Disarm and ask a normal consult question — Grounding stays visible.
6. **New chat** — current thread stays in the sidebar; open another topic.
7. Switch chats from the sidebar to prove recall (grounding comes back too).

## Swap to on-prem later

Provider surface in [`lib/gemini.ts`](lib/gemini.ts): `generateLite`, `generateBrief`, `reviseNotes`, `compactNotes`, `generateCanvasEdit`.

## Security

`.env.local` is gitignored. Do not commit API keys.
