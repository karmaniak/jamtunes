/**
 * Web Audio playback engine. Consumes a Timeline (MIDI note events in beats)
 * and schedules them on sampled instruments with a look-ahead scheduler.
 *
 * Signal path per track: instrument -> track gain -> (dist guitar: soft clip
 * + low-pass) -> panner -> master bus, plus a reverb send. Master bus runs
 * through a gentle compressor. Nothing here knows about chords — it only
 * plays MIDI notes at times, with the per-instrument release / attack /
 * velocity shaping from the instrument registry.
 */
import { CacheStorage, DrumMachine, ElectricPiano, Reverb, Smolken, Soundfont, SplendidGrandPiano } from "smplr";
import type { NoteEvent, Timeline } from "@core/arrange/arranger";
import { GM_DRUMS, instrumentById, instrumentFor, type DrumName, type InstrumentDef } from "@core/instruments";
import { TRACK_IDS, type Arrangement, type TrackId } from "@core/sheet/model";

export type EngineState = "idle" | "loading" | "ready" | "playing";

interface Player {
  start: (e: { note: string | number; velocity?: number; time?: number; duration?: number; ampRelease?: number; lpfCutoffHz?: number; detune?: number }) => unknown;
  stop: () => void;
}

interface LoadedInstrument {
  def: InstrumentDef;
  player: Player;
  drumMap?: Map<number, string>;
}

interface TrackChain {
  input: GainNode;
  panner: StereoPannerNode;
  send: GainNode;
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
  private reverbInput: AudioNode | null = null;
  private chains = new Map<TrackId, TrackChain>();
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
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext({ latencyHint: "interactive" });
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 2.5;
    comp.attack.value = 0.012;
    comp.release.value = 0.25;
    const master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(comp);
    comp.connect(ctx.destination);

    for (const id of TRACK_IDS) {
      const input = ctx.createGain();
      const panner = ctx.createStereoPanner();
      const send = ctx.createGain();
      send.gain.value = 0;
      let last: AudioNode = input;
      if (id === "drums") {
        // Drum bus: a little weight and air, then parallel ("New York") compression for punch.
        const low = ctx.createBiquadFilter();
        low.type = "lowshelf";
        low.frequency.value = 90;
        low.gain.value = 3;
        const high = ctx.createBiquadFilter();
        high.type = "highshelf";
        high.frequency.value = 7000;
        high.gain.value = 2;
        const sum = ctx.createGain();
        const dry = ctx.createGain();
        dry.gain.value = 0.8;
        const squash = ctx.createDynamicsCompressor();
        squash.threshold.value = -28;
        squash.knee.value = 6;
        squash.ratio.value = 8;
        squash.attack.value = 0.003;
        squash.release.value = 0.12;
        const wet = ctx.createGain();
        wet.gain.value = 0.55;
        input.connect(low);
        low.connect(high);
        high.connect(dry);
        high.connect(squash);
        squash.connect(wet);
        dry.connect(sum);
        wet.connect(sum);
        last = sum;
      } else if (id === "bass") {
        // Even out the bass so every note sits at the same weight.
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -20;
        comp.knee.value = 8;
        comp.ratio.value = 4;
        comp.attack.value = 0.01;
        comp.release.value = 0.15;
        input.connect(comp);
        last = comp;
      } else if (id === "distGuitar") {
        // Glue the single-note distortion samples into a wall: soft clip + roll off fizz.
        const shaper = ctx.createWaveShaper();
        shaper.curve = softClipCurve(2.2);
        shaper.oversample = "2x";
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 5200;
        lp.Q.value = 0.6;
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 90;
        input.connect(hp);
        hp.connect(shaper);
        shaper.connect(lp);
        last = lp;
      }
      last.connect(panner);
      panner.connect(master);
      last.connect(send);
      this.chains.set(id, { input, panner, send });
    }
    void this.setupReverb(ctx, master);
    return ctx;
  }

  private async setupReverb(ctx: AudioContext, master: GainNode) {
    try {
      const reverb = new Reverb(ctx);
      await reverb.ready();
      const set = (name: Parameters<typeof reverb.getParam>[0], v: number) => {
        const p = reverb.getParam(name);
        if (p) p.value = v;
      };
      set("wet", 0.9);
      set("dry", 0);
      set("decay", 0.45);
      set("damping", 0.5);
      set("bandwidth", 0.8);
      reverb.connect(master);
      this.reverbInput = reverb.input;
      for (const chain of this.chains.values()) chain.send.connect(reverb.input);
      if (this.arrangement) this.applyMix(this.arrangement);
    } catch {
      this.reverbInput = null; // reverb is a nicety; play dry if its worklet can't load
    }
  }

  /** Load every instrument the arrangement needs. Safe to call repeatedly. */
  async prepare(arrangement: Arrangement): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") await ctx.resume();
    const wanted = TRACK_IDS.filter((t) => arrangement.tracks[t].enabled).map((t) => instrumentFor(t, arrangement.tracks[t].instrument).id);
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
    const resolved = instrumentById(id);
    const destination = this.chains.get(resolved.role)!.input;
    this.loadingKeys.add(id);
    this.onLoadProgress?.(`Loading ${resolved.label}…`);
    try {
      const common = { destination, storage: this.storage, volume: 100 };
      const src = resolved.source;
      switch (src.kind) {
        case "splendid": {
          const inst = SplendidGrandPiano(ctx, { ...common, decayTime: resolved.release });
          await inst.load;
          this.loaded.set(id, { def: resolved, player: inst });
          break;
        }
        case "epiano": {
          const inst = ElectricPiano(ctx, { ...common, instrument: src.name });
          await inst.load;
          this.loaded.set(id, { def: resolved, player: inst });
          break;
        }
        case "smolken": {
          const inst = Smolken(ctx, { ...common, instrument: src.name });
          await inst.load;
          this.loaded.set(id, { def: resolved, player: inst });
          break;
        }
        case "soundfont": {
          const inst = Soundfont(ctx, { ...common, instrument: src.name, kit: src.kit });
          await inst.load;
          this.loaded.set(id, { def: resolved, player: inst });
          break;
        }
        case "drummachine": {
          const dm = DrumMachine(ctx, { ...common, instrument: src.name, volume: 110 });
          const inst = await dm.load;
          const names = (inst as unknown as { getSampleNames?: () => string[] }).getSampleNames?.() ?? [];
          this.loaded.set(id, { def: resolved, player: dm, drumMap: buildDrumMap(names) });
          break;
        }
        default:
          throw new Error(`Instrument source ${src.kind} not supported yet`);
      }
    } finally {
      this.loadingKeys.delete(id);
      this.onLoadProgress?.("");
    }
  }

  applyMix(arrangement: Arrangement) {
    this.arrangement = arrangement;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const id of TRACK_IDS) {
      const t = arrangement.tracks[id];
      const def = instrumentFor(id, t.instrument);
      const chain = this.chains.get(id)!;
      const level = t.enabled ? t.volume * t.volume * def.gain : 0;
      chain.input.gain.setTargetAtTime(level, now, 0.02);
      chain.panner.pan.setTargetAtTime(def.pan, now, 0.02);
      chain.send.gain.setTargetAtTime(this.reverbInput ? def.reverb : 0, now, 0.02);
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
    this.startCtxTime = ctx.currentTime + 0.1;
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

    for (let guard = 0; guard < 4000; guard++) {
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
    if (!arr || !arr.tracks[e.track].enabled || !this.ctx) return;
    const def = instrumentFor(e.track, arr.tracks[e.track].instrument);
    const inst = this.loaded.get(def.id);
    if (!inst) return;
    const [vLo, vHi] = def.velocity;
    const norm = e.velocity / 127;
    const velocity = Math.round(vLo + norm * (vHi - vLo));
    const time = Math.max(this.ctx.currentTime, when - def.attackMs / 1000);
    // Dynamics that single-layer samples don't have: soft hits are darker, and no two hits are identical.
    const brightness = 0.22 + 0.78 * Math.pow(norm, 1.4);
    const lpfCutoffHz = (inst.drumMap ? 16000 : def.role === "bass" ? 7000 : 11000) * brightness;
    const detune = (Math.random() - 0.5) * (inst.drumMap ? 10 : def.role === "piano" ? 0 : 5);
    if (inst.drumMap) {
      const sample = inst.drumMap.get(e.midi);
      if (!sample) return;
      inst.player.start({ note: sample, velocity, time, lpfCutoffHz, detune });
    } else {
      const duration = Math.max(0.06, e.duration * spb);
      inst.player.start({ note: e.midi, velocity, time, duration, ampRelease: def.release, lpfCutoffHz, detune });
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
    this.chains.clear();
    this.setState("idle");
  }
}

function softClipCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
  }
  return curve;
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
