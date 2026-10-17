/**
 * Structural edits on a sheet: add / remove / split / resize chord blocks,
 * bars and sections. Pure functions. These give the user direct control
 * over the progression without going through a parser or the chat.
 */
import { cloneSheet, makeBar, makeSection, makeSlot, type Bar, type ChordSheet, type Section } from "./model";

function findBar(sheet: ChordSheet, barId: string): { section: Section; index: number; bar: Bar } | null {
  for (const section of sheet.sections) {
    const index = section.bars.findIndex((b) => b.id === barId);
    if (index >= 0) return { section, index, bar: section.bars[index] };
  }
  return null;
}

function findSlot(sheet: ChordSheet, slotId: string): { section: Section; bar: Bar; index: number } | null {
  for (const section of sheet.sections) {
    for (const bar of section.bars) {
      const index = bar.slots.findIndex((s) => s.id === slotId);
      if (index >= 0) return { section, bar, index };
    }
  }
  return null;
}

/** Last chord symbol before a position, used as the default for new blocks. */
function lastSymbolBefore(sheet: ChordSheet, section: Section, barIndex: number): string {
  for (let i = barIndex; i >= 0; i--) {
    const bar = section.bars[i];
    if (bar?.slots.length) return bar.slots[bar.slots.length - 1].symbol;
  }
  const all = sheet.sections.flatMap((s) => s.bars.flatMap((b) => b.slots.map((sl) => sl.symbol)));
  return all[all.length - 1] ?? sheet.key.tonic;
}

// --- bars --------------------------------------------------------------------

export function insertBarAfter(sheet: ChordSheet, barId: string, symbol?: string): ChordSheet {
  const out = cloneSheet(sheet);
  const hit = findBar(out, barId);
  if (!hit) return sheet;
  const sym = symbol ?? lastSymbolBefore(out, hit.section, hit.index);
  hit.section.bars.splice(hit.index + 1, 0, makeBar([makeSlot(sym, out.timeSignature.beats)]));
  return out;
}

export function appendBar(sheet: ChordSheet, sectionId: string, symbol?: string): ChordSheet {
  const out = cloneSheet(sheet);
  const section = out.sections.find((s) => s.id === sectionId);
  if (!section) return sheet;
  const sym = symbol ?? lastSymbolBefore(out, section, section.bars.length - 1);
  section.bars.push(makeBar([makeSlot(sym, out.timeSignature.beats)]));
  return out;
}

export function duplicateBar(sheet: ChordSheet, barId: string): ChordSheet {
  const out = cloneSheet(sheet);
  const hit = findBar(out, barId);
  if (!hit) return sheet;
  const copy = makeBar(hit.bar.slots.map((s) => makeSlot(s.symbol, s.beats, { lyric: undefined, voicing: s.voicing, rhythm: s.rhythm })));
  hit.section.bars.splice(hit.index + 1, 0, copy);
  return out;
}

export function deleteBar(sheet: ChordSheet, barId: string): ChordSheet {
  const out = cloneSheet(sheet);
  const hit = findBar(out, barId);
  if (!hit) return sheet;
  hit.section.bars.splice(hit.index, 1);
  return out;
}

export function moveBar(sheet: ChordSheet, barId: string, direction: -1 | 1): ChordSheet {
  const out = cloneSheet(sheet);
  const hit = findBar(out, barId);
  if (!hit) return sheet;
  const target = hit.index + direction;
  if (target < 0 || target >= hit.section.bars.length) return sheet;
  const bars = hit.section.bars;
  [bars[hit.index], bars[target]] = [bars[target], bars[hit.index]];
  return out;
}

// --- chord blocks (slots) ----------------------------------------------------

/** Split a block in two equal halves (the new half repeats the chord). */
export function splitSlot(sheet: ChordSheet, slotId: string): ChordSheet {
  const out = cloneSheet(sheet);
  const hit = findSlot(out, slotId);
  if (!hit) return sheet;
  const slot = hit.bar.slots[hit.index];
  if (slot.beats < 1) return sheet;
  const half = slot.beats / 2;
  slot.beats = half;
  hit.bar.slots.splice(hit.index + 1, 0, makeSlot(slot.symbol, half, { voicing: slot.voicing }));
  return out;
}

/** Remove a block; its beats go to the previous block (or the next one). Removing the only block removes the bar. */
export function deleteSlot(sheet: ChordSheet, slotId: string): ChordSheet {
  const out = cloneSheet(sheet);
  const hit = findSlot(out, slotId);
  if (!hit) return sheet;
  const { bar, index } = hit;
  if (bar.slots.length === 1) return deleteBar(sheet, bar.id);
  const removed = bar.slots.splice(index, 1)[0];
  const receiver = bar.slots[index - 1] ?? bar.slots[index];
  receiver.beats += removed.beats;
  return out;
}

/**
 * Resize a block by `delta` beats. Beats are taken from / given to the next
 * block in the bar (or the previous one when it's the last block). A block
 * can't go below half a beat; growing the last block of a bar with nothing to
 * take from extends it into a new bar.
 */
export function resizeSlot(sheet: ChordSheet, slotId: string, delta: number): ChordSheet {
  const out = cloneSheet(sheet);
  const hit = findSlot(out, slotId);
  if (!hit || delta === 0) return sheet;
  const { bar, index } = hit;
  const slot = bar.slots[index];
  const neighbour = bar.slots[index + 1] ?? bar.slots[index - 1];
  const min = 0.5;
  if (delta < 0) {
    if (slot.beats + delta < min) return sheet;
    slot.beats += delta;
    if (neighbour) neighbour.beats -= delta;
    else bar.slots.splice(index + 1, 0, makeSlot(slot.symbol, -delta, { voicing: slot.voicing }));
    return out;
  }
  if (neighbour && neighbour.beats - delta >= min) {
    slot.beats += delta;
    neighbour.beats -= delta;
    return out;
  }
  if (neighbour && neighbour.beats > min) {
    const take = neighbour.beats - min;
    slot.beats += take;
    neighbour.beats = min;
    return out;
  }
  // Nothing to take: extend into a following bar with the same chord.
  const section = hit.section;
  const barIndex = section.bars.findIndex((b) => b.id === bar.id);
  section.bars.splice(barIndex + 1, 0, makeBar([makeSlot(slot.symbol, out.timeSignature.beats, { ext: { tied: true } })]));
  return out;
}

// --- sections ----------------------------------------------------------------

export function addSection(sheet: ChordSheet, name = "New section", afterSectionId?: string): ChordSheet {
  const out = cloneSheet(sheet);
  const idx = afterSectionId ? out.sections.findIndex((s) => s.id === afterSectionId) : out.sections.length - 1;
  const symbol = lastSymbolBefore(out, out.sections[idx] ?? { id: "", name: "", bars: [], repeat: 1 }, (out.sections[idx]?.bars.length ?? 0) - 1);
  const section = makeSection(name, [makeBar([makeSlot(symbol, out.timeSignature.beats)])]);
  out.sections.splice(idx + 1, 0, section);
  return out;
}

export function deleteSection(sheet: ChordSheet, sectionId: string): ChordSheet {
  const out = cloneSheet(sheet);
  out.sections = out.sections.filter((s) => s.id !== sectionId);
  return out;
}

export function renameSection(sheet: ChordSheet, sectionId: string, name: string): ChordSheet {
  const out = cloneSheet(sheet);
  const s = out.sections.find((x) => x.id === sectionId);
  if (s) s.name = name.trim() || s.name;
  return out;
}

export function moveSection(sheet: ChordSheet, sectionId: string, direction: -1 | 1): ChordSheet {
  const out = cloneSheet(sheet);
  const i = out.sections.findIndex((s) => s.id === sectionId);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= out.sections.length) return sheet;
  [out.sections[i], out.sections[j]] = [out.sections[j], out.sections[i]];
  return out;
}

export function duplicateSection(sheet: ChordSheet, sectionId: string): ChordSheet {
  const out = cloneSheet(sheet);
  const i = out.sections.findIndex((s) => s.id === sectionId);
  if (i < 0) return sheet;
  const src = out.sections[i];
  const copy = makeSection(
    `${src.name} (copy)`,
    src.bars.map((b) => makeBar(b.slots.map((s) => makeSlot(s.symbol, s.beats, { lyric: s.lyric, voicing: s.voicing, rhythm: s.rhythm })))),
    src.repeat,
  );
  out.sections.splice(i + 1, 0, copy);
  return out;
}
