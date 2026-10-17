/**
 * Web Audio playback engine. Consumes a Timeline (MIDI note events in beats)
 * and schedules them on sampled instruments with a look-ahead scheduler.
 *
 * Sound sources are resolved through the instrument registry; today they're
 * General MIDI soundfonts + a sampled drum machine (via smplr). Nothing here
 * knows about chords — it only plays MIDI notes at times.
 */
import { CacheStorage, DrumMachine, Soundfont } from "smplr";
import type { NoteEvent, Timeline } from "@core/arrange/arranger";
import { GM_DRUMS, instrumentById, type DrumName, type InstrumentDef } from "@core/instruments";
import { TRACK_IDS, type Arrangement, type TrackId } from "@core/sheet/model";

export type EngineState = "idle" | "loading" | "ready" | "playing";

interface LoadedInstrument {
  def: InstrumentDef;
  player: { start: (e: { note: string | number; velocity?: number; time?: number; duration?: number }) => unknown; stop: () => void };
  drumMap?: Map<number, string>;
}

interface PlayOptions {
  loop: boolean;
  /** Timeline beat to start from (defaults to 0 = count-in). */
  startBeat?: number;
}

const LOOKAHEAD_S = 0.3;
const TICK_MS = 60;

export class JamEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private trackGains = new Map<TrackId, GainNode>();
  private loaded = new Map<string, LoadedInstrument>();
  private storage = new CacheStorage();
  private loadingKeys = new Set<string>();

  private timeline: Timeline | null = null;
  private arrangement: Arrangement | null = null;
  private body: NoteEvent[] = [];
  private countIn: NoteEvent[] = [];
  private loop = true;
  private startCtxTime = 0;
  private startBeatOffset = 0;
  private iteration = 0;
  private bodyIndex = 0;
  private countInIndex = 0;
  private timer: number | null = null;
  private raf: number | null = null;

  state: EngineState = "idle";
  onState: ((s: EngineState) => void) | null = null;
  onPosition: ((timelineBeat: number, iteration: number) => void) | null = null;
  onLoadProgress: ((label: string) => void) | null = null;

  private setState(s: EngineState) {
    this.state = s;
    this.onState?.(s);
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      for (const id of TRACK_IDS) {
        const g = this.ctx.createGain();
        g.connect(this.master);
        this.trackGains.set(id, g);
      }
    }
    return this.ctx;
  }

  /** Load every instrument the arrangement needs. Safe to call repeatedly. */
  async prepare(arrangement: Arrangement): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") await ctx.resume();
    const wanted = TRACK_IDS.filter((t) => arrangement.tracks[t].enabled).map((t) => arrangement.tracks[t].instrument);
    const missing = wanted.filter((id) => !this.loaded.has(id) && !this.loadingKeys.has(id));
    if (missing.length === 0) return;
    const wasPlaying = this.state === "playing";
    if (!wasPlaying) this.setState("loading");
    try {
      await Promise.all(missing.map((id) => this.loadInstrument(id)));
    } catch (err) {
      // Don't leave the transport stuck on "Loading…" when a sample CDN is unreachable.
      this.setState(this.loaded.size > 0 ? "ready" : "idle");
      throw new Error(`Couldn't load instrument samples (${err instanceof Error ? err.message : String(err)}). Check your network and try again.`);
    }
    if (this.state === "loading") this.setState("ready");
  }

  private async loadInstrument(id: string): Promise<void> {
    const ctx = this.ensureContext();
    const def = instrumentById(id);
    const destination = this.trackGains.get(def.role)!;
    this.loadingKeys.add(id);
    this.onLoadProgress?.(`Loading ${def.label}…`);
    try {
      if (def.source.kind === "soundfont") {
        const sf = Soundfont(ctx, { instrument: def.source.name, kit: def.source.kit ?? "FluidR3_GM", destination, storage: this.storage, volume: 100 });
        await sf.load;
        this.loaded.set(id, { def, player: sf });
      } else if (def.source.kind === "drummachine") {
        const dm = DrumMachine(ctx, { instrument: def.source.name, destination, storage: this.storage, volume: 110 });
        const inst = await dm.load;
        const names = (inst as unknown as { getSampleNames?: () => string[] }).getSampleNames?.() ?? [];
        this.loaded.set(id, { def, player: dm, drumMap: buildDrumMap(names) });
      } else {
        throw new Error(`Instrument source ${def.source.kind} not supported yet`);
      }
    } finally {
      this.loadingKeys.delete(id);
      this.onLoadProgress?.("");
    }
  }

  applyMix(arrangement: Arrangement) {
    this.arrangement = arrangement;
    if (!this.ctx) return;
    for (const id of TRACK_IDS) {
      const t = arrangement.tracks[id];
      const g = this.trackGains.get(id)!;
      let trim = 1;
      try {
        trim = instrumentById(t.instrument).gain;
      } catch {
        /* unknown instrument: default trim */
      }
      g.gain.setTargetAtTime(t.enabled ? t.volume * t.volume * trim : 0, this.ctx.currentTime, 0.02);
    }
  }

  get isPlaying() {
    return this.state === "playing";
  }

  private secondsPerBeat(): number {
    const t = this.timeline!;
    const spb = 60 / t.tempo;
    return t.beatUnit === 8 ? spb / 3 : spb;
  }

  async play(timeline: Timeline, arrangement: Arrangement, opts: PlayOptions): Promise<void> {
    this.stop(false);
    await this.prepare(arrangement);
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") await ctx.resume();
    this.timeline = timeline;
    this.applyMix(arrangement);
    this.loop = opts.loop;
    this.body = timeline.events.filter((e) => e.start >= timeline.loopStart);
    this.countIn = timeline.events.filter((e) => e.start < timeline.loopStart);
    const startBeat = opts.startBeat ?? 0;
    this.startBeatOffset = startBeat;
    this.iteration = 0;
    this.countInIndex = startBeat > 0 ? this.countIn.length : 0;
    this.bodyIndex = this.body.findIndex((e) => e.start >= Math.max(startBeat, timeline.loopStart));
    if (this.bodyIndex < 0) this.bodyIndex = this.body.length;
    this.startCtxTime = ctx.currentTime + 0.08;
    this.setState("playing");
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
    this.tick();
    const frame = () => {
      if (this.state !== "playing") return;
      this.onPosition?.(this.currentTimelineBeat(), this.iteration);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** Current position expressed as a timeline beat (loopStart..loopEnd), negative during count-in. */
  currentTimelineBeat(): number {
    if (!this.ctx || !this.timeline || this.state !== "playing") return -1;
    const t = this.timeline;
    const elapsedBeats = (this.ctx.currentTime - this.startCtxTime) / this.secondsPerBeat() + this.startBeatOffset;
    const L = t.loopEnd - t.loopStart;
    if (elapsedBeats < t.loopStart) return elapsedBeats - t.loopStart; // count-in: negative
    const inBody = elapsedBeats - t.loopStart;
    return t.loopStart + (this.loop ? inBody % L : Math.min(inBody, L - 1e-6));
  }

  private tick() {
    if (!this.ctx || !this.timeline) return;
    const t = this.timeline;
    const spb = this.secondsPerBeat();
    const horizon = this.ctx.currentTime + LOOKAHEAD_S;
    const L = t.loopEnd - t.loopStart;
    const timeFor = (beat: number) => this.startCtxTime + (beat - this.startBeatOffset) * spb;

    while (this.countInIndex < this.countIn.length) {
      const e = this.countIn[this.countInIndex];
      const when = timeFor(e.start);
      if (when > horizon) return;
      this.schedule(e, when, spb);
      this.countInIndex++;
    }

    for (let guard = 0; guard < 2000; guard++) {
      if (this.bodyIndex >= this.body.length) {
        if (!this.loop) {
          const end = timeFor(t.loopEnd + L * this.iteration);
          if (this.ctx.currentTime > end + 0.5) this.stop();
          return;
        }
        this.iteration++;
        this.bodyIndex = 0;
        if (this.body.length === 0) return;
      }
      const e = this.body[this.bodyIndex];
      const when = timeFor(e.start + L * this.iteration);
      if (when > horizon) return;
      this.schedule(e, when, spb);
      this.bodyIndex++;
    }
  }

  private schedule(e: NoteEvent, when: number, spb: number) {
    const arr = this.arrangement;
    if (!arr || !arr.tracks[e.track].enabled) return;
    const inst = this.loaded.get(arr.tracks[e.track].instrument);
    if (!inst) return;
    const duration = Math.max(0.05, e.duration * spb);
    if (inst.drumMap) {
      const sample = inst.drumMap.get(e.midi);
      if (!sample) return;
      inst.player.start({ note: sample, velocity: e.velocity, time: when, duration: Math.max(duration, 0.5) });
    } else {
      inst.player.start({ note: e.midi, velocity: e.velocity, time: when, duration });
    }
  }

  stop(emit = true) {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    for (const inst of this.loaded.values()) {
      try {
        inst.player.stop();
      } catch {
        /* instrument may not have started */
      }
    }
    if (this.state === "playing" && emit) this.setState("ready");
    else if (this.state === "playing") this.state = "ready";
  }

  dispose() {
    this.stop(false);
    this.ctx?.close();
    this.ctx = null;
    this.loaded.clear();
    this.setState("idle");
  }
}

/** Map GM drum numbers to whatever sample names the loaded kit exposes. */
export function buildDrumMap(sampleNames: string[]): Map<number, string> {
  const prefs: Record<DrumName, RegExp[]> = {
    kick: [/^kick/i, /\bbd\b/i, /bass/i, /kick/i],
    snare: [/^snare/i, /\bsd\b/i, /snare/i],
    rim: [/rim/i, /stick/i, /snare/i],
    clap: [/clap/i, /\bcp\b/i, /snare/i],
    hhClosed: [/hihat[-_ ]?close|closed[-_ ]?h|^ch$|^chh|hat.*cl|close.*hat/i, /hihat$|^hh$|hat/i],
    hhPedal: [/pedal/i, /hihat[-_ ]?close|closed/i, /hat/i],
    hhOpen: [/hihat[-_ ]?open|open[-_ ]?h|^oh$|^ohh|hat.*op|open.*hat/i, /open/i, /hat/i],
    crash: [/crash/i, /cymbal|cym/i, /ride/i, /open/i],
    ride: [/ride/i, /cymbal|cym/i, /crash/i],
    rideBell: [/bell/i, /ride/i, /cymbal|cym/i],
    tomLow: [/tom.*(low|lo\b|l\b|floor)/i, /low.*tom|ltom|tom3/i, /tom/i],
    tomMid: [/tom.*(mid|m\b)/i, /mid.*tom|mtom|tom2/i, /tom/i],
    tomHigh: [/tom.*(hi|high|h\b)/i, /hi.*tom|htom|tom1/i, /tom/i],
    cowbell: [/cow/i, /bell/i, /rim/i],
    shaker: [/shaker|maraca|cabasa|tamb/i, /hat/i],
  };
  const map = new Map<number, string>();
  for (const [name, midi] of Object.entries(GM_DRUMS) as [DrumName, number][]) {
    for (const re of prefs[name]) {
      const hit = sampleNames.find((s) => re.test(s));
      if (hit) {
        map.set(midi, hit);
        break;
      }
    }
  }
  return map;
}
