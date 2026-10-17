/**
 * Modes, diatonic chords and modal reinterpretation.
 *
 * "Plug and play modal progressions": a progression is understood as scale
 * degrees relative to a tonic + mode. Swapping the mode (lydian -> mixolydian)
 * keeps the degrees and re-derives each chord's root and quality from the new
 * mode, so I-II-vii in Lydian becomes I-ii-bVII in Mixolydian.
 */
import { mod12, pcToName, preferredAccidental } from "./notes";
import { parseChord, symbolFor, type ChordQuality } from "./chords";

export const MODE_NAMES = [
  "ionian",
  "dorian",
  "phrygian",
  "lydian",
  "mixolydian",
  "aeolian",
  "locrian",
] as const;
export type ModeName = (typeof MODE_NAMES)[number];

export const MODE_LABELS: Record<ModeName, string> = {
  ionian: "Ionian (major)",
  dorian: "Dorian",
  phrygian: "Phrygian",
  lydian: "Lydian",
  mixolydian: "Mixolydian",
  aeolian: "Aeolian (minor)",
  locrian: "Locrian",
};

const MAJOR_STEPS = [2, 2, 1, 2, 2, 2, 1];

/** Semitone offsets of the 7 degrees of a mode from its tonic. */
export function modeIntervals(mode: ModeName): number[] {
  const start = MODE_NAMES.indexOf(mode);
  const steps = [...MAJOR_STEPS.slice(start), ...MAJOR_STEPS.slice(0, start)];
  const out = [0];
  for (let i = 0; i < 6; i++) out.push(out[i] + steps[i]);
  return out;
}

export function scalePcs(tonicPc: number, mode: ModeName): number[] {
  return modeIntervals(mode).map((i) => mod12(tonicPc + i));
}

export interface DiatonicChord {
  degree: number; // 0..6
  rootPc: number;
  quality: ChordQuality;
  seventh: "dom7" | "maj7" | "m7" | "m7b5";
  roman: string;
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

/** Triad + seventh quality for each degree of a mode, derived by stacking thirds. */
export function diatonicChords(tonicPc: number, mode: ModeName): DiatonicChord[] {
  const pcs = scalePcs(tonicPc, mode);
  return pcs.map((rootPc, degree) => {
    const third = mod12(pcs[(degree + 2) % 7] - rootPc);
    const fifth = mod12(pcs[(degree + 4) % 7] - rootPc);
    const seventh = mod12(pcs[(degree + 6) % 7] - rootPc);
    let quality: ChordQuality = "major";
    if (third === 3 && fifth === 6) quality = "dim";
    else if (third === 3) quality = "minor";
    else if (fifth === 8) quality = "aug";
    let sev: DiatonicChord["seventh"] = "dom7";
    if (quality === "major" && seventh === 11) sev = "maj7";
    else if (quality === "minor") sev = "m7";
    else if (quality === "dim") sev = "m7b5";
    const roman = quality === "major" || quality === "aug" ? ROMAN[degree] : ROMAN[degree].toLowerCase();
    const accidental = romanAccidental(degree, modeIntervals(mode)[degree]);
    return { degree, rootPc, quality, seventh: sev, roman: accidental + roman + (quality === "dim" ? "°" : "") };
  });
}

/** Mark degrees that are flattened/raised relative to the major scale (bVII, #IV). */
function romanAccidental(degree: number, interval: number): string {
  const major = modeIntervals("ionian")[degree];
  if (interval < major) return "b";
  if (interval > major) return "#";
  return "";
}

export interface DegreeMatch {
  degree: number;
  /** Semitone offset of the chord root from the mode's degree root (0 when diatonic). */
  offset: number;
}

/** Find which degree a root pitch class is nearest to in the given mode. Diatonic roots return offset 0. */
export function degreeOf(rootPc: number, tonicPc: number, mode: ModeName): DegreeMatch {
  const pcs = scalePcs(tonicPc, mode);
  const exact = pcs.indexOf(mod12(rootPc));
  if (exact >= 0) return { degree: exact, offset: 0 };
  // Chromatic root: attach to the degree just below it (e.g. bII sits on I with offset +1).
  const rel = mod12(rootPc - tonicPc);
  const intervals = modeIntervals(mode);
  let degree = 0;
  for (let i = 0; i < 7; i++) if (intervals[i] <= rel) degree = i;
  return { degree, offset: rel - intervals[degree] };
}

export interface ModalMapResult {
  symbol: string;
  changed: boolean;
}

/**
 * Reinterpret one chord symbol from (tonic, fromMode) to (tonic, toMode),
 * preserving scale degree. Diatonic chords take the new mode's quality;
 * extensions beyond the 7th and non-diatonic chords keep their suffix and are
 * only shifted by the degree's root change.
 */
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PCS = [0, 2, 4, 5, 7, 9, 11];

/** Spell a pitch class on a given letter (degree-correct spelling: Bb not A# for bVII in C). Null if it needs a double accidental. */
export function spellOnLetter(pc: number, letterIndex: number): string | null {
  const diff = mod12(pc - LETTER_PCS[letterIndex]);
  const acc = diff === 0 ? "" : diff === 1 ? "#" : diff === 11 ? "b" : null;
  return acc === null ? null : LETTERS[letterIndex] + acc;
}

/** Name for the root of `degree` (plus chromatic offset) in a key, spelled by letter. */
export function spellDegree(tonicPc: number, tonicName: string | undefined, mode: ModeName, degree: number, offset = 0): string {
  const letterIdx = tonicName ? LETTERS.indexOf(tonicName[0].toUpperCase()) : LETTERS.indexOf(pcToName(tonicPc, "sharp")[0]);
  const pc = mod12(scalePcs(tonicPc, mode)[degree] + offset);
  if (offset === 0 && letterIdx >= 0) {
    const spelled = spellOnLetter(pc, (letterIdx + degree) % 7);
    if (spelled) return spelled;
  }
  return pcToName(pc, offset > 0 ? "flat" : offset < 0 ? "sharp" : preferredAccidental(tonicPc));
}

export function mapChordToMode(symbol: string, tonicPc: number, fromMode: ModeName, toMode: ModeName, tonicName?: string): ModalMapResult {
  const chord = parseChord(symbol);
  if (!chord) return { symbol, changed: false };
  const { degree, offset } = degreeOf(chord.rootPc, tonicPc, fromMode);
  const fromDia = diatonicChords(tonicPc, fromMode)[degree];
  const toDia = diatonicChords(tonicPc, toMode)[degree];
  const newRootName = spellDegree(tonicPc, tonicName, toMode, degree, offset);
  let bassName: string | undefined;
  if (chord.bassPc !== undefined) {
    const b = degreeOf(chord.bassPc, tonicPc, fromMode);
    bassName = spellDegree(tonicPc, tonicName, toMode, b.degree, b.offset);
  }

  const isPlainDiatonic =
    offset === 0 &&
    chord.quality === fromDia.quality &&
    isSimpleSuffix(chord.suffix);

  let newSymbol: string;
  if (isPlainDiatonic) {
    const seventh = chord.hasSeventh ? toDia.seventh : "none";
    newSymbol = symbolFor(newRootName, toDia.quality, seventh);
  } else {
    newSymbol = `${newRootName}${chord.suffix}`;
  }
  if (bassName) newSymbol += `/${bassName}`;
  return { symbol: newSymbol, changed: newSymbol !== symbol };
}

/** Suffixes whose quality is fully described by the diatonic table (triads and plain sevenths). */
function isSimpleSuffix(suffix: string): boolean {
  return /^(|m|min|-|maj7|M7|Δ7|7|m7|min7|-7|dim|°|dim7|°7|m7b5|ø|ø7)$/.test(suffix);
}

/** Guess a tonic + mode from a bag of chord symbols. Scores every (tonic, mode) by diatonic fit. */
export function detectKey(symbols: string[]): { tonicPc: number; mode: ModeName } {
  const chords = symbols.map(parseChord).filter((c): c is NonNullable<typeof c> => c !== null);
  if (chords.length === 0) return { tonicPc: 0, mode: "ionian" };
  let best = { tonicPc: chords[0].rootPc, mode: "ionian" as ModeName, score: -Infinity };
  const candidateModes: ModeName[] = ["ionian", "aeolian", "dorian", "mixolydian", "lydian", "phrygian"];
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const mode of candidateModes) {
      const dia = diatonicChords(tonic, mode);
      let score = 0;
      chords.forEach((c, i) => {
        const weight = i === 0 ? 1.5 : 1; // first chord is often the tonic
        const d = dia.find((x) => x.rootPc === c.rootPc);
        if (!d) { score -= 2 * weight; return; }
        score += (d.quality === c.quality ? 2 : 0.5) * weight;
        if (d.degree === 0) score += 1.5 * weight;
      });
      // Mild bias toward the plain major/minor so modal guesses need evidence.
      if (mode === "ionian" || mode === "aeolian") score += 2;
      if (score > best.score) best = { tonicPc: tonic, mode, score };
    }
  }
  return { tonicPc: best.tonicPc, mode: best.mode };
}
