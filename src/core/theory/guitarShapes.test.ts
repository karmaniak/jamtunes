import { describe, expect, it } from "vitest";
import { parseChord } from "./chords";
import { guitarShape, pianoChordNotes } from "./guitarShapes";

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

  it("builds piano diagram notes from the root up", () => {
    expect(pianoChordNotes(parseChord("C")!)).toEqual([48, 52, 55]);
    expect(pianoChordNotes(parseChord("G/B")!)).toEqual([47, 55, 59, 62]);
  });
});
