# JamTunes

Chord-sheet-first jam track generator. Tell it a progression and a feel; it
builds a MIDI backing track (piano, clean guitar, distorted guitar, bass,
basic kit) that you can loop and jam over. No keyboards, no piano rolls —
the chord sheet is the instrument.

- **Quick progression syntax** — `Am F C G`, `| Dm7 G7 | Cmaj7 |`, `E . . . A . B7 .`, `[Chorus] x2`
- **Paste chord sheets** in the common chords-over-lyrics format (`[Section]` headers, inline `[C]chords`)
- **Chord reference**: a guitar grid and piano diagram for whatever chord is playing (computed for any symbol)
- **Styles**: rock, pop, ballad, funk, blues shuffle, jazz swing, bossa — each a data-defined set of rhythm patterns per meter
- **Plug-and-play modes**: switch Lydian → Mixolydian and every chord is re-derived by scale degree
- **Chat for vibe & tasks** ("moody 6/8 ballad in D dorian, 80 bpm"). The assistant only ever emits *sheet changes*; all notes come from the deterministic arranger. Works offline with a rule-based interpreter.
- **Export .mid** (format 1, GM programs) for any DAW

## Run

```bash
npm install
npm run dev                   # web on :5173, api on :8787
```

### The band's AI (operator setup — users configure nothing)

"Tell the band" works without any AI for tempo / style / key / mode / instruments / chord lists (a deterministic interpreter). Free-form requests ("moody 6/8 ballad in D dorian") go to a language model that you, the operator, configure once with environment variables. The default is **Claude Haiku 5.5** — about $0.0004 per request, ~2,500 requests per dollar:

```bash
cp .env.example .env
# ANTHROPIC_API_KEY=sk-ant-...   from https://console.anthropic.com
npm run dev                      # logs "chat: anthropic · claude-haiku-5-5"
```

Overrides: `AI_MODEL` (`claude-sonnet-5-5` / `claude-opus-5-5` for better answers at higher cost), or `AI_PROVIDER=openai-compatible` with `AI_BASE_URL` + `AI_API_KEY`/`HF_TOKEN` for any `/v1/chat/completions` endpoint (Hugging Face router, vLLM, Ollama, Together, Groq…). Every model reply is validated against the `SheetChanges` schema; anything malformed falls back to the local interpreter, so a weak model can never corrupt the sheet, and every chat reply ends with a receipt of what actually changed. Spend brakes: `AI_LIMIT_PER_MINUTE` (10) and `AI_LIMIT_PER_DAY` (60) per device, `AI_GLOBAL_PER_DAY` (5000, everyone combined), `AI_MAX_MESSAGE_CHARS` (2000). Set `AI_DEBUG=1` to log model replies when something looks off.

### Deploy

**Vercel** (static bundle + the two API routes as functions): import the GitHub repo, add `HF_TOKEN` in *Settings → Environment Variables*, deploy. `vercel.json` is included; a custom domain is one DNS record. Rate limits are per function instance (best-effort), which is fine while the backend is a free quota.

**Any Docker host** (Render, Railway, Fly): the `Dockerfile` serves app + API from one Node 22 process on port 8787 with the same env vars.

No database, no accounts: jams persist in the browser (current sheet, last 10 recent jams) and can be saved/opened as `.jam.json` files.

### Sounds

A web page can't host native VST plugins, so JamTunes streams the best freely-hosted sample libraries that load in a browser (cached after first play):

| Role    | Source                                                       |
| ------- | ------------------------------------------------------------ |
| Piano   | Splendid Grand Piano (multi-velocity Steinway), CP80 / Wurlitzer (Greg Sullivan) |
| Guitars | MusyngKite GM bank: clean, jazz, steel, nylon, overdrive, distortion |
| Bass    | MusyngKite finger / pick; Smolken sampled double bass (pizzicato) |
| Drums   | LinnDrum LM-2 (default), TR-808, CR-8000                      |

Performance finesse lives in the arranger and engine, not in user controls: legato overlaps and release tails, down/up strum direction, beat accents, bass slightly ahead and snare slightly behind the grid, 2-bar drum phrases, fills only into new sections, per-instrument velocity ranges, a reverb send and bus compression.

```bash
npm test          # unit tests for theory, parsers, arranger, MIDI writer
npm run build     # typecheck + production bundle in dist/
npm start         # serve dist/ + api from one process
```

## How it's put together

```
src/core/                 pure TypeScript, no DOM, fully unit-tested
  theory/   notes, chord-symbol parser, modes/diatonic chords, key detection
  sheet/    ChordSheet model (the source of truth), pure transforms, structural edits
  parse/    quick syntax, UG-style text, sheet builders
  arrange/  voicing engine, rhythm-pattern DSL, style presets, arranger → Timeline
  midi/     Standard MIDI File writer
  chat/     typed SheetChanges contract + offline interpreter
  instruments.ts  registry: role → sound source (soundfont / drum machine / future vst)
src/audio/engine.ts       Web Audio look-ahead scheduler over sampled instruments
src/ui/                   React: transport, chord sheet, input panel, mixer, chat
server/                   AI rails (provider interface, schema validation, rate limits) + Express dev server
api/                      Vercel functions wrapping the same handlers
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
