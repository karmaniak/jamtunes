/**
 * Voicing engine: chord -> concrete MIDI notes for a given track role, with
 * simple voice-leading against the previous voicing so comping doesn't jump
 * around. Voicing strategies are keyed by VoicingHint and can be extended
 * (e.g. "drop3", "quartal", "spread") without touching the arranger.
 */
import type { Chord } from "../theory/chords";
import { mod12, pcAbove, pcNearest } from "../theory/notes";
import type { TrackId, VoicingHint } from "../sheet/model";

export interface VoicingContext {
  role: TrackId;
  range: [number, number];
  hint: VoicingHint;
  prev?: number[];
}

export function voiceChord(chord: Chord, ctx: VoicingContext): number[] {
  const hint = ctx.hint === "auto" ? defaultHint(ctx.role) : ctx.hint;
  switch (hint) {
    case "power":
      return powerVoicing(chord, ctx.range);
    case "shell":
      return ledVoicing(shellPcs(chord), ctx);
    case "rootless":
      return ledVoicing(rootlessPcs(chord), ctx);
    case "open":
      return ctx.role === "guitar" || ctx.role === "distGuitar" ? guitarVoicing(chord, ctx.range) : drop2(ledVoicing(pianoPcs(chord), ctx), ctx.range);
    case "close":
    default:
      return ctx.role === "guitar" || ctx.role === "distGuitar" ? guitarVoicing(chord, ctx.range) : ledVoicing(pianoPcs(chord), ctx);
  }
}

export function defaultHint(role: TrackId): VoicingHint {
  switch (role) {
    case "distGuitar":
      return "power";
    case "guitar":
      return "open";
    default:
      return "close";
  }
}

/** Bass note: slash bass if present, otherwise the root, placed near the middle of the bass range. */
export function bassNote(chord: Chord, range: [number, number]): number {
  const pc = chord.bassPc ?? chord.rootPc;
  const centre = range[0] + 10;
  let n = pcNearest(pc, centre);
  while (n < range[0]) n += 12;
  while (n > range[1]) n -= 12;
  return n;
}

/** Interval-degree helpers used by bass patterns (3rd, 5th, 7th, 6th of the current chord). */
export function chordTone(chord: Chord, which: "3" | "5" | "6" | "7" | "2"): number {
  const has = (i: number) => chord.intervals.includes(i);
  switch (which) {
    case "3":
      return has(3) ? 3 : has(4) ? 4 : has(5) ? 5 : has(2) ? 2 : 4;
    case "5":
      return has(7) ? 7 : has(6) ? 6 : has(8) ? 8 : 7;
    case "6":
      return has(9) ? 9 : has(8) && !has(7) ? 8 : 9;
    case "7":
      return has(10) ? 10 : has(11) ? 11 : has(9) && chord.quality === "dim" ? 9 : chordTone(chord, "5");
    case "2":
      return has(2) ? 2 : has(14) ? 2 : 2;
  }
}

// --- pitch-class selection -------------------------------------------------

/** Up to 5 tones for keyboard comping: 3rd and 7th first, root, then colours, 5th last. */
function pianoPcs(chord: Chord): number[] {
  const iv = chord.intervals;
  if (iv.length <= 4) return iv.map((i) => mod12(chord.rootPc + i));
  const has = (i: number) => iv.includes(i);
  const order: number[] = [];
  const push = (i: number | undefined) => { if (i !== undefined && has(i) && !order.includes(i)) order.push(i); };
  push([3, 4, 5, 2].find(has));
  push([10, 11, 9].find(has));
  push(0);
  for (const ext of [14, 13, 15, 18, 17, 21, 20]) push(ext);
  push([6, 8].find(has)); // altered fifths are colour, keep them
  push(7);
  return order.slice(0, 5).sort((a, b) => a - b).map((i) => mod12(chord.rootPc + i));
}

function shellPcs(chord: Chord): number[] {
  const iv = chord.intervals;
  const third = [3, 4, 5, 2].find((i) => iv.includes(i));
  const seventh = [10, 11, 9].find((i) => iv.includes(i) && chord.hasSeventh);
  const tones = [third, seventh ?? [7, 6, 8].find((i) => iv.includes(i))].filter((x): x is number => x !== undefined);
  if (!seventh) tones.unshift(0);
  return tones.map((i) => mod12(chord.rootPc + i));
}

function rootlessPcs(chord: Chord): number[] {
  const pcs = pianoPcs(chord);
  return pcs.length >= 4 ? pcs.filter((pc) => pc !== chord.rootPc) : pcs;
}

// --- strategies ------------------------------------------------------------

function powerVoicing(chord: Chord, range: [number, number]): number[] {
  const root = pcAbove(chord.rootPc, range[0]);
  const fifth = chord.intervals.includes(6) && !chord.intervals.includes(7) ? 6 : 7;
  return [root, root + fifth, root + 12].filter((n) => n <= range[1]);
}

/** Barre-shape-ish stack: root, 5th, octave, 3rd, then 7th/extension or another 5th. */
function guitarVoicing(chord: Chord, range: [number, number]): number[] {
  const root = pcAbove(chord.rootPc, range[0]);
  const iv = chord.intervals;
  const has = (i: number) => iv.includes(i);
  if (chord.quality === "power") return [root, root + 7, root + 12];
  const fifth = has(6) ? 6 : has(8) ? 8 : 7;
  const third = [4, 3, 5, 2].find(has) ?? 4;
  const notes = [root, root + fifth, root + 12, root + 12 + third];
  const seventh = [10, 11, 9].find((i) => has(i) && (chord.hasSeventh || i === 9));
  if (seventh !== undefined) notes.push(root + 12 + seventh);
  else notes.push(root + 12 + fifth);
  if (has(14) || has(13) || has(15)) notes.push(root + 12 + ([14, 13, 15].find(has) as number));
  return notes.filter((n) => n <= range[1]);
}

/** Voice-led close voicing: try every rotation/octave inside the range, pick the one nearest the previous voicing. */
function ledVoicing(pcs: number[], ctx: VoicingContext): number[] {
  const [lo, hi] = ctx.range;
  const uniq = [...new Set(pcs.map(mod12))].sort((a, b) => a - b);
  const candidates: number[][] = [];
  for (let r = 0; r < uniq.length; r++) {
    const rot = [...uniq.slice(r), ...uniq.slice(0, r)];
    for (let base = lo; base < lo + 12; base++) {
      if (mod12(base) !== rot[0]) continue;
      let v = [base];
      for (let i = 1; i < rot.length; i++) v.push(pcAbove(rot[i], v[i - 1] + 1));
      while (v[v.length - 1] <= hi) {
        candidates.push(v);
        v = v.map((n) => n + 12);
      }
      break;
    }
  }
  if (candidates.length === 0) return uniq.map((pc) => pcAbove(pc, lo));
  const target = ctx.prev && ctx.prev.length ? mean(ctx.prev) : (lo + hi) / 2 - 1;
  let best = candidates[0];
  let bestScore = Infinity;
  for (const c of candidates) {
    let score = Math.abs(mean(c) - target) * 1.5;
    if (ctx.prev && ctx.prev.length) {
      for (const n of c) score += Math.min(...ctx.prev.map((p) => Math.abs(p - n)));
    }
    // Avoid muddy low clusters: penalise minor seconds below middle C.
    for (let i = 1; i < c.length; i++) if (c[i] - c[i - 1] <= 1 && c[i] < 60) score += 6;
    if (score < bestScore) { bestScore = score; best = c; }
  }
  return best;
}

function drop2(voicing: number[], range: [number, number]): number[] {
  if (voicing.length < 4) return voicing;
  const v = [...voicing];
  const idx = v.length - 2;
  const dropped = v[idx] - 12;
  if (dropped < range[0]) return v;
  v.splice(idx, 1);
  return [dropped, ...v].sort((a, b) => a - b);
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
