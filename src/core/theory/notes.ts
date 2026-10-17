/**
 * Note-name <-> pitch-class <-> MIDI helpers. Pure functions, no audio.
 *
 * Pitch classes are 0..11 with C = 0. MIDI numbers follow the convention
 * middle C (C4) = 60.
 */

export const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
export const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export const NOTE_RE = /^([A-Ga-g])(#{1,2}|b{1,2}|♯|♭|x)?/;

/** Parse a note name like "C", "F#", "Bb", "Ebb" into a pitch class. Returns null if invalid. */
export function noteToPc(name: string): number | null {
  const m = NOTE_RE.exec(name.trim());
  if (!m || m[0].length !== name.trim().length) return null;
  const letter = m[1].toUpperCase();
  const acc = m[2] ?? "";
  let pc = LETTER_PC[letter];
  for (const ch of acc) {
    if (ch === "#" || ch === "♯") pc += 1;
    else if (ch === "b" || ch === "♭") pc -= 1;
    else if (ch === "x") pc += 2;
  }
  return mod12(pc);
}

export function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

/** Spell a pitch class. `prefer` picks sharps or flats; defaults to flats for "flat keys" feel. */
export function pcToName(pc: number, prefer: "sharp" | "flat" = "flat"): string {
  return (prefer === "sharp" ? SHARP_NAMES : FLAT_NAMES)[mod12(pc)];
}

/** Which accidental family a key naturally uses (for re-spelling after transposition). */
export function preferredAccidental(tonicPc: number, minorish = false): "sharp" | "flat" {
  // Circle of fifths: sharps for G D A E B F#; flats for F Bb Eb Ab Db Gb. C is neutral -> sharp.
  const majorTonic = minorish ? mod12(tonicPc + 3) : tonicPc;
  return [5, 10, 3, 8, 1, 6].includes(majorTonic) ? "flat" : "sharp";
}

export function midiToName(midi: number, prefer: "sharp" | "flat" = "sharp"): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${pcToName(midi, prefer)}${octave}`;
}

/** Lowest MIDI note >= `min` with the given pitch class. */
export function pcAbove(pc: number, min: number): number {
  const base = Math.floor(min / 12) * 12 + mod12(pc);
  return base >= min ? base : base + 12;
}

/** Nearest MIDI note with pitch class `pc` to `target`. */
export function pcNearest(pc: number, target: number): number {
  const below = pcAbove(pc, target - 11);
  const above = below + 12;
  return Math.abs(target - below) <= Math.abs(above - target) ? below : above;
}

export function clampToRange(midi: number, lo: number, hi: number): number {
  let n = midi;
  while (n < lo) n += 12;
  while (n > hi) n -= 12;
  return n;
}
