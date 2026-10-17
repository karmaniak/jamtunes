import { describe, expect, it } from "vitest";
import { sheetFromQuick } from "../parse/build";
import { addSection, appendBar, deleteBar, deleteSlot, duplicateBar, insertBarAfter, moveBar, resizeSlot, splitSlot } from "./edit";

const shape = (s: ReturnType<typeof sheetFromQuick>["sheet"]) => s.sections.map((sec) => sec.bars.map((b) => b.slots.map((sl) => `${sl.symbol}:${sl.beats}`).join(" ")));

describe("sheet edits", () => {
  const base = sheetFromQuick("| Am F | C G |").sheet;
  const [bar1, bar2] = base.sections[0].bars;

  it("inserts, duplicates, deletes and moves bars", () => {
    expect(shape(insertBarAfter(base, bar1.id))).toEqual([["Am:2 F:2", "F:4", "C:2 G:2"]]);
    expect(shape(duplicateBar(base, bar2.id))).toEqual([["Am:2 F:2", "C:2 G:2", "C:2 G:2"]]);
    expect(shape(deleteBar(base, bar1.id))).toEqual([["C:2 G:2"]]);
    expect(shape(moveBar(base, bar2.id, -1))).toEqual([["C:2 G:2", "Am:2 F:2"]]);
    expect(moveBar(base, bar1.id, -1)).toBe(base);
    expect(shape(appendBar(base, base.sections[0].id, "E7"))).toEqual([["Am:2 F:2", "C:2 G:2", "E7:4"]]);
  });

  it("splits, deletes and resizes chord blocks", () => {
    const am = bar1.slots[0];
    expect(shape(splitSlot(base, am.id))[0][0]).toBe("Am:1 Am:1 F:2");
    expect(shape(deleteSlot(base, bar1.slots[1].id))[0][0]).toBe("Am:4");
    expect(shape(resizeSlot(base, am.id, 1))[0][0]).toBe("Am:3 F:1");
    expect(shape(resizeSlot(base, am.id, -1))[0][0]).toBe("Am:1 F:3");
    // Growing past the neighbour's minimum stops at half a beat.
    expect(shape(resizeSlot(base, am.id, 3))[0][0]).toBe("Am:3.5 F:0.5");
  });

  it("deleting the only block removes the bar; growing a lone block adds a tied bar", () => {
    const single = sheetFromQuick("C G").sheet;
    const c = single.sections[0].bars[0].slots[0];
    expect(shape(deleteSlot(single, c.id))).toEqual([["G:4"]]);
    const grown = resizeSlot(single, c.id, 1);
    expect(shape(grown)).toEqual([["C:4", "C:4", "G:4"]]);
    expect(grown.sections[0].bars[1].slots[0].ext).toEqual({ tied: true });
  });

  it("adds sections after the current one with a sensible default chord", () => {
    const out = addSection(base, "Bridge");
    expect(out.sections.map((s) => s.name)).toEqual(["Main", "Bridge"]);
    expect(shape(out)[1]).toEqual(["G:4"]);
  });
});
