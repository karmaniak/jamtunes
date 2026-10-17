/**
 * Standard MIDI File (format 1) writer for a Timeline. One track per
 * instrument role, GM program changes, drums on channel 10. Used for the
 * "Export .mid" button so the jam can be dropped into any DAW.
 */
import type { NoteEvent, Timeline } from "../arrange/arranger";
import { instrumentFor } from "../instruments";
import type { Arrangement, TrackId } from "../sheet/model";

const PPQ = 480;
const CHANNEL: Record<TrackId, number> = { piano: 0, guitar: 1, distGuitar: 2, bass: 3, drums: 9 };
const TRACK_NAME: Record<TrackId, string> = { piano: "Piano", guitar: "Guitar", distGuitar: "Dist Guitar", bass: "Bass", drums: "Drums" };

export interface MidiExportOptions {
  includeCountIn?: boolean;
  /** Repeat the loop body this many times in the file. */
  loops?: number;
  title?: string;
}

export function timelineToMidi(timeline: Timeline, arrangement: Arrangement, opts: MidiExportOptions = {}): Uint8Array {
  const loops = Math.max(1, opts.loops ?? 1);
  const offset = opts.includeCountIn ? 0 : timeline.loopStart;
  const bodyLen = timeline.loopEnd - timeline.loopStart;

  const tracks: Uint8Array[] = [];
  // A "beat" in the timeline is the time-signature unit. In x/8 meters the
  // tempo is felt in dotted quarters, so quarter-note BPM is 1.5x.
  const ticksPerBeat = PPQ * (4 / timeline.beatUnit);
  const quarterBpm = timeline.beatUnit === 8 ? timeline.tempo * 1.5 : timeline.tempo;
  // Conductor track
  const meta: number[] = [];
  pushMeta(meta, 0, 0x03, strBytes(opts.title ?? "JamTunes"));
  const mpq = Math.round(60_000_000 / quarterBpm);
  pushMeta(meta, 0, 0x51, [(mpq >> 16) & 0xff, (mpq >> 8) & 0xff, mpq & 0xff]);
  pushMeta(meta, 0, 0x58, [timeline.beatsPerBar, Math.log2(timeline.beatUnit), 24, 8]);
  pushMeta(meta, 0, 0x2f, []);
  tracks.push(chunk("MTrk", meta));

  const byTrack = new Map<TrackId, NoteEvent[]>();
  for (const e of timeline.events) {
    if (!opts.includeCountIn && e.start < timeline.loopStart) continue;
    const list = byTrack.get(e.track) ?? [];
    list.push(e);
    byTrack.set(e.track, list);
  }

  for (const [track, events] of byTrack) {
    const ch = CHANNEL[track];
    const raw: { tick: number; order: number; bytes: number[] }[] = [];
    const program = instrumentFor(track, arrangement.tracks[track].instrument).gmProgram;
    const nameBytes = strBytes(TRACK_NAME[track]);
    for (let loop = 0; loop < loops; loop++) {
      for (const e of events) {
        const isCountIn = e.start < timeline.loopStart;
        if (isCountIn && loop > 0) continue;
        const start = e.start - offset + (isCountIn ? 0 : loop * bodyLen);
        const on = Math.round(start * ticksPerBeat);
        const length = e.duration > 0 ? e.duration : 0.25; // drums ring in the engine; give them a short note in the file
        const off = Math.max(on + 1, Math.round((start + length) * ticksPerBeat));
        raw.push({ tick: on, order: 1, bytes: [0x90 | ch, e.midi, e.velocity] });
        raw.push({ tick: off, order: 0, bytes: [0x80 | ch, e.midi, 0] });
      }
    }
    raw.sort((a, b) => a.tick - b.tick || a.order - b.order);
    const data: number[] = [];
    pushMeta(data, 0, 0x03, nameBytes);
    if (track !== "drums") data.push(0, 0xc0 | ch, program);
    let last = 0;
    for (const ev of raw) {
      data.push(...vlq(ev.tick - last), ...ev.bytes);
      last = ev.tick;
    }
    pushMeta(data, 0, 0x2f, []);
    tracks.push(chunk("MTrk", data));
  }

  const header = chunk("MThd", [0, 1, (tracks.length >> 8) & 0xff, tracks.length & 0xff, (PPQ >> 8) & 0xff, PPQ & 0xff]);
  return concat([header, ...tracks]);
}

function pushMeta(out: number[], delta: number, type: number, payload: number[]) {
  out.push(...vlq(delta), 0xff, type, ...vlq(payload.length), ...payload);
}

function vlq(value: number): number[] {
  let v = Math.max(0, Math.round(value));
  const bytes = [v & 0x7f];
  v >>= 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return bytes;
}

function strBytes(s: string): number[] {
  return [...new TextEncoder().encode(s)];
}

function chunk(tag: string, data: number[]): Uint8Array {
  const len = data.length;
  return new Uint8Array([...strBytes(tag), (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff, ...data]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
