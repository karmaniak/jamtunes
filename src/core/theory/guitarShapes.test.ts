import { describe, expect, it } from "vitest";
import { parseChord } from "./chords";
import { guitarShape, pianoChordNotes, TUNING } from "./guitarShapes";

const shape = (symbol: string) => guitarShape(parseChord(symbol)!)!.frets.map((f) => (f < 0 ? "x" : String(f))).join("");

describe("guitar shapes", () => {
  it("finds the canonical open shapes", () => {
    expect(shape("C")).toBe("x32010");
    expect(shape("G")).toBe("320003");
    expect(shape("Am")).toBe("x02210");
    expect(shape("E")).toBe("022100");
    expect(shape("Em")).toBe("022000");
    expect(shape("D")).toBe("xx0232");
    expect(shape("A")).toBe("x02220");
    expect(shape("C7")).toBe("x32310");
    expect(shape("G7")).toBe("320001");
    expect(shape("Dm7")).toBe("xx0211");
  });

  it("finds barre shapes when open ones don't exist", () => {
    expect(shape("F")).toBe("133211");
    expect(shape("Bm")).toBe("x24432");
    const fsharpm = guitarShape(parseChord("F#m")!)!;
    expect(fsharpm.frets).toEqual([2, 4, 4, 2, 2, 2]);
    expect(fsharpm.barre).toEqual({ fret: 2, from: 0, to: 5 });
  });

  it("handles slash chords, sus and extended chords", () => {
    expect(shape("G/B")).toBe("x20003");
    expect(shape("Dsus4")).toBe("xx0233");
    expect(shape("Cmaj7")).toBe("x32000");
    expect(guitarShape(parseChord("F#m7b5")!)).not.toBeNull();
    expect(guitarShape(parseChord("Bb13")!)).not.toBeNull();
  });

  it("always finds a shape, relaxing rules when it must", () => {
    const tricky = ["E7#9", "Bb13", "C69", "G7b9", "Abmaj7#11", "Dm7b5/Ab", "F#dim7", "Cadd9/E", "B7sus4", "Ebm6", "C7#5", "Gmaj9", "A7alt", "Dbm9", "F/G", "Bbm7b5", "E9", "C#m11"];
    for (const sym of tricky) {
      const s = guitarShape(parseChord(sym)!);
      expect(s, sym).not.toBeNull();
      expect(s!.frets.filter((f) => f >= 0).length, sym).toBeGreaterThanOrEqual(2);
    }
    // Every essential tone of E7#9 (E, G#, D, G) is in whatever shape wins.
    const e79 = guitarShape(parseChord("E7#9")!)!;
    const pcs = new Set(e79.frets.map((f, i) => (f < 0 ? -1 : (TUNING[i] + f) % 12)).filter((p) => p >= 0));
    for (const pc of [4, 8, 2, 7]) expect(pcs.has(pc), `E7#9 has pc ${pc}`).toBe(true);
  });

  it("builds piano diagram notes from the root up", () => {
    expect(pianoChordNotes(parseChord("C")!)).toEqual([48, 52, 55]);
    expect(pianoChordNotes(parseChord("G/B")!)).toEqual([47, 55, 59, 62]);
  });
});
