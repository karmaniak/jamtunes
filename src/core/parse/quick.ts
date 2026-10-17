/**
 * Quick progression syntax — the fastest way to get a jam going.
 *
 *   Am F C G                 one bar each
 *   | Am F | C G |           two chords per bar, split evenly
 *   Am . . . F . . .         dots add beats (each dot = 1 beat)
 *   Am(2) F(2) C(4)          explicit beats
 *   Dm7 G7 Cmaj7 x2          repeat the line
 *   [Chorus]                 section header
 *
 * A separate timing string ("4 4 2 2", "2b 2b", "6/8") can override beats
 * per chord, bars per chord and the time signature.
 */
import { looksLikeChord } from "../theory/chords";
import { makeBar, makeSection, makeSlot, type Bar, type ChordSlot, type Section, type TimeSignature } from "../sheet/model";

export interface ChordItem {
  symbol: string;
  beats: number;
  lyric?: string;
}

export interface QuickParseResult {
  sections: Section[];
  timeSignature?: TimeSignature;
  tempo?: number;
  warnings: string[];
}

export interface Timing {
  beatsPerChord?: number[];
  timeSignature?: TimeSignature;
  tempo?: number;
}

const SECTION_WORDS = /^(intro|verse|pre-?chorus|chorus|bridge|outro|solo|interlude|instrumental|refrain|coda|tag|ending|turnaround|head|vamp|breakdown|hook|part\s*\w+)\b/i;
const REST_TOKENS = new Set(["N.C.", "NC", "n.c.", "-", "—", "rest"]);

export function parseTiming(text: string | undefined): Timing {
  const t: Timing = {};
  if (!text) return t;
  const beats: number[] = [];
  for (const tok of text.trim().split(/[\s,]+/)) {
    if (!tok) continue;
    let m: RegExpExecArray | null;
    if ((m = /^(\d+)\/(\d+)$/.exec(tok))) t.timeSignature = { beats: Number(m[1]), unit: Number(m[2]) };
    else if ((m = /^(\d+)\s*bpm$/i.exec(tok))) t.tempo = Number(m[1]);
    else if ((m = /^(\d+(?:\.\d+)?)b(?:ars?)?$/i.exec(tok))) beats.push(-Number(m[1])); // negative = bars, resolved later
    else if ((m = /^(\d+(?:\.\d+)?)$/.exec(tok))) beats.push(Number(m[1]));
  }
  if (beats.length) t.beatsPerChord = beats;
  return t;
}

export function isSectionHeader(line: string): string | null {
  const trimmed = line.trim();
  let m = /^\[([^\]]{1,40})\]\s*:?\s*(?:x\s*\d+)?$/i.exec(trimmed);
  if (m) return m[1].trim();
  m = /^\(([^)]{1,40})\)$/.exec(trimmed);
  if (m && SECTION_WORDS.test(m[1])) return m[1].trim();
  m = /^([A-Za-z][A-Za-z \-']{0,30}?\d?)\s*:$/.exec(trimmed);
  if (m && SECTION_WORDS.test(m[1])) return m[1].trim();
  if (/^[A-Za-z\- ]{3,20}\s?\d?$/.test(trimmed) && SECTION_WORDS.test(trimmed) && !trimmed.split(/\s+/).some(looksLikeChord)) return trimmed;
  return null;
}

/** Extract a trailing "x2" / "(x3)" / "×2" repeat marker. */
export function stripRepeat(line: string): { line: string; repeat: number } {
  const m = /\(?\s*[x×]\s*(\d+)\s*\)?\s*$/i.exec(line);
  if (!m) return { line, repeat: 1 };
  return { line: line.slice(0, m.index).trimEnd(), repeat: Math.max(1, Number(m[1])) };
}

/**
 * Parse one chord line into items. Returns null if it isn't a chord line.
 * `explicitBars` is true when the line used `|` bar separators.
 */
export function parseChordLine(line: string, ts: TimeSignature, defaultBeats: number): { items: ChordItem[]; explicitBars: boolean } | null {
  const hasBars = line.includes("|");
  // Dot notation ("C . . . G . . .") means one symbol per beat, so a bare chord is 1 beat on such lines.
  const hasDots = /(^|\s)[./%](\s|$)/.test(line) || /\S\.{2,}(\s|$)/.test(line);
  const segments = hasBars ? line.split("|").map((s) => s.trim()).filter((s) => s.length > 0) : [line.trim()];
  const items: ChordItem[] = [];
  let chordTokens = 0;
  let otherTokens = 0;

  interface Pending { symbol: string; explicit?: number; dots: number }

  for (const seg of segments) {
    const pending: Pending[] = [];
    const tokens = seg.split(/\s+/).filter(Boolean);
    let groupStart = 0; // "Cmaj7 D x4 Em" repeats everything since the previous marker
    for (const raw of tokens) {
      let tok = raw.replace(/,$/, "");
      const rep = /^\(?[x×](\d+)\)?$/i.exec(tok);
      if (rep) {
        const group = pending.slice(groupStart);
        for (let n = 1; n < Number(rep[1]); n++) pending.push(...group.map((p) => ({ ...p })));
        groupStart = pending.length;
        continue;
      }
      if (tok === "." || tok === "/" || tok === "%") {
        if (pending.length) pending[pending.length - 1].dots += 1;
        else if (items.length) items[items.length - 1].beats += 1;
        continue;
      }
      let explicit: number | undefined;
      let dots = 0;
      const dotsAttached = /^(.*?)(\.{2,})$/.exec(tok); // "C..." style
      if (dotsAttached && !/^N\.C\.?$/i.test(tok)) {
        tok = dotsAttached[1];
        dots = dotsAttached[2].length;
      }
      const paren = /^(.+?)[(:](\d+(?:\.\d+)?)\)?$/.exec(tok);
      if (paren && (looksLikeChord(paren[1]) || REST_TOKENS.has(paren[1]))) {
        tok = paren[1];
        explicit = Number(paren[2]);
      }
      if (REST_TOKENS.has(tok)) {
        pending.push({ symbol: "N.C.", explicit, dots });
        chordTokens++;
      } else if (looksLikeChord(tok)) {
        pending.push({ symbol: tok, explicit, dots });
        chordTokens++;
      } else {
        otherTokens++;
      }
    }
    const base = hasDots ? 1 : defaultBeats;
    const segItems: ChordItem[] = pending.map((p) => ({
      symbol: p.symbol,
      beats: p.explicit !== undefined ? p.explicit + p.dots : p.dots > 0 || hasDots ? 1 + p.dots : hasBars ? NaN : base,
    }));
    if (hasBars) {
      // Explicit bar: fill unspecified beats so the bar sums to the time signature.
      const specified = segItems.filter((i) => !Number.isNaN(i.beats)).reduce((n, i) => n + i.beats, 0);
      const unspecified = segItems.filter((i) => Number.isNaN(i.beats));
      if (unspecified.length) {
        const remaining = Math.max(0, ts.beats - specified);
        const each = Math.floor(remaining / unspecified.length);
        const leftover = remaining - each * unspecified.length;
        unspecified.forEach((i, idx) => (i.beats = (each || remaining / unspecified.length) + (idx === 0 && each ? leftover : 0)));
      }
    }
    items.push(...segItems);
  }

  if (chordTokens === 0) return null;
  if (chordTokens / (chordTokens + otherTokens) < 0.6) return null;
  return { items, explicitBars: hasBars };
}

/** Pack chord items into bars of the time signature, splitting chords that span bar lines. */
export function packIntoBars(items: ChordItem[], ts: TimeSignature): Bar[] {
  const bars: Bar[] = [];
  let current: ChordSlot[] = [];
  let used = 0;
  for (const item of items) {
    let remaining = item.beats;
    let first = true;
    while (remaining > 1e-6) {
      const space = ts.beats - used;
      const take = Math.min(space, remaining);
      const slot = makeSlot(item.symbol, take, first && item.lyric ? { lyric: item.lyric } : {});
      if (!first) slot.ext = { tied: true };
      current.push(slot);
      used += take;
      remaining -= take;
      first = false;
      if (used >= ts.beats - 1e-6) {
        bars.push(makeBar(current));
        current = [];
        used = 0;
      }
    }
  }
  if (current.length) {
    // Pad an incomplete final bar by extending the last chord.
    current[current.length - 1].beats += ts.beats - used;
    bars.push(makeBar(current));
  }
  return bars;
}

export function parseQuick(text: string, timingText?: string, baseTs: TimeSignature = { beats: 4, unit: 4 }): QuickParseResult {
  const timing = parseTiming(timingText);
  const ts = timing.timeSignature ?? baseTs;
  const warnings: string[] = [];
  const sections: Section[] = [];
  let currentName = "Main";
  let currentItems: ChordItem[] = [];
  let currentRepeat = 1;
  let chordIndex = 0;

  const beatsFor = (idx: number): number => {
    const list = timing.beatsPerChord;
    if (!list || list.length === 0) return ts.beats;
    const v = list[idx % list.length];
    return v < 0 ? -v * ts.beats : v;
  };

  const flush = () => {
    if (currentItems.length === 0) return;
    sections.push(makeSection(currentName, packIntoBars(currentItems, ts), currentRepeat));
    currentItems = [];
    currentRepeat = 1;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const header = isSectionHeader(line);
    if (header) {
      flush();
      currentName = header;
      const rep = /[x×]\s*(\d+)/i.exec(line);
      if (rep) currentRepeat = Number(rep[1]);
      continue;
    }
    const { line: body, repeat } = stripRepeat(line);
    const parsed = parseChordLine(body, ts, ts.beats);
    if (!parsed) {
      warnings.push(`Skipped line: "${line}"`);
      continue;
    }
    let lineItems = parsed.items;
    if (!parsed.explicitBars && timing.beatsPerChord) {
      lineItems = lineItems.map((it) => ({ ...it, beats: beatsFor(chordIndex++) }));
    }
    if (repeat > 1) {
      const once = lineItems;
      lineItems = [];
      for (let i = 0; i < repeat; i++) lineItems.push(...once.map((it) => ({ ...it })));
    }
    currentItems.push(...lineItems);
  }
  flush();
  return { sections, timeSignature: timing.timeSignature, tempo: timing.tempo, warnings };
}
