# Two-lane LLM demo

Local prototype for cofounder demos. The core mix is:

- **Consult** — short answers on a clean spine  
- **Elaborate** — disposable deep read on one answer  
- **Grounding** — writable ground-truth doc you cross-check (and chat can patch)

Gemini is a disposable stand-in for an on-prem model. Discuss was removed as a separate lane — Grounding is the only sediment surface.

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
- **Grounding** opens the ground-truth document beside consult

### Elaborate → Grounding

Briefs are deep reads, not source of truth. From an open brief, add keepers into Grounding:

- **Half** — bottom line + open questions  
- **Full** — bottom line + open questions + detail/depends into notes  

Then continue editing Grounding (manually or via chat).

### Grounding (ground-truth lane)

1. Click **Grounding** on an answer (or reopen from the header) — opens for **reading**; chat still consults
2. Doc seeds with **Bottom line / Decisions / Open questions / Notes**
3. Edit with the toolbar yourself, or click **Edit with chat** to arm the composer
4. While armed, sky chrome shows on header + composer; turns patch the doc (no Elaborate chips on those replies)
5. **Back to consult** / **Stop editing** disarms — Grounding can stay open while you ask normal questions
6. When you settle something in chat, the model should move it into **Decisions** and clear it from **Open questions**
7. Status chrome shows `N decided · M open`
8. Hide anytime — the doc persists with the session until **New chat**

Persistence: `two-lane-session-v7` (consult + grounding + edit-armed flag).

## Models

| Job | Model | Notes |
|---|---|---|
| Lite / grounding turns | `gemini-3.5-flash-lite` | High free-tier volume |
| Brief | `gemini-3.8-flash` | Use sparingly in demos |
| 429 fallback | `gemma-4-31b-it` | High RPD, tight TPM |
| Offline / errors | in-memory mock | Same JSON shapes |

## Demo script

1. Click a starter (and maybe a chip follow-up).
2. **Elaborate** — skim angles; **Half → Grounding** (or **Full**).
3. With Grounding open (still consulting), arm **Edit with chat**, then ask to lock a decision or add an open question.
4. Disarm and ask a normal consult question — Grounding stays visible.
5. Edit the doc yourself; confirm the status chips move.
6. **New chat** for a clean slate.

## Swap to on-prem later

Provider surface in [`lib/gemini.ts`](lib/gemini.ts): `generateLite`, `generateBrief`, `reviseNotes`, `compactNotes`, `generateCanvasEdit`.

## Security

`.env.local` is gitignored. Do not commit API keys.
