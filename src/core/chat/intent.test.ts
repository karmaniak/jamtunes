import { describe, expect, it } from "vitest";
import { applyChanges, extractProgression, interpretLocally } from "./intent";
import { sheetFromQuick } from "../parse/build";
import { parseQuick } from "../parse/quick";

const base = sheetFromQuick("Am F C G").sheet;

describe("offline interpreter", () => {
  it("pulls a chord list out of prose, with repeats", () => {
    const msg = "I want these chords in a moody, kinda quiet background: Cmaj7 D (x4) then, Cmaj7#11 – D – Em – Bm – Em";
    expect(extractProgression(msg)).toBe("Cmaj7 D x4 Cmaj7#11 D Em Bm Em");
    const c = interpretLocally(msg, base);
    expect(c.style).toBe("ballad");
    expect(c.key).toBeNull(); // "in a moody" is not the key of A
    const next = applyChanges(base, c);
    const bars = next.sections[0].bars.map((b) => b.slots.map((s) => s.symbol).join(" "));
    expect(bars).toEqual(["Cmaj7", "D", "Cmaj7", "D", "Cmaj7", "D", "Cmaj7", "D", "Cmaj7#11", "D", "Em", "Bm", "Em"]);
    expect(next.arrangement.style).toBe("ballad");
  });

  it("still reads explicit keys and modes", () => {
    expect(interpretLocally("put it in E mixolydian", base).key).toEqual({ tonic: "E", mode: "mixolydian" });
    expect(interpretLocally("switch to dorian", base).key).toEqual({ tonic: base.key.tonic, mode: "dorian" });
    expect(interpretLocally("make it 96 bpm and funky", base)).toMatchObject({ tempo: 96, style: "funk" });
    expect(extractProgression("I want A and B")).toBeNull();
  });

  it("toggles tracks", () => {
    const c = interpretLocally("mute the piano and add distorted guitar", base);
    expect(c.tracks).toEqual([
      { id: "piano", enabled: false, volume: null, voicing: null, complexity: null },
      { id: "distGuitar", enabled: true, volume: null, voicing: null, complexity: null },
    ]);
  });

  it("nudges complexity with busier / simpler", () => {
    expect(interpretLocally("busier drums please", base).tracks).toEqual([{ id: "drums", enabled: null, volume: null, voicing: null, complexity: 0.75 }]);
    const all = interpretLocally("make it simpler", base).tracks!;
    expect(all.map((t) => t.id)).toEqual(["piano", "bass", "drums"]);
    expect(all[0].complexity).toBe(0.25);
  });
});

describe("inline repeat markers", () => {
  it("repeat the group since the previous marker", () => {
    const r = parseQuick("Cmaj7 D x2 Em Bm (x2) G");
    expect(r.sections[0].bars.map((b) => b.slots[0].symbol)).toEqual(["Cmaj7", "D", "Cmaj7", "D", "Em", "Bm", "Em", "Bm", "G"]);
  });
});
