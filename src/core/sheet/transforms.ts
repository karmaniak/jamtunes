/**
 * Sheet -> sheet transforms. Pure, never mutate input. These are the
 * "evolution" hooks: modal swaps, transposition, re-arrangement. New
 * transforms (reharmonisation, voicing passes, rhythm variations) slot in
 * here with the same signature.
 */
import { parseChord, respellChord } from "../theory/chords";
import { mod12, noteToPc, pcToName, preferredAccidental } from "../theory/notes";
import { mapChordToMode, MODE_NAMES, type ModeName } from "../theory/scales";
import { styleById } from "../arrange/styles";
import { instrumentById } from "../instruments";
import { cloneSheet, TRACK_IDS, type ChordSheet, type ChordSlot, type TrackId, type TrackSettings } from "./model";

export type SheetTransform = (sheet: ChordSheet) => ChordSheet;

function mapSlots(sheet: ChordSheet, fn: (slot: ChordSlot) => ChordSlot): ChordSheet {
  const out = cloneSheet(sheet);
  for (const section of out.sections) for (const bar of section.bars) bar.slots = bar.slots.map(fn);
  return out;
}

/** Transpose every chord (and the key) by semitones, re-spelling for the new key. */
export function transposeSheet(sheet: ChordSheet, semitones: number): ChordSheet {
  const tonicPc = noteToPc(sheet.key.tonic) ?? 0;
  const newTonicPc = mod12(tonicPc + semitones);
  const minorish = ["aeolian", "dorian", "phrygian", "locrian"].includes(sheet.key.mode);
  const prefer = preferredAccidental(newTonicPc, minorish);
  const out = mapSlots(sheet, (slot) => {
    const chord = parseChord(slot.symbol);
    if (!chord) return slot;
    const root = pcToName(mod12(chord.rootPc + semitones), prefer);
    const bass = chord.bassPc !== undefined ? pcToName(mod12(chord.bassPc + semitones), prefer) : undefined;
    return { ...slot, symbol: respellChord(chord, root, bass) };
  });
  out.key = { ...out.key, tonic: pcToName(newTonicPc, prefer) };
  return out;
}

/** Move to a new tonic, keeping the mode. */
export function setTonic(sheet: ChordSheet, tonic: string): ChordSheet {
  const from = noteToPc(sheet.key.tonic) ?? 0;
  const to = noteToPc(tonic);
  if (to === null) return sheet;
  return transposeSheet(sheet, mod12(to - from) <= 6 ? mod12(to - from) : mod12(to - from) - 12);
}

/** Plug-and-play modal swap: reinterpret each chord's scale degree in the target mode. */
export function setMode(sheet: ChordSheet, toMode: ModeName): ChordSheet {
  if (!MODE_NAMES.includes(toMode) || toMode === sheet.key.mode) return sheet;
  const tonicPc = noteToPc(sheet.key.tonic) ?? 0;
  const out = mapSlots(sheet, (slot) => ({ ...slot, symbol: mapChordToMode(slot.symbol, tonicPc, sheet.key.mode, toMode, sheet.key.tonic).symbol }));
  out.key = { ...out.key, mode: toMode };
  return out;
}

/** Relabel the key without changing chords (user says "actually this is D dorian"). */
export function relabelKey(sheet: ChordSheet, tonic: string, mode: ModeName): ChordSheet {
  const out = cloneSheet(sheet);
  out.key = { tonic, mode };
  return out;
}

/** Apply a style preset: patterns, swing, default track enables, preferred instruments. */
export function setStyle(sheet: ChordSheet, styleId: string, opts: { keepTempo?: boolean } = {}): ChordSheet {
  const style = styleById(styleId);
  const out = cloneSheet(sheet);
  out.arrangement.style = style.id;
  out.arrangement.swing = style.swing;
  if (!opts.keepTempo) out.tempo = style.defaultTempo;
  for (const id of TRACK_IDS) {
    const t = out.arrangement.tracks[id];
    if (style.tracks[id] !== undefined) t.enabled = style.tracks[id] as boolean;
    const preferred = style.instruments?.[id];
    if (preferred) t.instrument = preferred;
    else t.instrument = defaultInstrumentFor(id, t.instrument);
    t.voicing = undefined; // fall back to the style's voicing preference
    t.pattern = undefined;
  }
  return out;
}

function defaultInstrumentFor(id: TrackId, current: string): string {
  const defaults: Record<TrackId, string> = { piano: "piano", guitar: "guitarClean", distGuitar: "guitarDist", bass: "bass", drums: "drums" };
  try {
    return instrumentById(current).role === id ? defaults[id] : defaults[id];
  } catch {
    return defaults[id];
  }
}

export function updateTrack(sheet: ChordSheet, id: TrackId, patch: Partial<TrackSettings>): ChordSheet {
  const out = cloneSheet(sheet);
  out.arrangement.tracks[id] = { ...out.arrangement.tracks[id], ...patch };
  return out;
}

export function setTempo(sheet: ChordSheet, tempo: number): ChordSheet {
  const out = cloneSheet(sheet);
  out.tempo = Math.max(30, Math.min(300, Math.round(tempo)));
  return out;
}

export function setSwing(sheet: ChordSheet, swing: number): ChordSheet {
  const out = cloneSheet(sheet);
  out.arrangement.swing = Math.max(0, Math.min(1, swing));
  return out;
}

/** Replace one chord symbol in place (inline editing in the sheet view). */
export function setSlotSymbol(sheet: ChordSheet, slotId: string, symbol: string): ChordSheet {
  return mapSlots(sheet, (slot) => (slot.id === slotId ? { ...slot, symbol: symbol.trim() } : slot));
}

export function setSlotLyric(sheet: ChordSheet, slotId: string, lyric: string): ChordSheet {
  return mapSlots(sheet, (slot) => (slot.id === slotId ? { ...slot, lyric: lyric || undefined } : slot));
}

export function setSlotVoicing(sheet: ChordSheet, slotId: string, voicing: ChordSlot["voicing"]): ChordSheet {
  return mapSlots(sheet, (slot) => (slot.id === slotId ? { ...slot, voicing } : slot));
}

export function setSectionRepeat(sheet: ChordSheet, sectionId: string, repeat: number): ChordSheet {
  const out = cloneSheet(sheet);
  const s = out.sections.find((x) => x.id === sectionId);
  if (s) s.repeat = Math.max(1, Math.min(16, Math.round(repeat)));
  return out;
}

export function compose(...fns: SheetTransform[]): SheetTransform {
  return (sheet) => fns.reduce((s, f) => f(s), sheet);
}
