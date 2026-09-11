# Two-lane LLM demo

Local prototype for cofounder demos: **Consult** is the spine (compressed answers + on-demand brief). **Research** is a branch you enter via **Pressure-test** — dialectic moves revise living sediment. Gemini is a disposable stand-in for an on-prem model.

## Run

```bash
cp .env.example .env.local   # then paste GEMINI_API_KEY
npm install
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

## Flow

### Consult (default)

- Every turn uses `gemini-3.5-flash-lite` → one paragraph + drill chips
- **Elaborate** / chip → `gemini-3.8-flash` writes a structured brief in the right pane (snapshot, minimizable, persisted per answer)
- Follow-ups stay in the left thread (no chat inside the brief)

### Research (branch)

- On any consult answer, click **Pressure-test** to seed sediment from that answer (and open/saved brief if present)
- Composer switches to dialectic moves; right pane shows living **sediment**: claim, tensions, evidence, open questions
- Each move returns a “this turn” diff
- **Compact** rewrites the sediment tighter via `gemini-3.8-flash`
- **Back to consult** returns the composer to plain consult replies (sediment stays in memory until you re-seed)

## Models

| Job | Model | Notes |
|---|---|---|
| Lite / research moves | `gemini-3.5-flash-lite` | 500 RPD on free tier |
| Brief / compact | `gemini-3.8-flash` | 20 RPD — use sparingly in demos |
| 429 fallback | `gemma-4-31b-it` | High RPD, tight TPM |
| Offline / errors | in-memory mock | Same JSON shapes |

## Demo script

1. Click a starter (or ask an ops question).
2. Notice the answer is one paragraph. Do **not** expand yet.
3. Click a chip or **Elaborate** — brief opens on the right. Minimize if you want.
4. Click **Pressure-test** on that answer — sediment seeds and opens.
5. Use a move chip (Attack this, Find contradiction, …) or type your own. Watch sediment + “this turn” update.
6. Click **Compact**, then **Back to consult** if you want normal Q&A again.

## Swap to on-prem later

Provider surface lives in [`lib/gemini.ts`](lib/gemini.ts):

- `generateLite`
- `generateBrief`
- `reviseSediment`
- `compactSediment`

Point those at your unlimited on-prem endpoint; keep the JSON contracts in [`lib/types.ts`](lib/types.ts) and the UI unchanged.

## Security

`.env.local` is gitignored. Do not commit API keys. Rotate any key that was pasted into chat.
