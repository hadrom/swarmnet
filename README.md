# Two-lane LLM demo

Local prototype for cofounder demos: **Consult** for short answers, **Discuss** to converge on a shared picture beside the chat. Gemini is a disposable stand-in for an on-prem model.

## Run

```bash
cp .env.example .env.local   # then paste GEMINI_API_KEY
npm install
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

## Flow

### Consult

- Short answers + drill chips
- **Elaborate** opens a brief snapshot on the side (always available on assistant replies)

### Discuss

1. Click **Discuss** on an answer → a living memo opens beside the chat
2. Keep chatting — the memo tracks **So far / We've settled / Still wondering / How we got here**
3. **Hide** tucks it away (amber strip under the composer → **Show**)
4. **Done** pauses Discuss updates — chat is normal again; memo is kept
5. **Discuss from here** on a different answer starts a fresh memo for that topic
6. **New chat** clears the conversation and Discuss memo together

Persistence keeps **chat + Discuss memo as one session**. Refresh restores both. A memo is never restored without its chat (no orphan panes after a “fresh” convo).

## Models

| Job | Model | Notes |
|---|---|---|
| Lite / discuss turns | `gemini-3.5-flash-lite` | High free-tier volume |
| Brief / clean up | `gemini-3.8-flash` | Use sparingly in demos |
| 429 fallback | `gemma-4-31b-it` | High RPD, tight TPM |
| Offline / errors | in-memory mock | Same JSON shapes |

## Demo script

1. Click a starter.
2. Optionally **Elaborate**.
3. Click **Discuss** — memo appears.
4. Ask a follow-up; watch the memo grow.
5. **Hide**, keep chatting, then **Show**.
6. Click **Done** when finished; **New chat** for a clean slate.

## Swap to on-prem later

Provider surface in [`lib/gemini.ts`](lib/gemini.ts): `generateLite`, `generateBrief`, `reviseNotes`, `compactNotes`.

## Security

`.env.local` is gitignored. Do not commit API keys.
