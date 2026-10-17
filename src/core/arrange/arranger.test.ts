import { describe, expect, it } from "vitest";
import { buildTimeline } from "./arranger";
import { voiceChord } from "./voicing";
import { parseChord } from "../theory/chords";
import { sheetFromQuick } from "../parse/build";
import { setMode, setStyle, transposeSheet } from "../sheet/transforms";
import { timelineToMidi } from "../midi/writer";
import { STYLES } from "./styles";
import { instrumentById } from "../instruments";

describe("voicing", () => {
  it("keeps piano voicings in range and voice-leads", () => {
    const range: [number, number] = [48, 84];
    const c = voiceChord(parseChord("C")!, { role: "piano", range, hint: "close" });
    const g = voiceChord(parseChord("G7")!, { role: "piano", range, hint: "close", prev: c });
    for (const n of [...c, ...g]) expect(n).toBeGreaterThanOrEqual(48);
    for (const n of [...c, ...g]) expect(n).toBeLessThanOrEqual(84);
    expect(Math.abs(avg(c) - avg(g))).toBeLessThan(5);
  });

  it("builds power chords and guitar shapes", () => {
    expect(voiceChord(parseChord("E")!, { role: "distGuitar", range: [40, 70], hint: "power" })).toEqual([40, 47, 52]);
    const am = voiceChord(parseChord("Am")!, { role: "guitar", range: [40, 76], hint: "open" });
    expect(am[0] % 12).toBe(9);
    expect(am).toContain(45 + 12 + 3);
  });
});

describe("arranger", () => {
  const { sheet } = sheetFromQuick("Am F C G", undefined, { style: "rock" });

  it("produces events for every enabled track within instrument range", () => {
    const t = buildTimeline(sheet);
    expect(t.loopEnd - t.loopStart).toBe(16);
    for (const track of ["piano", "guitar", "distGuitar", "bass", "drums"] as const) {
      const evs = t.events.filter((e) => e.track === track);
      expect(evs.length, track).toBeGreaterThan(0);
      if (track === "drums") continue;
      const [lo, hi] = instrumentById(sheet.arrangement.tracks[track].instrument).range;
      for (const e of evs) {
        expect(e.midi, `${track} low`).toBeGreaterThanOrEqual(lo);
        expect(e.midi, `${track} high`).toBeLessThanOrEqual(hi + 12);
        expect(e.velocity).toBeGreaterThan(0);
        expect(e.duration).toBeGreaterThan(0);
      }
    }
    expect(t.markers).toHaveLength(4);
    expect(t.markers[1].start).toBe(t.loopStart + 4);
  });

  it("is deterministic", () => {
    expect(buildTimeline(sheet)).toEqual(buildTimeline(sheet));
  });

  it("retriggers chords that change mid-sustain", () => {
    const { sheet: s } = sheetFromQuick("| C G | Am F |", undefined, { style: "ballad" });
    const t = buildTimeline(s);
    const piano = t.events.filter((e) => e.track === "piano");
    const gStart = t.loopStart + 2;
    expect(piano.some((e) => Math.abs(e.start - gStart) < 0.05)).toBe(true);
  });

  it("plays every style in common meters", () => {
    for (const style of STYLES) {
      for (const ts of ["4/4", "3/4", "6/8"]) {
        const { sheet: s } = sheetFromQuick("Dm7 G7 Cmaj7 A7", ts, { style: style.id });
        const t = buildTimeline(s);
        expect(t.events.length, `${style.id} ${ts}`).toBeGreaterThan(10);
      }
    }
  });

  it("changes patterns with style and chords with transforms", () => {
    const swing = setStyle(sheet, "swing");
    expect(swing.tempo).toBe(140);
    expect(swing.arrangement.tracks.distGuitar.enabled).toBe(false);
    const up = transposeSheet(sheet, 2);
    expect(up.sections[0].bars.map((b) => b.slots[0].symbol)).toEqual(["Bm", "G", "D", "A"]);
    expect(up.key.tonic).toBe("B");
    const dorian = setMode(sheet, "dorian");
    expect(dorian.sections[0].bars.map((b) => b.slots[0].symbol)).toEqual(["Am", "F#dim", "C", "G"]);
  });
});

describe("midi writer", () => {
  it("writes a valid SMF header and tracks", () => {
    const { sheet } = sheetFromQuick("C G Am F");
    const bytes = timelineToMidi(buildTimeline(sheet), sheet.arrangement, { loops: 2 });
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("MThd");
    expect(bytes[9]).toBe(1); // format 1
    const nTracks = (bytes[10] << 8) | bytes[11];
    expect(nTracks).toBe(6); // conductor + 5 instruments
    expect(String.fromCharCode(...bytes.slice(14, 18))).toBe("MTrk");
  });
});

function avg(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
