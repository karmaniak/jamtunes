# JamTunes

Chord-sheet-first jam track generator. Tell it a progression and a feel; it
builds a MIDI backing track (piano, clean guitar, distorted guitar, bass,
basic kit) that you can loop and jam over. No keyboards, no piano rolls —
the chord sheet is the instrument.

- **Quick progression syntax** — `Am F C G`, `| Dm7 G7 | Cmaj7 |`, `E . . . A . B7 .`, `[Chorus] x2`
- **Paste Ultimate-Guitar style sheets** (chords over lyrics, `[Section]` headers, inline `[C]chords`) or give a UG link
- **Styles**: rock, pop, ballad, funk, blues shuffle, jazz swing, bossa — each a data-defined set of rhythm patterns per meter
- **Plug-and-play modes**: switch Lydian → Mixolydian and every chord is re-derived by scale degree
- **Chat for vibe & tasks** ("moody 6/8 ballad in D dorian, 80 bpm"). The assistant only ever emits *sheet changes*; all notes come from the deterministic arranger. Works offline with a rule-based interpreter.
- **Export .mid** (format 1, GM programs) for any DAW

## Run

```bash
npm install
cp .env.example .env          # optional: add ANTHROPIC_API_KEY for free-form chat
npm run dev                   # web on :5173, api on :8787
```

Samples (General MIDI soundfonts + a TR-808 kit) stream from public CDNs on first play and are cached by the browser.

```bash
npm test          # unit tests for theory, parsers, arranger, MIDI writer
npm run build     # typecheck + production bundle in dist/
npm start         # serve dist/ + api from one process
```

## How it's put together

```
src/core/                 pure TypeScript, no DOM, fully unit-tested
  theory/   notes, chord-symbol parser, modes/diatonic chords, key detection
  sheet/    ChordSheet model (the source of truth) + pure transforms
  parse/    quick syntax, UG-style text, sheet builders
  arrange/  voicing engine, rhythm-pattern DSL, style presets, arranger → Timeline
  midi/     Standard MIDI File writer
  chat/     typed SheetChanges contract + offline interpreter
  instruments.ts  registry: role → sound source (soundfont / drum machine / future vst)
src/audio/engine.ts       Web Audio look-ahead scheduler over sampled instruments
src/ui/                   React: transport, chord sheet, input panel, mixer, chat
server/                   Express: /api/chat (Claude, structured output) and /api/ug
```

Data flow: **parsers → ChordSheet → transforms → arranger → Timeline → {audio engine, MIDI file}**.

### Designed to evolve

The sheet is the contract, and every chord slot carries optional layers:

| Layer / hook                       | Where                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| Lyrics                             | `ChordSlot.lyric`, rendered by the lyrics layer in `SheetView`                  |
| Voicing options                    | `ChordSlot.voicing` (`close/open/shell/rootless/power`) → `arrange/voicing.ts`  |
| Rhythm nuance                      | `ChordSlot.rhythm` / `TrackSettings.pattern` using the step DSL in `patterns.ts` |
| Modal progressions                 | `transforms.setMode` → `scales.mapChordToMode` (degree-preserving)              |
| Per-section feel                   | `Section.ext.style`, `Section.ext.swing` honoured by the arranger               |
| New styles                         | add an entry to `STYLES` (patterns are one-bar strings per meter)                |
| New sound sources                  | add an `InstrumentDef`; `source.kind: "vst"` is reserved for plugin hosting      |
| New sheet layers in the UI         | add a renderer to `LAYERS` in `SheetView.tsx`                                   |
| Anything else                      | `ext` bags on sheet / section / bar / slot                                       |

### Rhythm pattern DSL (one bar, one char per step)

Comping: `X` accent · `x` hit · `o` soft · `b` bass note · `t` upper voices · `1-9` arpeggio index · `-` sustain · `.` rest
Bass: `R r` root · `8` octave · `L` low fifth · `3 5 6 7` chord tones · `A a` approach next root · `-` · `.`
Drums: one string per drum (`kick`, `snare`, `hhClosed`, `ride`, …) with `X x o .`

### Principles

- Never generate audio or notes with a model: the LLM emits sheet-level intent, the arranger turns music theory into MIDI.
- Nothing in the UI exposes individual notes. (`?debug=notes` prints a text summary of the generated events for debugging only.)
- Deterministic: the same sheet always renders the same track, in the browser and in the exported file.
