/**
 * Guitar chord shapes, computed rather than looked up, so every symbol the
 * parser understands gets a diagram. Searches fingerings within a four-fret
 * window and scores them the way a player would choose: lowest position,
 * fewest muted strings, fewest fingers, bass note on the lowest sounding
 * string, all essential tones present. Reproduces the canonical open and
 * barre shapes (C = x32010, F = 133211, Bm = x24432 …).
 */
import { mod12 } from "./notes";
import type { Chord } from "./chords";

/** Standard tuning, low to high, MIDI numbers. */
export const TUNING = [40, 45, 50, 55, 59, 64];

export interface GuitarShape {
  /** Per string, low E first: fret number, 0 = open, -1 = muted. */
  frets: number[];
  /** Lowest fretted fret (1 = open position). */
  position: number;
  /** Barre across strings [from, to] at `position`, if any. */
  barre?: { fret: number; from: number; to: number };
  /** Pitch classes that couldn't be fitted (shown as a caveat). */
  missing: number[];
}

const cache = new Map<string, GuitarShape | null>();

export function guitarShape(chord: Chord): GuitarShape | null {
  const key = `${chord.rootPc}:${chord.intervals.join(",")}:${chord.bassPc ?? ""}`;
  if (cache.has(key)) return cache.get(key)!;
  const shape = search(chord);
  cache.set(key, shape);
  return shape;
}

function search(chord: Chord): GuitarShape | null {
  const pcs = new Set(chord.intervals.map((i) => mod12(chord.rootPc + i)));
  const bass = chord.bassPc ?? chord.rootPc;
  const third = [3, 4, 5, 2].find((i) => chord.intervals.includes(i));
  const seventh = [10, 11, 9].find((i) => chord.intervals.includes(i) && (chord.hasSeventh || i === 9));
  const fifth = [7, 6, 8].find((i) => chord.intervals.includes(i));
  const extension = [21, 20, 18, 17, 15, 14, 13].find((i) => chord.intervals.includes(i));
  const required: number[] = [chord.rootPc];
  if (third !== undefined) required.push(mod12(chord.rootPc + third));
  if (seventh !== undefined) required.push(mod12(chord.rootPc + seventh));
  // Triads need their fifth; richer chords may drop it (C7 = x32310 has no G).
  const fifthPc = fifth !== undefined ? mod12(chord.rootPc + fifth) : null;
  if (fifthPc !== null && chord.intervals.length <= 3) required.push(fifthPc);
  const optional: number[] = [];
  if (fifthPc !== null && !required.includes(fifthPc)) optional.push(fifthPc);
  if (extension !== undefined) optional.push(mod12(chord.rootPc + extension));

  let best: { shape: GuitarShape; score: number } | null = null;

  for (let p = 0; p <= 9; p++) {
    const lo = Math.max(1, p);
    const hi = p + 3;
    const openAllowed = p <= 2;
    const options: number[][] = TUNING.map((open) => {
      const opts = [-1];
      if (openAllowed && pcs.has(mod12(open))) opts.push(0);
      for (let f = lo; f <= hi; f++) if (pcs.has(mod12(open + f))) opts.push(f);
      return opts;
    });
    const frets = new Array<number>(6).fill(-1);
    const walk = (s: number) => {
      if (s === 6) {
        const scored = evaluate(frets, bass, required, optional);
        if (scored && (!best || scored.score < best.score)) best = scored;
        return;
      }
      for (const f of options[s]) {
        frets[s] = f;
        walk(s + 1);
      }
    };
    walk(0);
  }
  return best ? (best as { shape: GuitarShape }).shape : null;
}

function evaluate(frets: number[], bass: number, required: number[], optional: number[]): { shape: GuitarShape; score: number } | null {
  // Muted strings only below the bass (no inner mutes in v1), at least 3 strings sounding.
  let firstSounding = frets.findIndex((f) => f >= 0);
  if (firstSounding < 0) return null;
  for (let s = firstSounding; s < 6; s++) if (frets[s] < 0) return null;
  const sounding = 6 - firstSounding;
  if (sounding < 3) return null;
  if (mod12(TUNING[firstSounding] + frets[firstSounding]) !== bass) return null;

  const present = new Set<number>();
  for (let s = firstSounding; s < 6; s++) present.add(mod12(TUNING[s] + frets[s]));
  for (const pc of required) if (!present.has(pc)) return null;
  const missing = optional.filter((pc) => !present.has(pc));

  const fretted = frets.filter((f) => f > 0);
  const minFret = fretted.length ? Math.min(...fretted) : 0;
  const maxFret = fretted.length ? Math.max(...fretted) : 0;
  if (maxFret - minFret > 3) return null;
  const opens = frets.filter((f) => f === 0).length;
  // Open strings belong to open position: no ringing opens against notes up the neck.
  if (opens > 0 && maxFret > 4) return null;
  // An open string sandwiched between fretted notes high on the neck is an awkward stretch.
  let interiorOpens = 0;
  if (maxFret >= 4) {
    for (let s = firstSounding + 1; s < 5; s++) if (frets[s] === 0 && frets[s - 1] > 0 && frets.slice(s + 1).some((f) => f > 0)) interiorOpens++;
  }
  const onMin = fretted.filter((f) => f === minFret).length;
  // A barre is only plausible with no open strings and when the index covers the lowest sounding string.
  const barreOk = opens === 0 && onMin >= 2 && frets[firstSounding] === minFret;
  const fingers = barreOk ? fretted.length - (onMin - 1) : fretted.length;
  if (fingers > 4) return null;
  // Fingers above a barre must be on higher frets than the barre (no reaching under it).
  if (barreOk) for (let s = firstSounding; s < 6; s++) if (frets[s] > 0 && frets[s] < minFret) return null;

  const position = minFret || 1;
  const score = position * 1.0 + (6 - sounding) * 1.5 + fingers * 0.5 + missing.length * 2 - sounding * 0.3 - opens * 0.2 + (barreOk ? 0.4 : 0) + interiorOpens * 1.2;
  const shape: GuitarShape = { frets: [...frets], position, missing };
  if (barreOk) {
    let from = firstSounding;
    let to = from;
    for (let s = 5; s >= firstSounding; s--) if (frets[s] === minFret) { to = s; break; }
    shape.barre = { fret: minFret, from, to };
  }
  return { shape, score };
}

/** Pitch classes for a piano diagram: root position chord tones from the root up. */
export function pianoChordNotes(chord: Chord, lowMidi = 48): number[] {
  const root = lowMidi + mod12(chord.rootPc - mod12(lowMidi));
  const notes = chord.intervals.map((i) => root + i);
  const bassNote = chord.bassPc !== undefined && chord.bassPc !== chord.rootPc ? root - 12 + mod12(chord.bassPc - chord.rootPc) : null;
  return bassNote !== null ? [bassNote, ...notes] : notes;
}
