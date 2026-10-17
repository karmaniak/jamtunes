# JamTunes — working notes for agents

Chord-sheet-first jam track generator. Read `README.md` for the layout.

## Non-negotiables
- The **ChordSheet** (`src/core/sheet/model.ts`) is the single source of truth. Parsers produce it, transforms map it, the arranger consumes it. Don't make the UI or audio engine reason about chords directly.
- **No model-generated audio or notes.** Chat produces `SheetChanges` (`src/core/chat/intent.ts`) only. Music comes from `src/core/arrange/*`.
- **No note-level UI** (no keyboards, piano rolls, note editors). Per-chord controls are fine. The hidden `?debug=notes` text dump is the only exception; keep it unobtrusive.
- Arranger output must stay **deterministic** for a given sheet (seeded PRNG in `util/random.ts`).

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
`server/chat.ts` uses `@anthropic-ai/sdk` `client.beta.messages.parse` with a Zod structured-output schema and `fallbacks: "default"`. Without `ANTHROPIC_API_KEY` the client falls back to `interpretLocally`.
