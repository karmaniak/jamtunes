/**
 * Instrument registry. The arranger only knows track *roles*; this table maps
 * a role to a concrete sound source, its GM program (for MIDI export) and the
 * performance parameters that make it sit right in a mix.
 *
 * Sources are pluggable. The browser can't host native VST plugins, so the
 * sound sources are the best freely-hosted sample libraries loadable in a
 * page (Splendid Grand, Greg Sullivan e-pianos, Smolken double bass, LinnDrum,
 * MusyngKite GM). A future `vst` kind would point at a WASM/host-bridged
 * plugin and nothing else in the app changes — the sheet and the MIDI events
 * are the contract.
 */
import type { TrackId } from "./sheet/model";

export type InstrumentSource =
  | { kind: "soundfont"; name: string; kit: "FluidR3_GM" | "MusyngKite" }
  | { kind: "splendid" } // Splendid Grand Piano: multi-velocity sampled Steinway
  | { kind: "epiano"; name: "CP80" | "WurlitzerEP200" | "PianetT" | "TX81Z" }
  | { kind: "smolken"; name: "Pizzicato" | "Arco" } // sampled double bass
  | { kind: "drummachine"; name: string }
  | { kind: "vst"; uri: string }; // placeholder for open-source plugin hosting

export interface InstrumentDef {
  id: string;
  label: string;
  role: TrackId;
  source: InstrumentSource;
  /** General MIDI program number (0-based) for export; drums use channel 10. */
  gmProgram: number;
  /** Comfortable MIDI range [low, high] used by the voicing engine. */
  range: [number, number];
  /** Output gain trim so instruments sit together without a mixer fight. */
  gain: number;
  /** Amplitude release in seconds applied to every note (the "tail"). */
  release: number;
  /** Sample attack compensation: schedule this many ms early so hits land on the grid. */
  attackMs: number;
  /** Velocity range the arranger's 1..127 is mapped into (keeps samples in their sweet spot). */
  velocity: [number, number];
  /** Stereo position -1..1. */
  pan: number;
  /** Reverb send 0..1. */
  reverb: number;
}

const SF = (name: string): InstrumentSource => ({ kind: "soundfont", name, kit: "MusyngKite" });

export const INSTRUMENTS: InstrumentDef[] = [
  // Keys
  { id: "piano", label: "Grand piano", role: "piano", source: { kind: "splendid" }, gmProgram: 0, range: [48, 84], gain: 0.9, release: 0.5, attackMs: 4, velocity: [40, 112], pan: -0.15, reverb: 0.25 },
  { id: "epiano", label: "Electric piano (CP80)", role: "piano", source: { kind: "epiano", name: "CP80" }, gmProgram: 2, range: [48, 84], gain: 0.9, release: 0.45, attackMs: 4, velocity: [40, 115], pan: -0.15, reverb: 0.25 },
  { id: "wurli", label: "Wurlitzer", role: "piano", source: { kind: "epiano", name: "WurlitzerEP200" }, gmProgram: 4, range: [48, 84], gain: 0.9, release: 0.4, attackMs: 4, velocity: [45, 118], pan: -0.15, reverb: 0.2 },
  // Guitars
  { id: "guitarClean", label: "Clean electric", role: "guitar", source: SF("electric_guitar_clean"), gmProgram: 27, range: [40, 76], gain: 0.85, release: 0.35, attackMs: 6, velocity: [50, 110], pan: 0.3, reverb: 0.3 },
  { id: "guitarJazz", label: "Jazz electric", role: "guitar", source: SF("electric_guitar_jazz"), gmProgram: 26, range: [40, 76], gain: 0.85, release: 0.3, attackMs: 6, velocity: [45, 105], pan: 0.3, reverb: 0.25 },
  { id: "guitarSteel", label: "Acoustic steel", role: "guitar", source: SF("acoustic_guitar_steel"), gmProgram: 25, range: [40, 76], gain: 0.9, release: 0.4, attackMs: 6, velocity: [50, 115], pan: 0.3, reverb: 0.3 },
  { id: "guitarNylon", label: "Nylon", role: "guitar", source: SF("acoustic_guitar_nylon"), gmProgram: 24, range: [40, 76], gain: 0.95, release: 0.4, attackMs: 6, velocity: [50, 110], pan: 0.3, reverb: 0.3 },
  { id: "guitarDist", label: "Distorted", role: "distGuitar", source: SF("distortion_guitar"), gmProgram: 30, range: [40, 70], gain: 0.7, release: 0.12, attackMs: 5, velocity: [85, 127], pan: -0.35, reverb: 0.12 },
  { id: "guitarOverdrive", label: "Overdriven", role: "distGuitar", source: SF("overdriven_guitar"), gmProgram: 29, range: [40, 70], gain: 0.7, release: 0.15, attackMs: 5, velocity: [80, 125], pan: -0.35, reverb: 0.15 },
  // Bass
  { id: "bass", label: "Finger bass", role: "bass", source: SF("electric_bass_finger"), gmProgram: 33, range: [28, 55], gain: 1.0, release: 0.15, attackMs: 8, velocity: [70, 118], pan: 0, reverb: 0.03 },
  { id: "bassPick", label: "Pick bass", role: "bass", source: SF("electric_bass_pick"), gmProgram: 34, range: [28, 55], gain: 1.0, release: 0.12, attackMs: 6, velocity: [75, 122], pan: 0, reverb: 0.03 },
  { id: "bassUpright", label: "Upright (pizzicato)", role: "bass", source: { kind: "smolken", name: "Pizzicato" }, gmProgram: 32, range: [28, 55], gain: 1.0, release: 0.25, attackMs: 10, velocity: [60, 115], pan: 0, reverb: 0.08 },
  // Drums
  { id: "drums", label: "Linn kit (LM-2)", role: "drums", source: { kind: "drummachine", name: "LM-2" }, gmProgram: 0, range: [35, 59], gain: 0.9, release: 0, attackMs: 2, velocity: [50, 127], pan: 0, reverb: 0.18 },
  { id: "drums808", label: "808 kit", role: "drums", source: { kind: "drummachine", name: "TR-808" }, gmProgram: 0, range: [35, 59], gain: 0.9, release: 0, attackMs: 2, velocity: [60, 127], pan: 0, reverb: 0.1 },
  { id: "drumsCR", label: "CR-8000 kit", role: "drums", source: { kind: "drummachine", name: "Roland CR-8000" }, gmProgram: 0, range: [35, 59], gain: 0.9, release: 0, attackMs: 2, velocity: [55, 127], pan: 0, reverb: 0.15 },
];

export const DEFAULT_INSTRUMENT: Record<TrackId, string> = { piano: "piano", guitar: "guitarClean", distGuitar: "guitarDist", bass: "bass", drums: "drums" };

export function instrumentById(id: string): InstrumentDef {
  const found = INSTRUMENTS.find((i) => i.id === id);
  if (!found) throw new Error(`Unknown instrument: ${id}`);
  return found;
}

/** Tolerant lookup for data saved by older versions. */
export function instrumentFor(role: TrackId, id: string | undefined): InstrumentDef {
  const found = id ? INSTRUMENTS.find((i) => i.id === id && i.role === role) : undefined;
  return found ?? instrumentById(DEFAULT_INSTRUMENT[role]);
}

export function instrumentsForRole(role: TrackId): InstrumentDef[] {
  return INSTRUMENTS.filter((i) => i.role === role);
}

/** General MIDI percussion numbers used by the drum patterns. */
export const GM_DRUMS = {
  kick: 36,
  snare: 38,
  rim: 37,
  clap: 39,
  hhClosed: 42,
  hhPedal: 44,
  hhOpen: 46,
  crash: 49,
  ride: 51,
  rideBell: 53,
  tomLow: 45,
  tomMid: 47,
  tomHigh: 50,
  cowbell: 56,
  shaker: 70,
} as const;
export type DrumName = keyof typeof GM_DRUMS;
