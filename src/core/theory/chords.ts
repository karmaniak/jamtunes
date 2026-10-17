/**
 * Chord symbol parser. Turns "F#m7b5/A" into a structured chord with
 * intervals (semitones above the root), so the rest of the system never has
 * to reason about symbol spelling again.
 *
 * Supported: major/minor/dim/aug/sus/power, 6, 7, maj7, 9, 11, 13, 6/9,
 * add tones, altered tones (b5 #5 b9 #9 #11 b13), half-diminished (ø / m7b5),
 * mMaj7, slash bass. Unknown trailing text makes the parse fail (returns null)
 * so chord-line detection in sheets stays reliable.
 */
import { noteToPc, NOTE_RE, mod12 } from "./notes";

export type ChordQuality = "major" | "minor" | "dim" | "aug" | "sus" | "power";

export interface Chord {
  /** Original text as the user wrote it. */
  symbol: string;
  /** Root as written, e.g. "F#". */
  rootName: string;
  rootPc: number;
  /** Bass note name when a slash chord, else undefined. */
  bassName?: string;
  bassPc?: number;
  quality: ChordQuality;
  /** Semitone offsets from root, ascending, deduped. Always includes 0. */
  intervals: number[];
  /** True if a 7th or higher extension is present. */
  hasSeventh: boolean;
  /** Normalised suffix after the root, e.g. "m7b5". Used when re-spelling. */
  suffix: string;
}

interface QualityState {
  third: number | null; // 4 major, 3 minor, null = sus/power
  fifth: number; // 7, 6 (b5), 8 (#5)
  extras: Set<number>;
  quality: ChordQuality;
  hasSeventh: boolean;
}

type Rule = [RegExp, (s: QualityState, m: RegExpExecArray) => void];

const RULES: Rule[] = [
  // Order matters: longer / more specific tokens first.
  [/^(maj|ma|M|Δ|△)(7|9|11|13)/, (s, m) => { s.extras.add(11); s.hasSeventh = true; addExtensions(s, Number(m[2]), 11); }],
  [/^(maj|ma|M|Δ|△)(?![a-z0-9])/, (s) => { s.extras.add(11); s.hasSeventh = true; }],
  [/^(mMaj7|mM7|m\(maj7\)|minMaj7|-Δ7|-M7)/, (s) => { s.third = 3; s.quality = "minor"; s.extras.add(11); s.hasSeventh = true; }],
  [/^(ø7?|m7b5|min7b5|-7b5)/, (s) => { s.third = 3; s.fifth = 6; s.quality = "dim"; s.extras.add(10); s.hasSeventh = true; }],
  [/^(dim7|°7|o7)/, (s) => { s.third = 3; s.fifth = 6; s.quality = "dim"; s.extras.add(9); s.hasSeventh = true; }],
  [/^(dim|°|o)(?![a-z])/, (s) => { s.third = 3; s.fifth = 6; s.quality = "dim"; }],
  [/^(aug|\+)/, (s) => { s.fifth = 8; s.quality = "aug"; }],
  [/^(min|mi|m|-)(?!aj)/, (s) => { s.third = 3; s.quality = "minor"; }],
  [/^sus2/, (s) => { s.third = null; s.extras.add(2); s.quality = "sus"; }],
  [/^sus(4)?/, (s) => { s.third = null; s.extras.add(5); s.quality = "sus"; }],
  [/^69|^6\/9/, (s) => { s.extras.add(9); s.extras.add(14); }],
  [/^6/, (s) => { s.extras.add(9); }],
  [/^(7|9|11|13)/, (s, m) => { s.extras.add(10); s.hasSeventh = true; addExtensions(s, Number(m[1]), 10); }],
  [/^5(?![0-9])/, (s) => { s.third = null; s.quality = "power"; }],
  [/^add(2|4|6|9|11|13)/, (s, m) => { s.extras.add(({ 2: 14, 4: 17, 6: 9, 9: 14, 11: 17, 13: 21 } as Record<number, number>)[Number(m[1])]); }],
  [/^\(?(b|♭|-)5\)?/, (s) => { s.fifth = 6; }],
  [/^\(?(#|♯|\+)5\)?/, (s) => { s.fifth = 8; }],
  [/^\(?(b|♭|-)9\)?/, (s) => { s.extras.delete(14); s.extras.add(13); }],
  [/^\(?(#|♯|\+)9\)?/, (s) => { s.extras.delete(14); s.extras.add(15); }],
  [/^\(?(#|♯|\+)11\)?/, (s) => { s.extras.delete(17); s.extras.add(18); }],
  [/^\(?(b|♭|-)13\)?/, (s) => { s.extras.delete(21); s.extras.add(20); }],
  [/^\(?(b|♭|-)6\)?/, (s) => { s.extras.add(8); }],
  [/^alt/, (s) => { s.fifth = 6; s.extras.add(10); s.extras.add(13); s.extras.add(15); s.hasSeventh = true; }],
  [/^[()\s]/, () => { /* ignore stray parens/space */ }],
];

function addExtensions(s: QualityState, ext: number, seventh: number) {
  s.extras.add(seventh);
  if (ext >= 9) s.extras.add(14);
  if (ext >= 11) s.extras.add(17);
  if (ext >= 13) s.extras.add(21);
  // Dominant 13 chords conventionally omit the 11.
  if (ext === 13 && seventh === 10) s.extras.delete(17);
}

const CHORD_TOKEN_RE = /^[A-Ga-g](?:#{1,2}|b{1,2}|♯|♭)?[^\s|/]*(?:\/[A-Ga-g](?:#|b|♯|♭)?)?$/;

/** Cheap pre-check used by sheet parsers before the full parse. */
export function looksLikeChord(token: string): boolean {
  return CHORD_TOKEN_RE.test(token) && parseChord(token) !== null;
}

export function parseChord(input: string): Chord | null {
  const symbol = input.trim();
  if (!symbol) return null;
  const rootMatch = NOTE_RE.exec(symbol);
  if (!rootMatch) return null;
  // Reject lowercase roots unless the whole token is a bare lowercase letter
  // chord like "am" — too ambiguous with lyrics ("a", "be"), so we require uppercase.
  if (rootMatch[1] !== rootMatch[1].toUpperCase()) return null;

  const rootName = rootMatch[0];
  const rootPc = noteToPc(rootName);
  if (rootPc === null) return null;

  let rest = symbol.slice(rootName.length);
  let bassName: string | undefined;
  let bassPc: number | undefined;
  const slash = rest.indexOf("/");
  if (slash >= 0) {
    const bass = rest.slice(slash + 1);
    const pc = noteToPc(bass);
    if (pc === null) return null;
    bassName = bass;
    bassPc = pc;
    rest = rest.slice(0, slash);
  }

  const state: QualityState = { third: 4, fifth: 7, extras: new Set(), quality: "major", hasSeventh: false };
  const suffix = rest;
  let guard = 0;
  while (rest.length > 0 && guard++ < 20) {
    let matched = false;
    for (const [re, apply] of RULES) {
      const m = re.exec(rest);
      if (m && m[0].length > 0) {
        apply(state, m);
        rest = rest.slice(m[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) return null;
  }

  const intervals = new Set<number>([0]);
  if (state.third !== null) intervals.add(state.third);
  intervals.add(state.fifth);
  for (const e of state.extras) intervals.add(e);

  return {
    symbol,
    rootName,
    rootPc,
    bassName,
    bassPc,
    quality: state.quality,
    intervals: [...intervals].sort((a, b) => a - b),
    hasSeventh: state.hasSeventh,
    suffix,
  };
}

/** Pitch classes of all chord tones (deduped mod 12). */
export function chordPcs(chord: Chord): number[] {
  return [...new Set(chord.intervals.map((i) => mod12(chord.rootPc + i)))];
}

/** Re-spell a chord with a different root (and optional bass), keeping the suffix. */
export function respellChord(chord: Chord, newRootName: string, newBassName?: string): string {
  return newBassName ? `${newRootName}${chord.suffix}/${newBassName}` : `${newRootName}${chord.suffix}`;
}

/** Build a symbol from a root name + a semantic quality + seventh flag. */
export function symbolFor(rootName: string, quality: ChordQuality, seventh: "none" | "dom7" | "maj7" | "m7" | "dim7" | "m7b5" = "none"): string {
  const base: Record<ChordQuality, string> = { major: "", minor: "m", dim: "dim", aug: "aug", sus: "sus4", power: "5" };
  switch (seventh) {
    case "dom7": return `${rootName}7`;
    case "maj7": return `${rootName}maj7`;
    case "m7": return `${rootName}m7`;
    case "dim7": return `${rootName}dim7`;
    case "m7b5": return `${rootName}m7b5`;
    default: return `${rootName}${base[quality]}`;
  }
}
