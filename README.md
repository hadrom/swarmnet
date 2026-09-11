# Two-lane LLM demo

Local prototype for cofounder demos: chat like a consult, and optionally keep a **shared notepad** beside the thread — the way two friends jot progress so they both stay aligned. Gemini is a disposable stand-in for an on-prem model.

## Run

```bash
cp .env.example .env.local   # then paste GEMINI_API_KEY
npm install
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

## Flow

### Chat (default)

- Short answers + drill chips
- **Elaborate** opens a brief snapshot on the side

### Shared notepad (optional)

Like writing on a napkin while you talk — not a separate “mode”:

1. Click **Take notes** on an answer → notepad opens beside the chat
2. Keep chatting; the notepad quietly updates **So far / We've settled / Still wondering / How we got here**
3. **Hide** tucks it away (amber strip under the composer → **Show**)
4. **Done** stops jotting — chat is normal again; the notepad is kept so you can **Open** / **Resume** later
5. **Clean up** tidies wording; **Start over** is the only wipe

Nothing cryptic: no “notes live”, no “1 agreed · 3 open”. The dock just says which notepad is hidden and whether you’re still jotting.

## Models

| Job | Model | Notes |
|---|---|---|
| Lite / jotting turns | `gemini-3.5-flash-lite` | High free-tier volume |
| Brief / clean up | `gemini-3.8-flash` | Use sparingly in demos |
| 429 fallback | `gemma-4-31b-it` | High RPD, tight TPM |
| Offline / errors | in-memory mock | Same JSON shapes |

## Demo script

1. Click a starter.
2. Optionally **Elaborate**.
3. Click **Take notes** — notepad appears.
4. Ask a follow-up; watch **We've settled** / **Still wondering** grow.
5. **Hide**, keep chatting, then **Show** from the strip.
6. Click **Done** when you’re finished jotting; reopen later if you want.

## Swap to on-prem later

Provider surface in [`lib/gemini.ts`](lib/gemini.ts): `generateLite`, `generateBrief`, `reviseNotes`, `compactNotes`.

## Security

`.env.local` is gitignored. Do not commit API keys.
