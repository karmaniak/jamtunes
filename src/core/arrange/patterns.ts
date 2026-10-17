/**
 * Rhythm pattern DSL. Patterns are one-bar step strings so they're easy to
 * read, diff, and (later) edit in the UI or generate per-section.
 *
 * Comping tracks (piano / guitar / distGuitar):
 *   X  accented chord hit      x  normal chord hit     o  soft chord hit
 *   b  lowest voicing note     t  upper voices only
 *   1-9  single voicing note (1 = lowest), for arpeggios
 *   -  sustain previous hit    .  rest
 *
 * Bass:
 *   R / r  root (normal / soft)   8  root an octave up   L  fifth below root
 *   3 5 6 7  chord tones          A  chromatic approach from below the next root
 *   a  approach from above       -  sustain              .  rest
 *
 * Drums (one string per drum):
 *   X accent   x normal   o ghost   . rest
 *
 * Step length = 1 / stepsPerBeat beats. A string is one bar long; shorter
 * strings are tiled, longer ones are truncated.
 */
import type { DrumName } from "../instruments";
import type { TrackId } from "../sheet/model";

export type CompTrack = Exclude<TrackId, "bass" | "drums">;

export interface TrackPattern {
  steps: string;
  /** Fraction of the sustained length actually sounded (staccato < 1). */
  gate?: number;
}

export interface MeterPatterns {
  stepsPerBeat: number;
  piano: TrackPattern;
  guitar: TrackPattern;
  distGuitar: TrackPattern;
  bass: TrackPattern;
  drums: Partial<Record<DrumName, string>>;
}

export interface ParsedHit {
  step: number;
  char: string;
  /** Number of steps until the next non-sustain char (>= 1). */
  length: number;
}

export const VELOCITY: Record<string, number> = {
  X: 112,
  x: 92,
  o: 62,
  b: 90,
  t: 84,
  R: 102,
  r: 82,
  L: 96,
  "8": 92,
  "3": 86,
  "5": 90,
  "6": 86,
  "7": 86,
  A: 88,
  a: 88,
  "1": 86,
  "2": 84,
  "4": 84,
  "9": 84,
};

/**
 * Fit a pattern string to a bar of `totalSteps` steps. Shorter strings tile;
 * a string that is N whole bars long is a multi-bar phrase and `barIndex`
 * selects the bar (so 2-bar grooves breathe instead of looping one bar).
 */
export function fitPattern(steps: string, totalSteps: number, barIndex = 0): string {
  const clean = steps.replace(/\s+/g, "");
  if (clean.length === 0) return ".".repeat(totalSteps);
  if (clean.length > totalSteps && clean.length % totalSteps === 0) {
    const bars = clean.length / totalSteps;
    const i = barIndex % bars;
    return clean.slice(i * totalSteps, (i + 1) * totalSteps);
  }
  let out = "";
  while (out.length < totalSteps) out += clean;
  return out.slice(0, totalSteps);
}

/** Expand a pattern into hits with sustain lengths. */
export function parseHits(steps: string): ParsedHit[] {
  const hits: ParsedHit[] = [];
  for (let i = 0; i < steps.length; i++) {
    const ch = steps[i];
    if (ch === "." || ch === "-") continue;
    let len = 1;
    while (i + len < steps.length && steps[i + len] === "-") len++;
    hits.push({ step: i, char: ch, length: len });
  }
  return hits;
}

/** True if the step index is inside a sustain run started by an earlier hit. */
export function isSustaining(steps: string, step: number): boolean {
  if (steps[step] !== "-") return false;
  for (let i = step - 1; i >= 0; i--) {
    if (steps[i] === "-") continue;
    return steps[i] !== ".";
  }
  return false;
}

/** Swing offset in beats for a step position (fraction of a beat). */
export function swingOffset(posInBeat: number, swing: number): number {
  if (swing <= 0) return 0;
  const frac = Math.round((posInBeat % 1) * 1000) / 1000;
  if (frac === 0.5) return (swing * 1) / 6; // 8th off-beat -> toward triplet
  if (frac === 0.25 || frac === 0.75) return (swing * 1) / 12;
  return 0;
}

/** Count-in click track: hi-hat quarter notes with an accent on 1. */
export function countInPattern(beats: number): string {
  return Array.from({ length: beats }, (_, i) => (i === 0 ? "X" : "x")).join("");
}
