# Two-lane LLM demo

Local prototype for cofounder demos: **Consult** is the spine (compressed answers + on-demand brief). **Discuss** is a branch you enter from any answer — same consult chat voice, with living **working notes** beside the thread as an audit trail of shared understanding. Gemini is a disposable stand-in for an on-prem model.

## Run

```bash
cp .env.example .env.local   # then paste GEMINI_API_KEY
npm install
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

## Flow

### Consult (default)

- Every turn uses a lite model → one paragraph + drill chips
- **Elaborate** / chip → depth model writes a structured brief in the right pane (snapshot, minimizable, persisted per answer)
- Follow-ups stay in the left thread (no chat inside the brief)

### Discuss (companion notes — not a separate mode)

- On any consult answer, click **Discuss** once to pin living **working notes** beside the chat
- After that there is no “Back to consult” mode switch — same composer, same thread
- Minimize the notes pane anytime; a sticky amber **dock** under the composer lets you reopen them
- Notes are permanent for the tab session (sessionStorage): reopen / refresh keeps progress
- While notes exist, every follow-up quietly updates them even if the pane is minimized
- Soft chips stay consult-like (“What have we agreed?”, …)
- **Tighten** cleans the memo; **Restart** (in the notes header) is the only way to wipe and reseed

## Models

| Job | Model | Notes |
|---|---|---|
| Lite / discuss turns | `gemini-3.5-flash-lite` | High free-tier volume |
| Brief / tighten | `gemini-3.8-flash` | Use sparingly in demos |
| 429 fallback | `gemma-4-31b-it` | High RPD, tight TPM |
| Offline / errors | in-memory mock | Same JSON shapes |

## Demo script

1. Click a starter (or ask an ops question).
2. Notice the answer is one paragraph.
3. Click a chip or **Elaborate** — brief opens on the right. Minimize if you want.
4. Click **Discuss** on that answer — working notes open beside the chat.
5. Ask a normal follow-up (or use a chip). Watch **Agreed** / **Still open** / **Trail** grow.
6. Minimize notes — the amber dock keeps them one tap away. Progress is not wiped.
7. Click **Tighten** to clean the memo; use **Restart** only if you truly want a fresh seed.

## Swap to on-prem later

Provider surface lives in [`lib/gemini.ts`](lib/gemini.ts):

- `generateLite`
- `generateBrief`
- `reviseNotes`
- `compactNotes`

Point those at your unlimited on-prem endpoint; keep the JSON contracts in [`lib/types.ts`](lib/types.ts) and the UI unchanged.

## Security

`.env.local` is gitignored. Do not commit API keys. Rotate any key that was pasted into chat.
