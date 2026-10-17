/**
 * Style presets: patterns per meter, per track. Adding a style is adding
 * data here. A style can specialise any meter; missing meters fall back to
 * GENERIC_METERS so every style plays in 4/4, 3/4, 6/8 and 2/4.
 *
 * Drum (and some bass) patterns are written as 2-bar phrases so grooves
 * breathe: the second bar carries the small variation a drummer would play.
 * Gates: 1 = sustain into the next hit (legato), < 1 = detached, > 1 = let
 * ring over the next notes (arpeggios).
 */
import type { TrackId, VoicingHint } from "../sheet/model";
import type { MeterPatterns } from "./patterns";

export interface Style {
  id: string;
  label: string;
  description: string;
  defaultTempo: number;
  swing: number;
  /** Which tracks are on when this style is applied. */
  tracks: Partial<Record<TrackId, boolean>>;
  /** Preferred voicing per role for this style. */
  voicings?: Partial<Record<TrackId, VoicingHint>>;
  /** Preferred instrument per role (ids from the registry). */
  instruments?: Partial<Record<TrackId, string>>;
  meters: Record<string, MeterPatterns>;
}

const GENERIC_METERS: Record<string, MeterPatterns> = {
  "4/4": {
    stepsPerBeat: 2,
    piano: { steps: "X---x---", gate: 1 },
    guitar: { steps: "X-x-x-x-", gate: 1 },
    distGuitar: { steps: "X-------", gate: 1 },
    bass: { steps: "R---5---", gate: 1 },
    drums: { kick: "X...x...X...x.x.", snare: "..X...X...X...X.", hhClosed: "xxxxxxxxxxxxxxx.", hhOpen: "...............x" },
  },
  "3/4": {
    stepsPerBeat: 2,
    piano: { steps: "b-x-x-", gate: 1 },
    guitar: { steps: "b-x-x-", gate: 1 },
    distGuitar: { steps: "X-----", gate: 1 },
    bass: { steps: "R---5-R---5-", gate: 1 },
    drums: { kick: "X.....X....o", snare: "..x.x...x.x.", hhClosed: "x.x.x.x.x.x." },
  },
  "6/8": {
    stepsPerBeat: 2,
    piano: { steps: "X-----x-----", gate: 1 },
    guitar: { steps: "1.3.5.8.5.3.", gate: 2 },
    distGuitar: { steps: "X-----x-----", gate: 1 },
    bass: { steps: "R-----5-----", gate: 1 },
    drums: { kick: "X.....x.....X.....x...o.", snare: "......X...........X.....", hhClosed: "x.x.x.x.x.x.x.x.x.x.x.x." },
  },
  "2/4": {
    stepsPerBeat: 2,
    piano: { steps: "X-x-", gate: 1 },
    guitar: { steps: "X-x-", gate: 1 },
    distGuitar: { steps: "X---", gate: 1 },
    bass: { steps: "R-5-", gate: 1 },
    drums: { kick: "X...X.x.", snare: "..X...X.", hhClosed: "xxxxxxxx" },
  },
};

export const STYLES: Style[] = [
  {
    id: "rock",
    label: "Rock",
    description: "Straight 8ths, driving pick bass, power chords.",
    defaultTempo: 120,
    swing: 0,
    tracks: { piano: true, guitar: false, distGuitar: false, bass: true, drums: true },
    voicings: { distGuitar: "power", guitar: "open" },
    instruments: { piano: "epiano", guitar: "guitarClean", distGuitar: "guitarDist", bass: "bassPick", drums: "drums" },
    meters: {
      "4/4": {
        stepsPerBeat: 2,
        piano: { steps: "X---x-x-X---x---", gate: 1 },
        guitar: { steps: "X-x-X-xxX-x-X-x-", gate: 1 },
        distGuitar: { steps: "XxxxXxxxXxxxXxx-", gate: 0.7 },
        bass: { steps: "RrRrRrRrRrRrRr5A", gate: 0.95 },
        drums: {
          kick: "X...X.x.X..xX.x.",
          snare: "..X...X...X...Xo",
          hhClosed: "XxXxXxXxXxXxXxX.",
          hhOpen: "...............x",
        },
      },
    },
  },
  {
    id: "pop",
    label: "Pop",
    description: "Clean 8ths and 16ths, picked guitar, melodic bass.",
    defaultTempo: 104,
    swing: 0.08,
    tracks: { piano: true, guitar: false, distGuitar: false, bass: true, drums: true },
    voicings: { guitar: "open" },
    instruments: { piano: "epiano", guitar: "guitarClean", bass: "bass", drums: "drums" },
    meters: {
      "4/4": {
        stepsPerBeat: 4,
        piano: { steps: "X-----x---x-----X-----x---x-x---", gate: 1 },
        guitar: { steps: "1.3.5.8.3.5.8.5.", gate: 2 },
        distGuitar: { steps: "X-------x-------", gate: 1 },
        bass: { steps: "R-----r-R-----5-R-----r-R---8-A-", gate: 1 },
        drums: {
          kick: "X...x...X..x....X...x...X..x..x.",
          snare: "....X.......X.......X.......X.o.",
          hhClosed: "x.x.x.x.x.x.x.x.x.x.x.x.x.x.x...",
          hhOpen: "..............................x.",
        },
      },
    },
  },
  {
    id: "ballad",
    label: "Ballad",
    description: "Slow, sustained piano with arpeggiated acoustic and a soft rim-click groove.",
    defaultTempo: 72,
    swing: 0,
    tracks: { piano: true, guitar: false, distGuitar: false, bass: true, drums: true },
    voicings: { piano: "open", guitar: "open" },
    instruments: { piano: "epiano", guitar: "guitarSteel", bass: "bass", drums: "drums" },
    meters: {
      "4/4": {
        stepsPerBeat: 4,
        piano: { steps: "X-------t-------X-------t---b---", gate: 1 },
        guitar: { steps: "1.3.5.8.3.5.8.5.", gate: 2.2 },
        distGuitar: { steps: "X---------------", gate: 1 },
        bass: { steps: "R-------5-------R-------5-----A-", gate: 1 },
        drums: {
          kick: "X.......x.......X.......x.....o.",
          rim: "....x.......x.......x.......x...",
          hhClosed: "o.x.o.x.o.x.o.x.o.x.o.x.o.x.o.x.",
        },
      },
      "6/8": {
        stepsPerBeat: 2,
        piano: { steps: "X-----t-----", gate: 1 },
        guitar: { steps: "1.3.5.8.5.3.", gate: 2 },
        distGuitar: { steps: "X-----------", gate: 1 },
        bass: { steps: "R-----5-----R-----5---A-", gate: 1 },
        drums: { kick: "X.....o.....X.....o...o.", rim: "......x...........x.....", hhClosed: "x.o.o.x.o.o.x.o.o.x.o.o." },
      },
    },
  },
  {
    id: "funk",
    label: "Funk",
    description: "Tight 16th-note stabs, syncopated bass, busy hats.",
    defaultTempo: 100,
    swing: 0.15,
    tracks: { piano: true, guitar: false, distGuitar: false, bass: true, drums: true },
    voicings: { piano: "rootless", guitar: "shell" },
    instruments: { piano: "wurli", guitar: "guitarClean", bass: "bass", drums: "drums" },
    meters: {
      "4/4": {
        stepsPerBeat: 4,
        piano: { steps: "x.x...x..x..x.x.x.x...x..x.x..x.", gate: 0.45 },
        guitar: { steps: "x.xx.x.xx.x.xx.x", gate: 0.3 },
        distGuitar: { steps: "X-------x-------", gate: 1 },
        bass: { steps: "R..R..5.R.8...A.R..R..5.R..7.8..", gate: 0.6 },
        drums: {
          kick: "X..x..x...x..x..X..x..x...x..x.x",
          snare: "....X.......X..o....X.......X.oo",
          hhClosed: "xxXxxxXxxxXxxxXxxxXxxxXxxxXxxxX.",
          hhOpen: "...............................x",
        },
      },
    },
  },
  {
    id: "shuffle",
    label: "Blues shuffle",
    description: "Triplet shuffle with a boogie bass line and overdriven guitar.",
    defaultTempo: 112,
    swing: 0,
    tracks: { piano: true, guitar: false, distGuitar: false, bass: true, drums: true },
    voicings: { distGuitar: "power", guitar: "open" },
    instruments: { piano: "epiano", guitar: "guitarClean", distGuitar: "guitarOverdrive", bass: "bassPick", drums: "drums" },
    meters: {
      "4/4": {
        stepsPerBeat: 3,
        piano: { steps: "x.xx.xx.xx.x", gate: 0.7 },
        guitar: { steps: "X.xX.xX.xX.x", gate: 0.8 },
        distGuitar: { steps: "X.xX.xX.xX.x", gate: 0.75 },
        bass: { steps: "R..3..5..6..R..3..5..A..", gate: 0.85 },
        drums: {
          kick: "X..x..X..x..X..x..X..xx.",
          snare: "...X.....X.....X.....X.o",
          hhClosed: "x.xx.xx.xx.xx.xx.xx.xx.x",
        },
      },
    },
  },
  {
    id: "swing",
    label: "Jazz swing",
    description: "Walking upright bass, ride cymbal, sparse comping.",
    defaultTempo: 140,
    swing: 0,
    tracks: { piano: true, guitar: false, distGuitar: false, bass: true, drums: true },
    voicings: { piano: "rootless", guitar: "shell" },
    instruments: { piano: "epiano", guitar: "guitarJazz", bass: "bassUpright", drums: "drums" },
    meters: {
      "4/4": {
        stepsPerBeat: 3,
        piano: { steps: "X....x..........x....x...", gate: 0.6 },
        guitar: { steps: "x..x..x..x..", gate: 0.45 },
        distGuitar: { steps: "X-----------", gate: 1 },
        bass: { steps: "R..3..5..A..R..5..3..A..", gate: 0.92 },
        drums: {
          ride: "x..x.xx..x.xx..x.xx..x.x",
          hhPedal: "...x.....x.....x.....x..",
          kick: "o..o..o..o..o..o..o..o..",
          snare: ".....o...........o....o.",
        },
      },
      "3/4": {
        stepsPerBeat: 3,
        piano: { steps: "X....x...", gate: 0.6 },
        guitar: { steps: "x..x..x..", gate: 0.45 },
        distGuitar: { steps: "X--------", gate: 1 },
        bass: { steps: "R..5..A..", gate: 0.92 },
        drums: { ride: "x..x.xx..", hhPedal: "...x..x..", kick: "o........" },
      },
    },
  },
  {
    id: "bossa",
    label: "Bossa nova",
    description: "Syncopated nylon guitar, rim-click clave, 1-and-5 upright bass.",
    defaultTempo: 126,
    swing: 0,
    tracks: { piano: true, guitar: false, distGuitar: false, bass: true, drums: true },
    voicings: { piano: "rootless", guitar: "close" },
    instruments: { piano: "epiano", guitar: "guitarNylon", bass: "bassUpright", drums: "drumsCR" },
    meters: {
      "4/4": {
        stepsPerBeat: 4,
        piano: { steps: "X..x..x...x..x..", gate: 0.55 },
        guitar: { steps: "b.x..xb.x..x.x..", gate: 0.65 },
        distGuitar: { steps: "X---------------", gate: 1 },
        bass: { steps: "R.....5.R.....5.", gate: 0.95 },
        drums: {
          kick: "X.....x.X.....x.",
          rim: "..x..x...x..x.....x..x...x..x...",
          hhClosed: "x.x.x.x.x.x.x.x.",
          shaker: "oxoxoxoxoxoxoxox",
        },
      },
    },
  },
];

export function styleById(id: string): Style {
  return STYLES.find((s) => s.id === id) ?? STYLES[0];
}

export function meterKey(beats: number, unit: number): string {
  return `${beats}/${unit}`;
}

/** Patterns for a style in a meter, with generic fallback. */
export function patternsFor(style: Style, beats: number, unit: number): MeterPatterns {
  const key = meterKey(beats, unit);
  return style.meters[key] ?? GENERIC_METERS[key] ?? synthesiseMeter(beats);
}

/** Last-resort pattern for odd meters: downbeat-heavy, one chord hit per beat. */
function synthesiseMeter(beats: number): MeterPatterns {
  const beatHits = (first: string, rest: string) => Array.from({ length: beats }, (_, i) => (i === 0 ? first : rest)).join("");
  const backbeat = Array.from({ length: beats }, (_, i) => (i % 2 === 1 ? "x" : ".")).join("");
  return {
    stepsPerBeat: 1,
    piano: { steps: beatHits("X", "-"), gate: 1 },
    guitar: { steps: beatHits("X", "x"), gate: 1 },
    distGuitar: { steps: beatHits("X", "-"), gate: 1 },
    bass: { steps: beatHits("R", "-"), gate: 1 },
    drums: { kick: beatHits("X", "."), hhClosed: beatHits("x", "x"), snare: beats > 2 ? backbeat : "" },
  };
}
