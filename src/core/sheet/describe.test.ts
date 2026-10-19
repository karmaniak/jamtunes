import { describe, expect, it } from "vitest";
import { describeSection, modeOfDegree } from "./describe";
import { sheetFromQuick } from "../parse/build";
import { relabelKey } from "./transforms";

const section = (text: string, key?: { tonic: string; mode: Parameters<typeof relabelKey>[2] }) => {
  let sheet = sheetFromQuick(text).sheet;
  if (key) sheet = relabelKey(sheet, key.tonic, key.mode);
  return { section: sheet.sections[0], key: sheet.key };
};

describe("passage descriptions", () => {
  it("names a one-chord vamp by the mode it gets in the key", () => {
    const { section: s, key } = section("Bm Bm Bm Bm", { tonic: "G", mode: "ionian" });
    const d = describeSection(s, key);
    expect(d.title).toBe("B phrygian vamp");
    expect(d.scale.notes).toEqual(["B", "C", "D", "E", "F#", "G", "A"]);
    expect(d.numerals).toBe("iii");
  });

  it("recognises common shapes", () => {
    expect(describeSection(...Object.values(section("Dm7 G7 Cmaj7")) as [never, never]).title).toBe("ii–V–I in C major");
    expect(describeSection(...Object.values(section("C G Am F")) as [never, never]).title).toBe("I–V–vi–IV in C major");
    expect(describeSection(...Object.values(section("Am G F E7")) as [never, never]).title).toBe("Andalusian cadence in A minor");
    const blues = describeSection(...Object.values(section("A7 A7 A7 A7 D7 D7 A7 A7 E7 D7 A7 E7")) as [never, never]);
    expect(blues.title).toBe("12-bar blues in A");
  });

  it("falls back to a key + numerals description", () => {
    const d = describeSection(...Object.values(section("Em C G D")) as [never, never]);
    expect(d.title).toMatch(/progression|vi–IV–I–V/);
    expect(d.chords).toBe("Em – C – G – D");
  });

  it("derives modes of degrees", () => {
    expect(modeOfDegree("ionian", 1)).toBe("dorian");
    expect(modeOfDegree("ionian", 3)).toBe("lydian");
    expect(modeOfDegree("aeolian", 2)).toBe("ionian");
  });
});
