import { describe, expect, it } from "vitest";
import { applyChanges, describeDiff, emptyChanges, extractProgression, interpretLocally, normaliseProgression } from "./intent";
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

describe("applying model output", () => {
  it("normalises dash / comma / arrow separated progressions", () => {
    expect(normaliseProgression("Cmaj7 - Am7 - Dm7 - G7")).toBe("Cmaj7 Am7 Dm7 G7");
    expect(normaliseProgression("Cmaj7, Am7, Dm7 → G7")).toBe("Cmaj7 Am7 Dm7 G7");
    expect(normaliseProgression("||: Am | F :|| then C")).toBe("| Am | F | C");
    expect(normaliseProgression("Dm7 G7 Cmaj7 A-7")).toBe("Dm7 G7 Cmaj7 A-7"); // minor suffix kept
  });

  it("titles a new progression from the request, else from style + key", () => {
    const c = { ...emptyChanges("ok"), progression: "Dm7 - G7 - Cmaj7", style: "swing" as const };
    const next = applyChanges(base, c, "I want a late night jazz vamp: Dm7 - G7 - Cmaj7");
    expect(next.title).toBe("Late night jazz vamp");
    expect(next.sections[0].bars.map((b) => b.slots[0].symbol)).toEqual(["Dm7", "G7", "Cmaj7"]);
    const untitled = applyChanges(base, { ...emptyChanges("ok"), progression: "Em C G D" });
    expect(untitled.title).toMatch(/^Rock in E minor$/);
    expect(applyChanges(base, { ...emptyChanges("ok"), progression: "Em C G D", title: "Road song" }).title).toBe("Road song");
  });

  it("renames placeholder titles when the style or key changes without a new progression", () => {
    expect(base.title).toBe("Quick jam");
    const restyled = applyChanges(base, { ...emptyChanges("ok"), style: "swing" }, "make it swing");
    expect(restyled.title).toBe("Jazz swing in A minor");
    const kept = applyChanges({ ...base, title: "My tune" }, { ...emptyChanges("ok"), style: "swing" });
    expect(kept.title).toBe("My tune");
  });

  it("never replaces the sheet with an empty parse", () => {
    const next = applyChanges(base, { ...emptyChanges("ok"), progression: "la la la", tempo: 90 });
    expect(next.sections.length).toBe(base.sections.length);
    expect(next.tempo).toBe(90);
  });

  it("describes what actually changed", () => {
    expect(describeDiff(base, base)).toEqual([]);
    const next = applyChanges(base, { ...emptyChanges("ok"), tempo: 84, style: "ballad", tracks: [{ id: "drums", enabled: null, volume: null, voicing: null, complexity: 0.8 }] });
    const diff = describeDiff(base, next);
    expect(diff).toContain("tempo 120→84");
    expect(diff).toContain("style ballad");
    expect(diff).toContain("drums busier");
  });
});

describe("inline repeat markers", () => {
  it("repeat the group since the previous marker", () => {
    const r = parseQuick("Cmaj7 D x2 Em Bm (x2) G");
    expect(r.sections[0].bars.map((b) => b.slots[0].symbol)).toEqual(["Cmaj7", "D", "Cmaj7", "D", "Em", "Bm", "Em", "Bm", "G"]);
  });
});
