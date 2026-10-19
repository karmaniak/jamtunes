import { describe, expect, it } from "vitest";
import { fillEvery, shapeBass, shapeComping, shapeDrums } from "./complexity";
import { seededRandom } from "../util/random";
import { buildTimeline } from "./arranger";
import { sheetFromQuick } from "../parse/build";
import { updateTrack } from "../sheet/transforms";

const ctx = () => ({ rng: seededRandom(7), stepsPerBeat: 4, beatsPerBar: 4 });
const hits = (s: string) => s.replace(/[.-]/g, "").length;

describe("complexity shaping", () => {
  it("leaves the middle alone", () => {
    expect(shapeComping("X-----x---x-----", 0.5, ctx())).toBe("X-----x---x-----");
    expect(shapeBass("R-----r-R-----5-", 0.5, ctx(), true)).toBe("R-----r-R-----5-");
  });

  it("thins toward strong beats when simple", () => {
    const simple = shapeComping("x.x...x..x..x.x.", 0.1, ctx());
    expect("Xx").toContain(simple[0]);
    expect(hits(simple)).toBeLessThanOrEqual(2);
    const bass = shapeBass("R..R..5.R.8...A.", 0.0, ctx(), true);
    expect(hits(bass)).toBe(1);
    const drums = shapeDrums({ kick: "X..x..x...x..x..", snare: "....X.......X..o", hhClosed: "xxXxxxXxxxXxxxXx" }, 0.1, ctx(), 0);
    expect(drums.snare).toBe("....X.......X...");
    expect(hits(drums.kick!)).toBeLessThan(5);
  });

  it("adds embellishments when busy, deterministically", () => {
    const a = shapeDrums({ kick: "X...x...X..x....", snare: "....X.......X...", hhClosed: "x.x.x.x.x.x.x.x." }, 0.95, ctx(), 1);
    const b = shapeDrums({ kick: "X...x...X..x....", snare: "....X.......X...", hhClosed: "x.x.x.x.x.x.x.x." }, 0.95, ctx(), 1);
    expect(a).toEqual(b);
    expect(hits(a.snare!) + hits(a.kick!) + hits(a.hhClosed!) + hits(a.hhOpen ?? "")).toBeGreaterThan(4 + 2 + 8);
    expect(a.snare).toContain("o");
    const bass = shapeBass("R-------5-------", 1, ctx(), true);
    expect(bass).toMatch(/[Aa]/);
    expect(fillEvery(0.2)).toBe(0);
    expect(fillEvery(0.9)).toBe(2);
  });

  it("changes the arranged note count with the slider", () => {
    const base = sheetFromQuick("C G Am F", undefined, { style: "pop" }).sheet;
    const count = (c: number) => {
      let s = base;
      for (const id of ["piano", "bass", "drums"] as const) s = updateTrack(s, id, { complexity: c });
      return buildTimeline(s).events.length;
    };
    expect(count(0)).toBeLessThan(count(0.5));
    expect(count(0.5)).toBeLessThan(count(1));
  });
});
