import { describe, expect, it } from "vitest";
import { parseChord, looksLikeChord, chordPcs } from "./chords";
import { noteToPc, pcToName } from "./notes";
import { detectKey, diatonicChords, mapChordToMode, modeIntervals } from "./scales";

describe("notes", () => {
  it("parses names", () => {
    expect(noteToPc("C")).toBe(0);
    expect(noteToPc("F#")).toBe(6);
    expect(noteToPc("Bb")).toBe(10);
    expect(noteToPc("Cb")).toBe(11);
    expect(noteToPc("H")).toBeNull();
    expect(pcToName(10, "flat")).toBe("Bb");
    expect(pcToName(10, "sharp")).toBe("A#");
  });
});

describe("chords", () => {
  it("parses triads and sevenths", () => {
    expect(parseChord("C")!.intervals).toEqual([0, 4, 7]);
    expect(parseChord("Am")!.intervals).toEqual([0, 3, 7]);
    expect(parseChord("G7")!.intervals).toEqual([0, 4, 7, 10]);
    expect(parseChord("Cmaj7")!.intervals).toEqual([0, 4, 7, 11]);
    expect(parseChord("Dm7")!.intervals).toEqual([0, 3, 7, 10]);
    expect(parseChord("Bdim")!.intervals).toEqual([0, 3, 6]);
    expect(parseChord("Bm7b5")!.intervals).toEqual([0, 3, 6, 10]);
    expect(parseChord("Bø")!.intervals).toEqual([0, 3, 6, 10]);
    expect(parseChord("Bdim7")!.intervals).toEqual([0, 3, 6, 9]);
    expect(parseChord("Caug")!.intervals).toEqual([0, 4, 8]);
    expect(parseChord("C+")!.intervals).toEqual([0, 4, 8]);
  });

  it("parses sus, add, power, extensions and alterations", () => {
    expect(parseChord("Dsus4")!.intervals).toEqual([0, 5, 7]);
    expect(parseChord("Dsus2")!.intervals).toEqual([0, 2, 7]);
    expect(parseChord("E5")!.intervals).toEqual([0, 7]);
    expect(parseChord("Cadd9")!.intervals).toEqual([0, 4, 7, 14]);
    expect(parseChord("C6")!.intervals).toEqual([0, 4, 7, 9]);
    expect(parseChord("C69")!.intervals).toEqual([0, 4, 7, 9, 14]);
    expect(parseChord("G9")!.intervals).toEqual([0, 4, 7, 10, 14]);
    expect(parseChord("G13")!.intervals).toEqual([0, 4, 7, 10, 14, 21]);
    expect(parseChord("Cmaj9")!.intervals).toEqual([0, 4, 7, 11, 14]);
    expect(parseChord("E7#9")!.intervals).toEqual([0, 4, 7, 10, 15]);
    expect(parseChord("G7b9")!.intervals).toEqual([0, 4, 7, 10, 13]);
    expect(parseChord("C7#5")!.intervals).toEqual([0, 4, 8, 10]);
    expect(parseChord("AmMaj7")!.intervals).toEqual([0, 3, 7, 11]);
    expect(parseChord("F#m7")!.rootPc).toBe(6);
    expect(parseChord("Ebmaj7")!.rootPc).toBe(3);
  });

  it("parses slash chords", () => {
    const c = parseChord("G/B")!;
    expect(c.rootPc).toBe(7);
    expect(c.bassPc).toBe(11);
    expect(parseChord("D/F#")!.bassPc).toBe(6);
  });

  it("rejects non-chords", () => {
    expect(parseChord("Hello")).toBeNull();
    expect(parseChord("Amazing")).toBeNull();
    expect(parseChord("a")).toBeNull();
    expect(parseChord("Be")).toBeNull();
    expect(looksLikeChord("Cat")).toBe(false);
    expect(looksLikeChord("Am7")).toBe(true);
    expect(looksLikeChord("Bb")).toBe(true);
  });

  it("gives pitch classes", () => {
    expect(chordPcs(parseChord("G7")!)).toEqual([7, 11, 2, 5]);
  });
});

describe("scales", () => {
  it("builds modes", () => {
    expect(modeIntervals("ionian")).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(modeIntervals("lydian")).toEqual([0, 2, 4, 6, 7, 9, 11]);
    expect(modeIntervals("mixolydian")).toEqual([0, 2, 4, 5, 7, 9, 10]);
    expect(modeIntervals("aeolian")).toEqual([0, 2, 3, 5, 7, 8, 10]);
  });

  it("derives diatonic chords", () => {
    const c = diatonicChords(0, "ionian");
    expect(c.map((x) => x.roman)).toEqual(["I", "ii", "iii", "IV", "V", "vi", "vii°"]);
    const lyd = diatonicChords(0, "lydian");
    expect(lyd[1].quality).toBe("major"); // II in lydian
    expect(lyd[3].roman).toBe("#iv°");
    const mixo = diatonicChords(0, "mixolydian");
    expect(mixo[6].roman).toBe("bVII");
  });

  it("maps lydian to mixolydian by degree", () => {
    // C lydian: C D Em F#dim G Am Bm  ->  C mixolydian: C Dm Edim F Gm Am Bb
    expect(mapChordToMode("C", 0, "lydian", "mixolydian").symbol).toBe("C");
    expect(mapChordToMode("D", 0, "lydian", "mixolydian").symbol).toBe("Dm");
    expect(mapChordToMode("Bm", 0, "lydian", "mixolydian").symbol).toBe("Bb");
    expect(mapChordToMode("Dmaj7", 0, "lydian", "mixolydian").symbol).toBe("Dm7");
    expect(mapChordToMode("G", 0, "lydian", "mixolydian").symbol).toBe("Gm");
  });

  it("maps major to minor and keeps non-diatonic suffixes", () => {
    expect(mapChordToMode("F", 0, "ionian", "aeolian").symbol).toBe("Fm");
    expect(mapChordToMode("G7", 0, "ionian", "aeolian").symbol).toBe("Gm7");
    expect(mapChordToMode("Cadd9", 0, "ionian", "aeolian").symbol).toBe("Cadd9");
    expect(mapChordToMode("G/B", 0, "ionian", "aeolian").symbol).toBe("Gm/Bb");
  });

  it("detects keys", () => {
    expect(detectKey(["C", "G", "Am", "F"])).toEqual({ tonicPc: 0, mode: "ionian" });
    expect(detectKey(["Am", "F", "C", "G"]).tonicPc).toBe(9);
    expect(detectKey(["D", "C", "G", "D"])).toEqual({ tonicPc: 2, mode: "mixolydian" });
    expect(detectKey(["Dm7", "G7"]).tonicPc).toBe(2);
  });
});
