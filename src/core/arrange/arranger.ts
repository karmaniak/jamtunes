/**
 * Arranger: ChordSheet + Arrangement -> Timeline of MIDI note events.
 *
 * Deterministic (seeded by the sheet id) so the same sheet always produces
 * the same track, in the browser and in the exported .mid file. No audio
 * here — the audio engine and the MIDI writer both consume the Timeline.
 */
import { parseChord, type Chord } from "../theory/chords";
import { GM_DRUMS, instrumentById, type DrumName } from "../instruments";
import type { ChordSheet, ChordSlot, Section, TrackId, VoicingHint } from "../sheet/model";
import { normaliseBar } from "../sheet/model";
import { hashString, seededRandom } from "../util/random";
import { bassNote, chordTone, voiceChord } from "./voicing";
import { countInPattern, fitPattern, isSustaining, parseHits, swingOffset, VELOCITY, type CompTrack, type MeterPatterns } from "./patterns";
import { patternsFor, styleById, type Style } from "./styles";

export interface NoteEvent {
  track: TrackId;
  midi: number;
  velocity: number; // 1..127
  start: number; // beats from timeline start
  duration: number; // beats
}

export interface SlotMarker {
  start: number;
  end: number;
  sectionId: string;
  sectionPass: number;
  barId: string;
  slotId: string;
  symbol: string;
}

export interface Timeline {
  events: NoteEvent[];
  tempo: number;
  beatsPerBar: number;
  beatUnit: number;
  /** Beat where the looped body begins (after count-in). */
  loopStart: number;
  /** Beat where the body ends (loop point). */
  loopEnd: number;
  markers: SlotMarker[];
}

interface BarInstance {
  section: Section;
  sectionPass: number;
  barIndex: number;
  isSectionStart: boolean;
  isSectionEnd: boolean;
  startBeat: number;
}

const DRUM_DURATION = 0.25;

export function buildTimeline(sheet: ChordSheet): Timeline {
  const { timeSignature: ts, arrangement } = sheet;
  const beatsPerBar = ts.beats;
  const rand = seededRandom(hashString(sheet.id));
  const events: NoteEvent[] = [];
  const markers: SlotMarker[] = [];

  // Count-in
  const countInBeats = arrangement.countIn * beatsPerBar;
  if (arrangement.countIn > 0 && arrangement.tracks.drums.enabled) {
    const click = fitPattern(countInPattern(beatsPerBar), countInBeats);
    for (const hit of parseHits(click)) {
      events.push({ track: "drums", midi: GM_DRUMS.hhClosed, velocity: VELOCITY[hit.char], start: hit.step, duration: DRUM_DURATION });
    }
  }

  // Expand sections/repeats into bar instances
  const bars: BarInstance[] = [];
  let cursor = countInBeats;
  for (const section of sheet.sections) {
    for (let pass = 0; pass < Math.max(1, section.repeat); pass++) {
      section.bars.forEach((_, barIndex) => {
        bars.push({
          section,
          sectionPass: pass,
          barIndex,
          isSectionStart: barIndex === 0,
          isSectionEnd: barIndex === section.bars.length - 1,
          startBeat: cursor,
        });
        cursor += beatsPerBar;
      });
    }
  }
  const loopEnd = cursor;

  // Per-track voice-leading memory
  const prevVoicing: Partial<Record<TrackId, number[]>> = {};
  const baseStyle = styleById(arrangement.style);

  bars.forEach((inst, i) => {
    const bar = normaliseBar(inst.section.bars[inst.barIndex], ts);
    const style = sectionStyle(inst.section, baseStyle);
    const pats = patternsFor(style, ts.beats, ts.unit);
    const spb = pats.stepsPerBeat;
    const totalSteps = beatsPerBar * spb;
    const swing = typeof inst.section.ext?.swing === "number" ? (inst.section.ext.swing as number) : arrangement.swing;

    // Slot -> step ranges
    const slotRanges: { slot: ChordSlot; chord: Chord | null; from: number; to: number }[] = [];
    let stepCursor = 0;
    bar.slots.forEach((slot, idx) => {
      const len = idx === bar.slots.length - 1 ? totalSteps - stepCursor : Math.max(1, Math.round(slot.beats * spb));
      slotRanges.push({ slot, chord: parseChord(slot.symbol), from: stepCursor, to: stepCursor + len });
      markers.push({
        start: inst.startBeat + stepCursor / spb,
        end: inst.startBeat + (stepCursor + len) / spb,
        sectionId: inst.section.id,
        sectionPass: inst.sectionPass,
        barId: bar.id,
        slotId: slot.id,
        symbol: slot.symbol,
      });
      stepCursor += len;
    });
    const nextBar = bars[i + 1] ?? bars[0];
    const nextRoot = nextBar ? firstChord(nextBar.section.bars[nextBar.barIndex].slots) : null;

    const stepBeat = (step: number) => inst.startBeat + step / spb + swingOffset((step % spb) / spb, swing);
    const jitter = (amount: number) => (rand() - 0.5) * 2 * amount * arrangement.humanize;

    // Comping tracks
    for (const track of ["piano", "guitar", "distGuitar"] as CompTrack[]) {
      const settings = arrangement.tracks[track];
      if (!settings.enabled) continue;
      const pat = pats[track];
      const steps = fitPattern(settings.pattern ?? pat.steps, totalSteps);
      const gate = pat.gate ?? 1;
      const instrument = instrumentById(settings.instrument);
      const hint: VoicingHint = settings.voicing ?? style.voicings?.[track] ?? "auto";

      for (const range of slotRanges) {
        if (!range.chord) continue;
        const slotHint: VoicingHint = range.slot.voicing ?? hint;
        const voicing = voiceChord(range.chord, { role: track, range: instrument.range, hint: slotHint, prev: prevVoicing[track] });
        prevVoicing[track] = voicing;
        const slotSteps = steps.slice(range.from, range.to);
        const hits = parseHits(slotSteps);
        // A chord change in the middle of a sustain must be heard: retrigger softly.
        if (range.from > 0 && isSustaining(steps, range.from) && !hits.some((h) => h.step === 0)) {
          let len = 1;
          while (len < slotSteps.length && slotSteps[len] === "-") len++;
          hits.unshift({ step: 0, char: "o", length: len });
        }
        for (const hit of hits) {
          const notes = notesForHit(hit.char, voicing);
          const start = stepBeat(range.from + hit.step) + jitter(0.02);
          const duration = Math.max(0.1, (hit.length / spb) * gate - 0.02);
          const baseVel = VELOCITY[hit.char] ?? 90;
          notes.forEach((midi, n) => {
            // Strum: stagger guitar notes by a few ms, low to high.
            const strum = track === "piano" ? 0 : n * 0.012;
            events.push({ track, midi, velocity: clampVel(baseVel + jitter(10) - n * 1.5), start: start + strum, duration });
          });
        }
      }
    }

    // Bass
    if (arrangement.tracks.bass.enabled) {
      const settings = arrangement.tracks.bass;
      const instrument = instrumentById(settings.instrument);
      const steps = fitPattern(settings.pattern ?? pats.bass.steps, totalSteps);
      const gate = pats.bass.gate ?? 0.95;
      slotRanges.forEach((range, ri) => {
        if (!range.chord) return;
        const root = bassNote(range.chord, instrument.range);
        const upcoming = slotRanges[ri + 1]?.chord ?? nextRoot;
        const slotSteps = steps.slice(range.from, range.to);
        const hits = parseHits(slotSteps);
        if (range.from > 0 && isSustaining(steps, range.from) && !hits.some((h) => h.step === 0)) {
          let len = 1;
          while (len < slotSteps.length && slotSteps[len] === "-") len++;
          hits.unshift({ step: 0, char: "r", length: len });
        }
        for (const hit of hits) {
          const midi = bassNoteFor(hit.char, range.chord, root, upcoming, instrument.range);
          if (midi === null) continue;
          events.push({
            track: "bass",
            midi,
            velocity: clampVel((VELOCITY[hit.char] ?? 95) + jitter(8)),
            start: stepBeat(range.from + hit.step) + jitter(0.01),
            duration: Math.max(0.1, (hit.length / spb) * gate - 0.02),
          });
        }
      });
    }

    // Drums
    if (arrangement.tracks.drums.enabled) {
      const drumPatterns = drumPatternsFor(pats, totalSteps);
      for (const [name, steps] of drumPatterns) {
        for (const hit of parseHits(steps)) {
          events.push({
            track: "drums",
            midi: GM_DRUMS[name],
            velocity: clampVel((VELOCITY[hit.char] ?? 90) + jitter(10)),
            start: stepBeat(hit.step) + (hit.char === "o" ? jitter(0.015) : 0),
            duration: DRUM_DURATION,
          });
        }
      }
      if (inst.isSectionStart && inst.sectionPass === 0) {
        events.push({ track: "drums", midi: GM_DRUMS.crash, velocity: 100, start: inst.startBeat, duration: 1 });
      }
      if (inst.isSectionEnd && inst.section.bars.length > 1 && inst.sectionPass === inst.section.repeat - 1) {
        addFill(events, inst.startBeat + beatsPerBar - 1, spb >= 3 ? 3 : 4, rand);
      }
    }
  });

  return {
    events: events.sort((a, b) => a.start - b.start),
    tempo: sheet.tempo,
    beatsPerBar,
    beatUnit: ts.unit,
    loopStart: countInBeats,
    loopEnd,
    markers,
  };
}

function sectionStyle(section: Section, fallback: Style): Style {
  const override = section.ext?.style;
  return typeof override === "string" ? styleById(override) : fallback;
}

function firstChord(slots: ChordSlot[]): Chord | null {
  for (const s of slots) {
    const c = parseChord(s.symbol);
    if (c) return c;
  }
  return null;
}

function notesForHit(char: string, voicing: number[]): number[] {
  if (voicing.length === 0) return [];
  switch (char) {
    case "X":
    case "x":
    case "o":
      return voicing;
    case "b":
      return [voicing[0]];
    case "t":
      return voicing.length > 1 ? voicing.slice(1) : voicing;
    default: {
      const n = Number(char);
      if (Number.isInteger(n) && n >= 1) {
        // Arpeggio index wraps past the voicing by climbing an octave.
        const idx = (n - 1) % voicing.length;
        const octaves = Math.floor((n - 1) / voicing.length);
        return [voicing[idx] + 12 * octaves];
      }
      return voicing;
    }
  }
}

function bassNoteFor(char: string, chord: Chord, root: number, next: Chord | null, range: [number, number]): number | null {
  const inRange = (n: number) => {
    let x = n;
    while (x > range[1]) x -= 12;
    while (x < range[0]) x += 12;
    return x;
  };
  switch (char) {
    case "R":
    case "r":
    case "x":
    case "X":
      return root;
    case "8":
      return inRange(root + 12);
    case "L":
      return inRange(root - 5);
    case "3":
    case "5":
    case "6":
    case "7":
      return inRange(root + chordTone(chord, char));
    case "2":
      return inRange(root + 2);
    case "A":
    case "a": {
      const target = next ? bassNote(next, range) : root;
      return inRange(char === "A" ? target - 1 : target + 1);
    }
    default:
      return null;
  }
}

function drumPatternsFor(pats: MeterPatterns, totalSteps: number): [DrumName, string][] {
  return (Object.entries(pats.drums) as [DrumName, string | undefined][])
    .filter((e): e is [DrumName, string] => typeof e[1] === "string" && e[1].length > 0)
    .map(([name, steps]) => [name, fitPattern(steps, totalSteps)]);
}

/** Simple snare build over the last beat of a section. */
function addFill(events: NoteEvent[], startBeat: number, subdivisions: number, rand: () => number) {
  const toms: number[] = [GM_DRUMS.snare, GM_DRUMS.tomHigh, GM_DRUMS.tomMid, GM_DRUMS.tomLow];
  for (let i = 0; i < subdivisions; i++) {
    const midi = i === 0 ? GM_DRUMS.snare : toms[Math.min(toms.length - 1, 1 + Math.floor(rand() * 3))];
    events.push({ track: "drums", midi, velocity: clampVel(80 + i * 8), start: startBeat + i / subdivisions, duration: DRUM_DURATION });
  }
}

function clampVel(v: number): number {
  return Math.max(1, Math.min(127, Math.round(v)));
}

/** Convenience for debug views: a compact textual dump of what will be played (never shown as a keyboard). */
export function describeTimeline(t: Timeline): string {
  const byTrack = new Map<TrackId, number>();
  for (const e of t.events) byTrack.set(e.track, (byTrack.get(e.track) ?? 0) + 1);
  const lines = [`tempo ${t.tempo} · ${t.beatsPerBar}/${t.beatUnit} · loop ${t.loopStart}→${t.loopEnd} beats`];
  for (const [track, n] of byTrack) lines.push(`${track}: ${n} notes`);
  return lines.join("\n");
}
