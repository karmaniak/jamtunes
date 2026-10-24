# JamTunes — working notes for agents

Chord-sheet-first jam track generator. Read `README.md` for the layout.

## Non-negotiables
- The **ChordSheet** (`src/core/sheet/model.ts`) is the single source of truth. Parsers produce it, transforms map it, the arranger consumes it. Don't make the UI or audio engine reason about chords directly.
- **No model-generated audio or notes.** Chat produces `SheetChanges` (`src/core/chat/intent.ts`) only. Music comes from `src/core/arrange/*`.
- **No note-level UI** (no keyboards, piano rolls, note editors). Per-chord controls are fine. The hidden `?debug=notes` text dump is the only exception; keep it unobtrusive.
- Arranger output must stay **deterministic** for a given sheet (seeded PRNG in `util/random.ts`).
- **The user owns the progression.** Every structural change (add/remove/split/resize blocks, bars, sections) must be reachable directly in the sheet view (`sheet/edit.ts` + `SheetView.tsx`) and undoable. Never make the chat or a parser the only way to change the sheet.
- **Sound finesse is not a user control.** Legato, release tails, strum direction, pocket timing, velocity ranges, reverb/compression live in `arrange/arranger.ts`, `instruments.ts` and `audio/engine.ts`. Don't expose attack/release/EQ knobs; make the defaults sound like stock music.

## Extending
- New style → add to `STYLES` in `arrange/styles.ts` (one-bar pattern strings per meter; see DSL in `patterns.ts`).
- New per-chord layer → optional field on `ChordSlot` (or `ext`), plus a renderer in `LAYERS` (`ui/components/SheetView.tsx`), plus arranger support if it affects playback.
- New transform → pure function in `sheet/transforms.ts`; expose via chat schema if the model should trigger it.
- New instrument → `InstrumentDef` in `instruments.ts`; audio loading lives in `audio/engine.ts`.

## Commands
- `npm test` — vitest (core only; keep core free of DOM/audio imports so it stays testable)
- `npm run typecheck` — web + server tsconfigs
- `npm run dev` — vite (5173) + express api (8787, proxied under /api)

## Chat backend
`server/ai.ts` holds the provider interface: `openai-compatible` (default; HF router + `Qwen/Qwen2.5-72B-Instruct`, any `/v1/chat/completions` endpoint via env) and `anthropic` (SDK structured outputs). Every reply is coerced + validated against `SheetChangesSchema`; failures fall back to `interpretLocally` client-side. Progressions from models are normalised (`normaliseProgression`), an empty parse never replaces the sheet, new progressions get an automatic title, and the UI appends `describeDiff` as a receipt — keep that: the model's "done" must never be the only signal. `server/handlers.ts` is framework-agnostic and shared by the Express dev server (`server/index.ts`) and the Vercel functions (`api/*.ts`). Rate limits live in `server/ratelimit.ts`. **Users never configure AI** — the operator sets env vars; don't add key/URL inputs to the UI.
- No Ultimate Guitar fetching (removed: bot-blocked and ToS-grey). Paste is the import path.
- Persistence is browser-only (`localStorage`: current sheet, recent jams, device id) plus `.jam.json` files. No accounts.
