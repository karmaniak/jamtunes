/**
 * The chord sheet is the thing the user looks at and the single source of
 * truth for everything that gets played. Every other module is a function of
 * it: parsers produce it, transforms map sheet -> sheet, the arranger turns it
 * into MIDI events, the UI renders it.
 *
 * Evolvability rules:
 *  - Each ChordSlot carries optional "layers" (lyric, voicing hint, rhythm
 *    override, annotations). New kinds of per-chord information are added as
 *    new optional fields or as entries in `ext`, never by changing `symbol`.
 *  - Sections and the sheet itself also carry `ext` bags for future layers
 *    (e.g. per-section groove, dynamics, form repeats with endings).
 *  - Arrangement settings live beside the sheet, not inside the chords, so the
 *    same sheet can be re-arranged without touching the progression.
 */
import type { ModeName } from "../theory/scales";
import { uid } from "../util/random";

export interface TimeSignature {
  beats: number; // beats per bar (numerator)
  unit: number; // beat unit (denominator), 4 or 8
}

export interface KeySpec {
  tonic: string; // e.g. "D"
  mode: ModeName;
}

/** How the arranger should voice this chord. Extend freely. */
export type VoicingHint = "auto" | "close" | "open" | "shell" | "power" | "rootless";

export interface ChordSlot {
  id: string;
  /** Chord symbol as displayed, e.g. "Am7", "G/B", "N.C.". */
  symbol: string;
  /** Duration in beats of the bar's time signature. */
  beats: number;
  /** Lyric fragment sung under this chord (layer: lyrics). */
  lyric?: string;
  /** Voicing preference (layer: voicings). */
  voicing?: VoicingHint;
  /** Per-slot rhythm override, a pattern id or inline pattern string (layer: rhythm). */
  rhythm?: string;
  /** Free-form future layers: e.g. { dynamics: "mf", accent: true }. */
  ext?: Record<string, unknown>;
}

export interface Bar {
  id: string;
  slots: ChordSlot[];
  ext?: Record<string, unknown>;
}

export interface Section {
  id: string;
  name: string; // "Verse", "Chorus", ...
  bars: Bar[];
  /** Play-through count. */
  repeat: number;
  /** Section-level overrides, e.g. { style: "ballad", swing: 0.3 }. */
  ext?: Record<string, unknown>;
}

export type TrackId = "piano" | "guitar" | "distGuitar" | "bass" | "drums";
export const TRACK_IDS: TrackId[] = ["piano", "guitar", "distGuitar", "bass", "drums"];

export interface TrackSettings {
  enabled: boolean;
  /** 0..1 */
  volume: number;
  /** Instrument id from the instrument registry. */
  instrument: string;
  /** Pattern id override; undefined = style default. */
  pattern?: string;
  voicing?: VoicingHint;
  /** 0 = simple, 0.5 = the style as written, 1 = busy. Undefined = 0.5. */
  complexity?: number;
}

export interface Arrangement {
  style: string;
  /** 0 = straight, 1 = full triplet swing on off-beats of straight patterns. */
  swing: number;
  /** 0..1 amount of velocity/timing humanisation. */
  humanize: number;
  /** Bars of count-in before the loop. */
  countIn: number;
  tracks: Record<TrackId, TrackSettings>;
}

export interface ChordSheet {
  id: string;
  title: string;
  artist?: string;
  tempo: number;
  timeSignature: TimeSignature;
  key: KeySpec;
  sections: Section[];
  arrangement: Arrangement;
  /** Where the sheet came from (quick input, paste, UG url) for round-tripping. */
  source?: { kind: "quick" | "paste" | "url" | "chat"; text?: string; url?: string };
  ext?: Record<string, unknown>;
}

export const DEFAULT_TS: TimeSignature = { beats: 4, unit: 4 };

export function defaultArrangement(style = "rock"): Arrangement {
  return {
    style,
    swing: 0,
    humanize: 0.35,
    countIn: 1,
    // Default band is a trio — electric piano, bass, drums — so the jammer owns the guitar space.
    tracks: {
      piano: { enabled: true, volume: 0.8, instrument: "epiano" },
      guitar: { enabled: false, volume: 0.7, instrument: "guitarClean" },
      distGuitar: { enabled: false, volume: 0.6, instrument: "guitarDist" },
      bass: { enabled: true, volume: 0.9, instrument: "bass" },
      drums: { enabled: true, volume: 0.9, instrument: "drums" },
    },
  };
}

export function makeSlot(symbol: string, beats: number, extra: Partial<ChordSlot> = {}): ChordSlot {
  return { id: uid("s"), symbol, beats, ...extra };
}

export function makeBar(slots: ChordSlot[]): Bar {
  return { id: uid("b"), slots };
}

export function makeSection(name: string, bars: Bar[], repeat = 1): Section {
  return { id: uid("sec"), name, bars, repeat };
}

export function emptySheet(): ChordSheet {
  return {
    id: uid("sheet"),
    title: "Untitled jam",
    tempo: 100,
    timeSignature: { ...DEFAULT_TS },
    key: { tonic: "C", mode: "ionian" },
    sections: [],
    arrangement: defaultArrangement(),
  };
}

/** Every chord symbol in play order (repeats not expanded). */
export function allSymbols(sheet: ChordSheet): string[] {
  return sheet.sections.flatMap((s) => s.bars.flatMap((b) => b.slots.map((sl) => sl.symbol)));
}

export function totalBars(sheet: ChordSheet, expandRepeats = true): number {
  return sheet.sections.reduce((n, s) => n + s.bars.length * (expandRepeats ? s.repeat : 1), 0);
}

/** Structural clone helper so transforms never mutate the sheet they received. */
export function cloneSheet(sheet: ChordSheet): ChordSheet {
  return structuredClone(sheet);
}

/**
 * Normalise a bar so its slot beats add up to the time signature: scale
 * proportionally when they don't. Keeps user intent (ratios) while keeping
 * the grid playable.
 */
export function normaliseBar(bar: Bar, ts: TimeSignature): Bar {
  const sum = bar.slots.reduce((n, s) => n + s.beats, 0);
  if (sum === ts.beats || sum === 0) return bar;
  const factor = ts.beats / sum;
  return { ...bar, slots: bar.slots.map((s) => ({ ...s, beats: s.beats * factor })) };
}
