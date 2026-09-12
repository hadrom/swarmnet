# Two-lane LLM demo

Local prototype for cofounder demos: **Consult** for short answers on a clean spine, **Discuss** as a separate mode with its own timeline on one answer. Gemini is a disposable stand-in for an on-prem model.

## Run

```bash
cp .env.example .env.local   # then paste GEMINI_API_KEY
npm install
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

## Flow

### Consult

- Short answers on the main spine; chips send **consult follow-ups** (stay on the spine)
- **Elaborate** opens one brief on the side; deeper **angles** live as chips inside that brief

### Discuss (separate mode)

1. Click **Discuss** on an answer → enter Discuss mode (chrome changes; own timeline)
2. The root answer is pinned at the top; follow-ups stay **off** the consult spine
3. Living memo beside the chat tracks **So far / We've settled / Still wondering / How we got here**
4. **Hide** tucks the memo (amber strip → **Show memo**); you stay in Discuss
5. **Done** / **Consult** returns to the spine — digression is not dumped into chat
6. The root answer keeps a **Discussed · N turns · Reopen** marker
7. **Discuss** on a different answer opens (or creates) that answer’s branch
8. **New chat** clears the consult spine and all Discuss branches

Persistence keeps **consult + discuss branches as one session** (`two-lane-session-v4`).

## Models

| Job | Model | Notes |
|---|---|---|
| Lite / discuss turns | `gemini-3.5-flash-lite` | High free-tier volume |
| Brief / clean up | `gemini-3.8-flash` | Use sparingly in demos |
| 429 fallback | `gemma-4-31b-it` | High RPD, tight TPM |
| Offline / errors | in-memory mock | Same JSON shapes |

## Demo script

1. Click a starter (and maybe a chip follow-up on the spine).
2. **Elaborate** — use angle chips inside the brief for scoped depth.
3. Click **Discuss** — mode switch, separate timeline + memo.
4. Ask a follow-up; watch the memo grow.
5. **Done** → consult spine is still clean; reopen from the marker.
6. **New chat** for a clean slate.

## Swap to on-prem later

Provider surface in [`lib/gemini.ts`](lib/gemini.ts): `generateLite`, `generateBrief`, `reviseNotes`, `compactNotes`.

## Security

`.env.local` is gitignored. Do not commit API keys.
