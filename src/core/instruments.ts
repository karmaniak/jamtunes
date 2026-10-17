/**
 * Instrument registry. The arranger only knows track *roles*; this table maps
 * a role to a concrete sound source and its GM program (for MIDI export).
 *
 * Sources are pluggable. Today: General MIDI soundfonts and a sampled drum
 * machine. A future `vst` kind would point at a WASM/host-bridged plugin and
 * the rest of the app would not change — the sheet and the MIDI events are
 * the contract.
 */
import type { TrackId } from "./sheet/model";

export type InstrumentSource =
  | { kind: "soundfont"; name: string; kit?: "FluidR3_GM" | "MusyngKite" }
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
}

export const INSTRUMENTS: InstrumentDef[] = [
  { id: "piano", label: "Piano", role: "piano", source: { kind: "soundfont", name: "acoustic_grand_piano" }, gmProgram: 0, range: [48, 84], gain: 1 },
  { id: "epiano", label: "Electric piano", role: "piano", source: { kind: "soundfont", name: "electric_piano_1" }, gmProgram: 4, range: [48, 84], gain: 1 },
  { id: "guitarClean", label: "Clean electric guitar", role: "guitar", source: { kind: "soundfont", name: "electric_guitar_clean" }, gmProgram: 27, range: [40, 76], gain: 0.9 },
  { id: "guitarSteel", label: "Acoustic guitar", role: "guitar", source: { kind: "soundfont", name: "acoustic_guitar_steel" }, gmProgram: 25, range: [40, 76], gain: 1 },
  { id: "guitarNylon", label: "Nylon guitar", role: "guitar", source: { kind: "soundfont", name: "acoustic_guitar_nylon" }, gmProgram: 24, range: [40, 76], gain: 1 },
  { id: "guitarDist", label: "Distorted guitar", role: "distGuitar", source: { kind: "soundfont", name: "distortion_guitar" }, gmProgram: 30, range: [40, 70], gain: 0.8 },
  { id: "guitarOverdrive", label: "Overdriven guitar", role: "distGuitar", source: { kind: "soundfont", name: "overdriven_guitar" }, gmProgram: 29, range: [40, 70], gain: 0.8 },
  { id: "bass", label: "Finger bass", role: "bass", source: { kind: "soundfont", name: "electric_bass_finger" }, gmProgram: 33, range: [28, 55], gain: 1.1 },
  { id: "bassPick", label: "Pick bass", role: "bass", source: { kind: "soundfont", name: "electric_bass_pick" }, gmProgram: 34, range: [28, 55], gain: 1.1 },
  { id: "bassUpright", label: "Upright bass", role: "bass", source: { kind: "soundfont", name: "acoustic_bass" }, gmProgram: 32, range: [28, 55], gain: 1.1 },
  { id: "drums", label: "Basic kit (TR-808)", role: "drums", source: { kind: "drummachine", name: "TR-808" }, gmProgram: 0, range: [35, 59], gain: 1 },
  { id: "drumsLM2", label: "Basic kit (LM-2)", role: "drums", source: { kind: "drummachine", name: "LM-2" }, gmProgram: 0, range: [35, 59], gain: 1 },
];

export function instrumentById(id: string): InstrumentDef {
  const found = INSTRUMENTS.find((i) => i.id === id);
  if (!found) throw new Error(`Unknown instrument: ${id}`);
  return found;
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
