/**
 * Complexity: one number per track (0 = simple, 1 = busy) that reshapes the
 * style's pattern for a bar, the way a session player plays the same groove
 * sparser or more involved. Deterministic given the rng.
 *
 * Below ~0.4 patterns are thinned toward the strong beats; above ~0.6 they
 * gain idiomatic embellishments (ghost notes, syncopated kicks, hat
 * openings, approach tones, upper-voice stabs). The middle leaves the style
 * pattern as written.
 */
import type { DrumName } from "../instruments";

export interface ShapeContext {
  rng: () => number;
  stepsPerBeat: number;
  beatsPerBar: number;
}

const SIMPLE_BELOW = 0.4;
const BUSY_ABOVE = 0.6;

function simplifyAmount(c: number): number {
  return c >= SIMPLE_BELOW ? 0 : (SIMPLE_BELOW - c) / SIMPLE_BELOW;
}
function busyAmount(c: number): number {
  return c <= BUSY_ABOVE ? 0 : (c - BUSY_ABOVE) / (1 - BUSY_ABOVE);
}

function chars(steps: string): string[] {
  return steps.split("");
}

function isHit(ch: string): boolean {
  return ch !== "." && ch !== "-";
}

/** Steps that fall on beats, 8th off-beats, or finer subdivisions. */
function positionKind(step: number, spb: number): "beat" | "eighth" | "fine" {
  const pos = step % spb;
  if (pos === 0) return "beat";
  if (spb % 2 === 0 && pos === spb / 2) return "eighth";
  if (spb === 3 && pos === 2) return "eighth"; // swung "and" in triplet grids
  return "fine";
}

/** Keyboard / guitar comping. */
export function shapeComping(steps: string, c: number, ctx: ShapeContext): string {
  const { rng, stepsPerBeat: spb } = ctx;
  const out = chars(steps);
  const s = simplifyAmount(c);
  if (s > 0) {
    // Keep hits on beat 1 (and beat 3 unless very simple); everything else sustains.
    const keep = new Set<number>([0]);
    if (s < 0.75 && ctx.beatsPerBar >= 4) keep.add(spb * 2);
    if (s < 0.4) for (let b = 0; b < ctx.beatsPerBar; b++) keep.add(b * spb);
    for (let i = 0; i < out.length; i++) {
      if (isHit(out[i]) && !keep.has(i) && !/[1-9]/.test(out[i])) out[i] = "-";
      if (/[1-9]/.test(out[i]) && s > 0.6 && positionKind(i, spb) === "fine") out[i] = ".";
    }
    if (!isHit(out[0])) out[0] = "X";
    return out.join("");
  }
  const b = busyAmount(c);
  if (b > 0) {
    let added = 0;
    for (let i = 1; i < out.length && added < 2; i++) {
      if (positionKind(i, spb) !== "eighth") continue;
      if (isHit(out[i]) || isHit(out[i - 1]) || (i + 1 < out.length && isHit(out[i + 1]))) continue;
      if (rng() < b * 0.35) {
        out[i] = "t"; // soft upper-voice stab
        added++;
      }
    }
    // Syncopated re-hit on the last off-beat of the bar ("push").
    const last = out.length - (spb % 2 === 0 ? spb / 2 : 1);
    if (last > 0 && !isHit(out[last]) && rng() < b * 0.5) out[last] = "x";
  }
  return out.join("");
}

/** Bass line. `changesNext` = the next bar starts a different chord (approach tones make sense). */
export function shapeBass(steps: string, c: number, ctx: ShapeContext, changesNext: boolean): string {
  const { rng, stepsPerBeat: spb } = ctx;
  const out = chars(steps);
  const s = simplifyAmount(c);
  if (s > 0) {
    const keep = new Set<number>([0]);
    if (s < 0.75 && ctx.beatsPerBar >= 4) keep.add(spb * 2);
    if (s < 0.4) for (let bt = 0; bt < ctx.beatsPerBar; bt++) keep.add(bt * spb);
    for (let i = 0; i < out.length; i++) if (isHit(out[i]) && !keep.has(i)) out[i] = "-";
    if (!isHit(out[0])) out[0] = "R";
    return out.join("");
  }
  const b = busyAmount(c);
  if (b > 0) {
    let added = 0;
    for (let i = 1; i < out.length - 1 && added < 2; i++) {
      if (positionKind(i, spb) !== "eighth" || isHit(out[i])) continue;
      if (rng() < b * 0.3) {
        out[i] = rng() < 0.5 ? "5" : "8";
        added++;
      }
    }
    const last = out.length - (spb % 2 === 0 ? spb / 2 : 1);
    if (last > 0 && changesNext && rng() < 0.3 + b * 0.6) out[last] = rng() < 0.7 ? "A" : "a";
  }
  return out.join("");
}

/** Drum kit: a map of drum -> steps for one bar. */
export function shapeDrums(patterns: Partial<Record<DrumName, string>>, c: number, ctx: ShapeContext, barInPhrase: number): Partial<Record<DrumName, string>> {
  const { rng, stepsPerBeat: spb } = ctx;
  const out: Partial<Record<DrumName, string>> = {};
  for (const [k, v] of Object.entries(patterns) as [DrumName, string][]) out[k] = v;
  const len = Object.values(out)[0]?.length ?? ctx.beatsPerBar * spb;
  const get = (name: DrumName) => chars(out[name] ?? ".".repeat(len));
  const set = (name: DrumName, v: string[]) => {
    out[name] = v.join("");
  };

  const s = simplifyAmount(c);
  if (s > 0) {
    for (const name of Object.keys(out) as DrumName[]) {
      const v = get(name);
      for (let i = 0; i < v.length; i++) {
        const kind = positionKind(i, spb);
        if (v[i] === "o" && s > 0.2) v[i] = "."; // ghosts go first
        if (kind === "fine" && s > 0.35 && name !== "shaker") v[i] = ".";
        if (kind === "eighth" && s > 0.75 && (name === "kick" || name === "snare" || name === "rim")) v[i] = ".";
      }
      set(name, v);
    }
    if (s > 0.6 && out.hhOpen) set("hhOpen", chars(".".repeat(len)));
    return out;
  }

  const b = busyAmount(c);
  if (b > 0) {
    const kick = get("kick");
    const snare = get(out.snare !== undefined ? "snare" : "rim");
    const snareName: DrumName = out.snare !== undefined ? "snare" : "rim";
    const hats = get(out.hhClosed !== undefined ? "hhClosed" : "ride");
    const hatName: DrumName = out.hhClosed !== undefined ? "hhClosed" : "ride";

    // Ghost notes around the backbeat (16th grids) or on the swung "and" (triplet grids).
    for (let i = 0; i < len; i++) {
      const kind = positionKind(i, spb);
      if (snare[i] !== "." || kick[i] !== ".") continue;
      if ((spb === 4 && kind === "fine") || (spb === 3 && kind === "eighth")) {
        if (rng() < b * 0.28) snare[i] = "o";
      }
    }
    // Extra kick on an "and" (not next to an existing kick).
    for (let i = 1; i < len - 1; i++) {
      if (positionKind(i, spb) !== "eighth" || kick[i] !== "." || kick[i - 1] !== "." || kick[i + 1] !== ".") continue;
      if (rng() < b * 0.22) kick[i] = "x";
    }
    // Open hat on the last off-beat every other bar; busy 16th hats at the top end.
    if (out.hhClosed !== undefined) {
      const open = get("hhOpen");
      const last = len - (spb % 2 === 0 ? spb / 2 : 1);
      if (barInPhrase % 2 === 1 && rng() < 0.4 + b * 0.5) {
        open[last] = "x";
        hats[last] = ".";
      }
      if (spb === 4 && b > 0.6) {
        for (let i = 0; i < len; i++) if (hats[i] === "." && open[i] === "." && positionKind(i, spb) === "fine" && rng() < 0.6) hats[i] = "o";
      }
      set("hhOpen", open);
    }
    set("kick", kick);
    set(snareName, snare);
    set(hatName, hats);
  }
  return out;
}

/** How often fills happen (in phrase bars) for a complexity; 0 = only into new sections. */
export function fillEvery(c: number): number {
  if (c < 0.35) return 0;
  if (c < 0.75) return 4;
  return 2;
}

/** Fill length in beats. */
export function fillBeats(c: number): number {
  return c > 0.6 ? 2 : 1;
}
