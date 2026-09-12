# Two-lane LLM demo

Local prototype for cofounder demos. The core mix is:

- **Consult** — short answers on a clean spine  
- **Elaborate** — disposable deep read on one answer  
- **Canvas** — writable ground-truth doc you cross-check (and chat can patch)

Gemini is a disposable stand-in for an on-prem model. **Discuss** remains as an alternate branch lane, but Canvas is the preferred ledger.

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
- **Canvas** opens the ground-truth document beside consult

### Elaborate → Canvas

Briefs are deep reads, not source of truth. From an open brief, promote keepers into Canvas:

- **Bottom line** — into the ledger  
- **Open questions** — unknowns become canvas open questions  
- **Full brief** — bottom line + unknowns + notes  

Then continue editing the canvas (manually or via chat).

### Canvas (ground-truth lane)

1. Click **Canvas** on an answer (or reopen from the header)
2. Doc seeds with **Bottom line / Decisions / Open questions / Notes**
3. Edit with the toolbar, or ask in chat to draft/patch (surgical ops)
4. When you settle something in chat, the model should move it into **Decisions** and clear it from **Open questions**
5. Status chrome shows `N decided · M open`
6. Hide anytime — the doc persists with the session until **New chat**

### Discuss (alternate lane)

Still available for a separate timeline + living memo on one answer. Prefer Canvas when you want a human-owned checked record.

Persistence: `two-lane-session-v5` (consult + discuss branches + canvas).

## Models

| Job | Model | Notes |
|---|---|---|
| Lite / discuss / canvas turns | `gemini-3.5-flash-lite` | High free-tier volume |
| Brief / clean up | `gemini-3.8-flash` | Use sparingly in demos |
| 429 fallback | `gemma-4-31b-it` | High RPD, tight TPM |
| Offline / errors | in-memory mock | Same JSON shapes |

## Demo script

1. Click a starter (and maybe a chip follow-up).
2. **Elaborate** — skim angles; **Bottom line → Canvas**.
3. With Canvas open, ask chat to lock a decision or add an open question.
4. Edit the doc yourself; confirm the status chips move.
5. **New chat** for a clean slate.

## Swap to on-prem later

Provider surface in [`lib/gemini.ts`](lib/gemini.ts): `generateLite`, `generateBrief`, `reviseNotes`, `compactNotes`, `generateCanvasEdit`.

## Security

`.env.local` is gitignored. Do not commit API keys.
