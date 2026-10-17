import { describe, expect, it } from "vitest";
import { parseQuick, parseTiming } from "./quick";
import { parseSheetText } from "./sheetText";
import { sheetFromQuick, sheetFromText } from "./build";

const bars = (s: ReturnType<typeof parseQuick>["sections"][number]) => s.bars.map((b) => b.slots.map((sl) => `${sl.symbol}:${sl.beats}`));

describe("quick syntax", () => {
  it("defaults to one bar per chord", () => {
    const r = parseQuick("Am F C G");
    expect(r.sections).toHaveLength(1);
    expect(bars(r.sections[0])).toEqual([["Am:4"], ["F:4"], ["C:4"], ["G:4"]]);
  });

  it("splits explicit bars evenly", () => {
    const r = parseQuick("| Am F | C G | Dm G C |");
    expect(bars(r.sections[0])).toEqual([["Am:2", "F:2"], ["C:2", "G:2"], ["Dm:2", "G:1", "C:1"]]);
  });

  it("honours dots and parenthesised beats", () => {
    const r = parseQuick("Am . . . F . C(2) G(2)");
    expect(bars(r.sections[0])).toEqual([["Am:4"], ["F:2", "C:2"], ["G:4"]]);
  });

  it("splits long chords across bars and marks ties", () => {
    const r = parseQuick("C(8) G(4)");
    expect(bars(r.sections[0])).toEqual([["C:4"], ["C:4"], ["G:4"]]);
    expect(r.sections[0].bars[1].slots[0].ext).toEqual({ tied: true });
  });

  it("uses a timing string", () => {
    const r = parseQuick("Am F C G", "2 2 4");
    // A trailing half-bar is padded out so the loop stays on the grid.
    expect(bars(r.sections[0])).toEqual([["Am:2", "F:2"], ["C:4"], ["G:4"]]);
    expect(parseTiming("6/8 90bpm 2b")).toEqual({ timeSignature: { beats: 6, unit: 8 }, tempo: 90, beatsPerChord: [-2] });
    const r2 = parseQuick("D A", "2b");
    expect(bars(r2.sections[0])).toEqual([["D:4"], ["D:4"], ["A:4"], ["A:4"]]);
  });

  it("handles sections and repeats", () => {
    const r = parseQuick("[Verse]\nAm F x2\n[Chorus] x2\nC G");
    expect(r.sections.map((s) => s.name)).toEqual(["Verse", "Chorus"]);
    expect(r.sections[0].bars).toHaveLength(4);
    expect(r.sections[1].repeat).toBe(2);
  });

  it("supports 3/4", () => {
    const r = parseQuick("| C | G/B | Am |", "3/4");
    expect(bars(r.sections[0])).toEqual([["C:3"], ["G/B:3"], ["Am:3"]]);
  });
});

describe("sheet text (UG style)", () => {
  const sheet = `
[Verse 1]
C                G
Amazing grace how sweet the sound
Am       F
That saved a wretch like me

[Chorus]
| F  G | C  Am |
`;

  it("extracts sections, chords and lyrics", () => {
    const r = parseSheetText(sheet);
    expect(r.sections.map((s) => s.name)).toEqual(["Verse 1", "Chorus"]);
    const verse = r.sections[0];
    expect(verse.bars.map((b) => b.slots[0].symbol)).toEqual(["C", "G", "Am", "F"]);
    expect(verse.bars[0].slots[0].lyric).toBe("Amazing grace how");
    expect(verse.bars[1].slots[0].lyric).toBe("sweet the sound");
    expect(bars(r.sections[1])).toEqual([["F:2", "G:2"], ["C:2", "Am:2"]]);
  });

  it("strips UG markup and reads meta", () => {
    const r = parseSheetText("Key: G\nCapo: 2\n[Intro]\n[ch]G[/ch] [ch]D[/ch] [ch]Em[/ch] [ch]C[/ch]");
    expect(r.key).toBe("G");
    expect(r.capo).toBe(2);
    expect(r.sections[0].bars.map((b) => b.slots[0].symbol)).toEqual(["G", "D", "Em", "C"]);
  });

  it("parses inline bracket chords", () => {
    const r = parseSheetText("[G]Country [D]roads, take me [Em]home");
    const slots = r.sections[0].bars.map((b) => b.slots[0]);
    expect(slots.map((s) => s.symbol)).toEqual(["G", "D", "Em"]);
    expect(slots[1].lyric).toBe("roads, take me");
  });

  it("does not treat lyric words as chords", () => {
    const r = parseSheetText("A\nBe my baby\nAm\nAll the time");
    expect(r.sections[0].bars.map((b) => b.slots[0].symbol)).toEqual(["A", "Am"]);
  });
});

describe("sheet builders", () => {
  it("builds a playable sheet with detected key", () => {
    const { sheet } = sheetFromQuick("Em C G D", undefined, { style: "rock" });
    expect(sheet.key.tonic).toBe("E");
    expect(sheet.key.mode).toBe("aeolian");
    expect(sheet.arrangement.style).toBe("rock");
    expect(sheet.tempo).toBe(120);
  });

  it("respects Key: lines in pasted text", () => {
    const { sheet } = sheetFromText("Key: Am\nAm G F E");
    expect(sheet.key).toEqual({ tonic: "A", mode: "aeolian" });
  });
});
