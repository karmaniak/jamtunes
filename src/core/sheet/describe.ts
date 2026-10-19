/**
 * Musician-facing descriptions of a passage: "B phrygian vamp",
 * "ii–V–I in C major", "12-bar blues in A". Used by the play-along view
 * and available to the chat. Pure functions over the sheet model.
 */
import { parseChord } from "../theory/chords";
import { noteToPc, pcToName, preferredAccidental } from "../theory/notes";
import { degreeOf, detectKey, diatonicChords, MODE_NAMES, scalePcs, type ModeName } from "../theory/scales";
import type { KeySpec, Section } from "./model";

export interface PassageDescription {
  /** Headline, e.g. "B phrygian vamp" or "ii–V–I in C major". */
  title: string;
  /** Chord list, e.g. "Dm7 – G7 – Cmaj7". */
  chords: string;
  /** Roman numerals relative to the passage's tonal centre. */
  numerals: string;
  /** What to play over it. */
  scale: { name: string; notes: string[] };
}

const MODE_SHORT: Record<ModeName, string> = {
  ionian: "major",
  dorian: "dorian",
  phrygian: "phrygian",
  lydian: "lydian",
  mixolydian: "mixolydian",
  aeolian: "minor",
  locrian: "locrian",
};

/** The mode built on scale degree `degree` of a parent mode (degree 3 of C major = F lydian). */
export function modeOfDegree(parent: ModeName, degree: number): ModeName {
  return MODE_NAMES[(MODE_NAMES.indexOf(parent) + degree) % 7];
}

function spellScale(tonicPc: number, mode: ModeName, tonicName?: string): string[] {
  const minorish = ["aeolian", "dorian", "phrygian", "locrian"].includes(mode);
  const prefer = tonicName?.includes("b") ? "flat" : tonicName?.includes("#") ? "sharp" : preferredAccidental(tonicPc, minorish);
  return scalePcs(tonicPc, mode).map((pc) => pcToName(pc, prefer));
}

function numeralFor(symbol: string, tonicPc: number, mode: ModeName): string {
  const chord = parseChord(symbol);
  if (!chord) return symbol;
  const { degree, offset } = degreeOf(chord.rootPc, tonicPc, mode);
  const dia = diatonicChords(tonicPc, mode)[degree];
  const base = dia.roman.replace("°", "").replace(/^b/, "♭").replace(/^#/, "♯");
  const roman = chord.quality === "minor" || chord.quality === "dim" ? base.toLowerCase() : base.toUpperCase();
  const acc = offset === 1 ? "♯" : offset === -1 ? "♭" : "";
  return `${acc}${roman}${chord.quality === "dim" ? "°" : chord.hasSeventh ? "7" : ""}`;
}

/** Distinct chords in play order, collapsing immediate repeats. */
export function distinctChords(section: Section): string[] {
  const out: string[] = [];
  for (const bar of section.bars) for (const slot of bar.slots) {
    if (slot.ext?.tied) continue;
    if (out[out.length - 1] !== slot.symbol) out.push(slot.symbol);
  }
  // "Am F C G Am F C G" is one four-chord loop played twice.
  for (let len = 1; len <= out.length / 2; len++) {
    if (out.length % len !== 0) continue;
    if (out.every((s, i) => s === out[i % len])) return out.slice(0, len);
  }
  return out;
}

export function describeSection(section: Section, key: KeySpec): PassageDescription {
  const symbols = distinctChords(section).filter((s) => parseChord(s) !== null);
  const keyTonicPc = noteToPc(key.tonic) ?? 0;
  const chordsText = symbols.join(" – ");

  if (symbols.length === 0) {
    return { title: "Open / no chord", chords: "N.C.", numerals: "", scale: { name: `${key.tonic} ${MODE_SHORT[key.mode]}`, notes: spellScale(keyTonicPc, key.mode, key.tonic) } };
  }

  // Single chord: a vamp. Name the mode that chord gets inside the sheet's key.
  if (symbols.length === 1) {
    const chord = parseChord(symbols[0])!;
    const { degree, offset } = degreeOf(chord.rootPc, keyTonicPc, key.mode);
    let mode: ModeName = offset === 0 ? modeOfDegree(key.mode, degree) : chord.quality === "minor" ? "aeolian" : chord.quality === "dim" ? "locrian" : chord.hasSeventh && chord.intervals.includes(10) ? "mixolydian" : "ionian";
    // A dominant chord on a non-dominant degree still wants mixolydian; a sus chord is open.
    if (chord.quality === "major" && chord.intervals.includes(10) && mode === "ionian") mode = "mixolydian";
    const root = chord.rootName;
    return {
      title: `${root} ${MODE_SHORT[mode]} vamp`,
      chords: chordsText,
      numerals: numeralFor(symbols[0], keyTonicPc, key.mode),
      scale: { name: `${root} ${MODE_SHORT[mode]}`, notes: spellScale(chord.rootPc, mode, root) },
    };
  }

  // Several chords: find the passage's own tonal centre, then name the shape.
  const local = detectKey(symbols);
  const tonicName = pcToName(local.tonicPc, preferredAccidental(local.tonicPc, local.mode !== "ionian" && local.mode !== "lydian" && local.mode !== "mixolydian"));
  const numerals = symbols.map((s) => numeralFor(s, local.tonicPc, local.mode));
  const numeralsText = numerals.join("–");
  const keyName = `${tonicName} ${MODE_SHORT[local.mode]}`;
  const scale = { name: keyName, notes: spellScale(local.tonicPc, local.mode, tonicName) };

  const bars = section.bars.length;
  const degreesOnly = new Set(symbols.map((s) => degreeOf(parseChord(s)!.rootPc, local.tonicPc, local.mode).degree));
  if (bars === 12 && [...degreesOnly].every((d) => [0, 3, 4].includes(d)) && degreesOnly.size >= 2) {
    return { title: `12-bar blues in ${tonicName}`, chords: chordsText, numerals: numeralsText, scale: { name: `${tonicName} blues / mixolydian`, notes: spellScale(local.tonicPc, "mixolydian", tonicName) } };
  }
  const shapes: [RegExp, string][] = [
    [/^ii7?–V7?–I(maj7)?7?$/, "ii–V–I"],
    [/^I–V–vi–IV$/, "I–V–vi–IV"],
    [/^vi–IV–I–V$/, "vi–IV–I–V"],
    [/^I–vi–IV–V$/, "50s doo-wop I–vi–IV–V"],
    [/^I–IV–V(–IV)?$/, "I–IV–V"],
    [/^i–♭VII–♭VI(–V7?)?$/, "Andalusian cadence"],
    [/^i–♭VII–♭VI–♭VII$/, "i–♭VII–♭VI–♭VII"],
    [/^i–♭VI–♭III–♭VII$/, "minor pop loop i–♭VI–♭III–♭VII"],
    [/^i–♭III–♭VII–♭VI$/, "i–♭III–♭VII–♭VI"],
    [/^i–iv–V7?$/, "i–iv–V"],
    [/^I–♭VII–IV(–I)?$/, "I–♭VII–IV (mixolydian rock)"],
  ];
  const canon = numeralsText.replace(/7/g, "").replace(/maj/g, "");
  for (const [re, name] of shapes) {
    if (re.test(canon)) return { title: `${name} in ${keyName}`, chords: chordsText, numerals: numeralsText, scale };
  }
  if (symbols.length === 2) return { title: `${keyName} two-chord vamp`, chords: chordsText, numerals: numeralsText, scale };
  return { title: `${keyName} progression`, chords: chordsText, numerals: numeralsText, scale };
}

/** Human label for a key, e.g. "G dorian". */
export function keyLabel(key: KeySpec): string {
  return `${key.tonic} ${MODE_SHORT[key.mode]}`;
}
