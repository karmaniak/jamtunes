/**
 * Style presets: one bar of patterns per meter, per track. Adding a style is
 * adding data here. A style can specialise any meter; missing meters fall back
 * to GENERIC_METERS so every style plays in 4/4, 3/4, 6/8 and 2/4.
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
    piano: { steps: "X---x---" },
    guitar: { steps: "X-x-x-x-" },
    distGuitar: { steps: "X-------" },
    bass: { steps: "R---5---" },
    drums: { kick: "X...x...", snare: "..X...X.", hhClosed: "xxxxxxxx" },
  },
  "3/4": {
    stepsPerBeat: 2,
    piano: { steps: "b-x-x-" },
    guitar: { steps: "b-x-x-" },
    distGuitar: { steps: "X-----" },
    bass: { steps: "R---5-" },
    drums: { kick: "X.....", snare: "..x.x.", hhClosed: "x.x.x." },
  },
  "6/8": {
    stepsPerBeat: 2,
    piano: { steps: "X-----x-----" },
    guitar: { steps: "1.3.5.8.5.3." },
    distGuitar: { steps: "X-----x-----" },
    bass: { steps: "R-----5-----" },
    drums: { kick: "X.....x.....", snare: "......X.....", hhClosed: "x.x.x.x.x.x." },
  },
  "2/4": {
    stepsPerBeat: 2,
    piano: { steps: "X-x-" },
    guitar: { steps: "X-x-" },
    distGuitar: { steps: "X---" },
    bass: { steps: "R-5-" },
    drums: { kick: "X...", snare: "..X.", hhClosed: "xxxx" },
  },
};

export const STYLES: Style[] = [
  {
    id: "rock",
    label: "Rock",
    description: "Straight 8ths, driving bass, power chords.",
    defaultTempo: 120,
    swing: 0,
    tracks: { piano: true, guitar: true, distGuitar: true, bass: true, drums: true },
    voicings: { distGuitar: "power", guitar: "open" },
    meters: {
      "4/4": {
        stepsPerBeat: 2,
        piano: { steps: "X---x-x-" },
        guitar: { steps: "X-x-X-xx" },
        distGuitar: { steps: "XxxxXxxx", gate: 0.8 },
        bass: { steps: "RrRrRrRr", gate: 0.85 },
        drums: { kick: "X...X.x.", snare: "..X...X.", hhClosed: "XxXxXxXx" },
      },
    },
  },
  {
    id: "pop",
    label: "Pop",
    description: "Clean 8ths and 16ths, picked guitar, melodic bass.",
    defaultTempo: 104,
    swing: 0,
    tracks: { piano: true, guitar: true, distGuitar: false, bass: true, drums: true },
    voicings: { guitar: "open" },
    meters: {
      "4/4": {
        stepsPerBeat: 4,
        piano: { steps: "X-----x---x-----" },
        guitar: { steps: "1.3.5.8.3.5.8.5." },
        distGuitar: { steps: "X-------x-------" },
        bass: { steps: "R-----r-R-----5-", gate: 0.9 },
        drums: { kick: "X...x...X..x....", snare: "....X.......X...", hhClosed: "x.x.x.x.x.x.x.x." },
      },
    },
  },
  {
    id: "ballad",
    label: "Ballad",
    description: "Slow, sustained pads with arpeggiated guitar and brushes feel.",
    defaultTempo: 72,
    swing: 0,
    tracks: { piano: true, guitar: true, distGuitar: false, bass: true, drums: true },
    voicings: { piano: "open", guitar: "open" },
    instruments: { guitar: "guitarSteel" },
    meters: {
      "4/4": {
        stepsPerBeat: 4,
        piano: { steps: "X-------t-------" },
        guitar: { steps: "1.3.5.8.3.5.8.5." },
        distGuitar: { steps: "X---------------" },
        bass: { steps: "R-------5-------" },
        drums: { kick: "X.......x.......", rim: "....x.......x...", hhClosed: "o.x.o.x.o.x.o.x." },
      },
      "6/8": {
        stepsPerBeat: 2,
        piano: { steps: "X-----t-----" },
        guitar: { steps: "1.3.5.8.5.3." },
        distGuitar: { steps: "X-----------" },
        bass: { steps: "R-----5-----" },
        drums: { kick: "X.....o.....", rim: "......x.....", hhClosed: "x.o.o.x.o.o." },
      },
    },
  },
  {
    id: "funk",
    label: "Funk",
    description: "Tight 16th-note stabs, syncopated bass, busy hats.",
    defaultTempo: 100,
    swing: 0.15,
    tracks: { piano: true, guitar: true, distGuitar: false, bass: true, drums: true },
    voicings: { piano: "rootless", guitar: "shell" },
    instruments: { piano: "epiano" },
    meters: {
      "4/4": {
        stepsPerBeat: 4,
        piano: { steps: "x.x...x..x..x.x.", gate: 0.4 },
        guitar: { steps: "x.xx.x.xx.x.xx.x", gate: 0.3 },
        distGuitar: { steps: "X-------x-------" },
        bass: { steps: "R..R..5.R.8...A.", gate: 0.6 },
        drums: { kick: "X..x..x...x..x..", snare: "....X.......X..o", hhClosed: "xxXxxxXxxxXxxxXx" },
      },
    },
  },
  {
    id: "shuffle",
    label: "Blues shuffle",
    description: "Triplet shuffle with a boogie bass line.",
    defaultTempo: 112,
    swing: 0,
    tracks: { piano: true, guitar: true, distGuitar: true, bass: true, drums: true },
    voicings: { distGuitar: "power", guitar: "open" },
    instruments: { distGuitar: "guitarOverdrive" },
    meters: {
      "4/4": {
        stepsPerBeat: 3,
        piano: { steps: "x.xx.xx.xx.x", gate: 0.6 },
        guitar: { steps: "X.xX.xX.xX.x", gate: 0.7 },
        distGuitar: { steps: "X.xX.xX.xX.x", gate: 0.7 },
        bass: { steps: "R..3..5..6..", gate: 0.8 },
        drums: { kick: "X..x..X..x..", snare: "...X.....X..", hhClosed: "x.xx.xx.xx.x" },
      },
    },
  },
  {
    id: "swing",
    label: "Jazz swing",
    description: "Walking bass, ride cymbal, sparse comping.",
    defaultTempo: 140,
    swing: 0,
    tracks: { piano: true, guitar: true, distGuitar: false, bass: true, drums: true },
    voicings: { piano: "rootless", guitar: "shell" },
    instruments: { guitar: "guitarNylon", bass: "bassUpright" },
    meters: {
      "4/4": {
        stepsPerBeat: 3,
        piano: { steps: "X....x......", gate: 0.5 },
        guitar: { steps: "x..x..x..x..", gate: 0.4 },
        distGuitar: { steps: "X-----------" },
        bass: { steps: "R..3..5..A..", gate: 0.9 },
        drums: { ride: "x..x.xx..x.x", hhPedal: "...x.....x..", kick: "o..o..o..o.." },
      },
      "3/4": {
        stepsPerBeat: 3,
        piano: { steps: "X....x...", gate: 0.5 },
        guitar: { steps: "x..x..x..", gate: 0.4 },
        distGuitar: { steps: "X--------" },
        bass: { steps: "R..5..A..", gate: 0.9 },
        drums: { ride: "x..x.xx..", hhPedal: "...x..x..", kick: "o........" },
      },
    },
  },
  {
    id: "bossa",
    label: "Bossa nova",
    description: "Syncopated nylon guitar, rim-click clave, 1-and-5 bass.",
    defaultTempo: 126,
    swing: 0,
    tracks: { piano: true, guitar: true, distGuitar: false, bass: true, drums: true },
    voicings: { piano: "rootless", guitar: "close" },
    instruments: { guitar: "guitarNylon", piano: "epiano" },
    meters: {
      "4/4": {
        stepsPerBeat: 4,
        piano: { steps: "X..x..x...x..x..", gate: 0.5 },
        guitar: { steps: "b.x..xb.x..x.x..", gate: 0.6 },
        distGuitar: { steps: "X---------------" },
        bass: { steps: "R.....5.R.....5.", gate: 0.9 },
        drums: { kick: "X.....x.X.....x.", rim: "..x..x...x..x...", hhClosed: "x.x.x.x.x.x.x.x.", shaker: "oxoxoxoxoxoxoxox" },
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
  return {
    stepsPerBeat: 1,
    piano: { steps: beatHits("X", "-") },
    guitar: { steps: beatHits("X", "x") },
    distGuitar: { steps: beatHits("X", "-") },
    bass: { steps: beatHits("R", "-") },
    drums: { kick: beatHits("X", "."), hhClosed: beatHits("x", "x"), snare: beats > 2 ? beatHits(".", "x").replace(/x/g, (_, i: number) => (i % 2 === 1 ? "x" : ".")) : "" },
  };
}
