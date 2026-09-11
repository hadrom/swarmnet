# Two-lane LLM demo

Local prototype for a **Consult** lane (compressed answers + on-demand brief) and a **Research** lane (dialectic moves that revise living sediment). Built to show cofounders an interaction pattern — not a product. Gemini is a disposable stand-in for an on-prem model.

## Run

```bash
cp .env.example .env.local   # then paste GEMINI_API_KEY
npm install
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

## Modes

### Consult

- Every turn uses `gemini-3.5-flash-lite` → one paragraph + drill chips
- **Elaborate** / chip → `gemini-3.8-flash` writes a structured brief in the right pane
- Follow-ups stay in the left thread (no chat inside the brief)

### Research

- Left thread stays short (dialectic moves)
- Right pane holds **sediment**: claim, tensions, evidence, open questions
- Each move returns a “this turn” diff
- **Compact** rewrites the sediment tighter via `gemini-3.8-flash`

## Models

| Job | Model | Notes |
|---|---|---|
| Lite / research moves | `gemini-3.5-flash-lite` | 500 RPD on free tier |
| Brief / compact | `gemini-3.8-flash` | 20 RPD — use sparingly in demos |
| 429 fallback | `gemma-4-31b-it` | High RPD, tight TPM |
| Offline / errors | in-memory mock | Same JSON shapes |

## Demo script

1. Stay on **Consult**. Click a starter (or ask an ops question).
2. Notice the answer is one paragraph. Do **not** expand yet.
3. Click a chip or **Elaborate** — brief opens on the right.
4. Switch to **Research**. Paste a working claim. Object twice.
5. Watch sediment + “this turn” update. Click **Compact**.

## Swap to on-prem later

Provider surface lives in [`lib/gemini.ts`](lib/gemini.ts):

- `generateLite`
- `generateBrief`
- `reviseSediment`
- `compactSediment`

Point those at your unlimited on-prem endpoint; keep the JSON contracts in [`lib/types.ts`](lib/types.ts) and the UI unchanged.

## Security

`.env.local` is gitignored. Do not commit API keys. Rotate any key that was pasted into chat.
