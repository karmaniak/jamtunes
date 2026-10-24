/**
 * Chat contract. The assistant never produces audio or notes; it produces a
 * small, typed set of *sheet changes* (tempo, style, key/mode, progression in
 * quick syntax, track toggles). The deterministic engine does the music.
 *
 * `interpretLocally` is the offline fallback so the app is useful without an
 * API key: it understands the common vibe words, numbers and chord lists.
 */
import { z } from "zod";
import { STYLES } from "../arrange/styles";
import { MODE_NAMES, type ModeName } from "../theory/scales";
import { looksLikeChord } from "../theory/chords";
import { noteToPc } from "../theory/notes";
import { TRACK_IDS, type ChordSheet, type TrackId } from "../sheet/model";
import { relabelKey, setMode, setStyle, setSwing, setTempo, setTonic, transposeSheet, updateTrack } from "../sheet/transforms";
import { sheetFromQuick } from "../parse/build";

const styleIds = STYLES.map((s) => s.id) as [string, ...string[]];

export const SheetChangesSchema = z.object({
  reply: z.string().describe("One or two friendly sentences describing what changed, musician to musician."),
  tempo: z.number().nullable().describe("New tempo in BPM, or null to keep."),
  style: z.enum(styleIds).nullable().describe("Style preset id, or null to keep."),
  key: z
    .object({ tonic: z.string().describe("Note name like D or Bb"), mode: z.enum(MODE_NAMES) })
    .nullable()
    .describe("Target key/mode. Changing only the mode reinterprets the progression modally; changing the tonic transposes."),
  transpose: z.number().nullable().describe("Semitones to transpose, or null."),
  timeSignature: z.object({ beats: z.number(), unit: z.number() }).nullable(),
  swing: z.number().nullable().describe("0 straight .. 1 full swing, or null."),
  progression: z
    .string()
    .nullable()
    .describe("Replace the whole progression using quick syntax: '[Verse]\\n| Am F | C G |' bars with |, dots for beats, x2 repeats. Null to keep."),
  title: z.string().nullable(),
  tracks: z
    .array(
      z.object({
        id: z.enum(TRACK_IDS as [TrackId, ...TrackId[]]),
        enabled: z.boolean().nullable(),
        volume: z.number().nullable().describe("0..1"),
        voicing: z.enum(["auto", "close", "open", "shell", "power", "rootless"]).nullable(),
        complexity: z.number().nullable().describe("0 = simple/sparse, 0.5 = as written, 1 = busy/involved. Null to keep."),
      }),
    )
    .nullable(),
});
export type SheetChanges = z.infer<typeof SheetChangesSchema>;

export function emptyChanges(reply = ""): SheetChanges {
  return { reply, tempo: null, style: null, key: null, transpose: null, timeSignature: null, swing: null, progression: null, title: null, tracks: null };
}

/** Compact description of the current sheet for the model and for the local interpreter. */
export function summariseSheet(sheet: ChordSheet): string {
  const lines = [
    `title: ${sheet.title}`,
    `tempo: ${sheet.tempo} bpm, time: ${sheet.timeSignature.beats}/${sheet.timeSignature.unit}, key: ${sheet.key.tonic} ${sheet.key.mode}, style: ${sheet.arrangement.style}, swing: ${sheet.arrangement.swing}`,
    `tracks: ${TRACK_IDS.map((t) => `${t}=${sheet.arrangement.tracks[t].enabled ? "on" : "off"}`).join(" ")}`,
  ];
  for (const s of sheet.sections) {
    const bars = s.bars.map((b) => b.slots.map((sl) => (sl.beats === sheet.timeSignature.beats ? sl.symbol : `${sl.symbol}(${sl.beats})`)).join(" ")).join(" | ");
    lines.push(`[${s.name}]${s.repeat > 1 ? ` x${s.repeat}` : ""} | ${bars} |`);
  }
  return lines.join("\n");
}

/**
 * Models and people write progressions many ways: "Cmaj7 - Am7 - Dm7 - G7",
 * "Cmaj7, Am7", "Cmaj7 → Am7", "||: Am | F :||". Bring them to quick syntax.
 */
export function normaliseProgression(text: string): string {
  return text
    .replace(/\|\|:|:\|\||\|\|/g, "|")
    .replace(/[→➜➔,;]+/g, " ")
    .replace(/(^|\s)[-–—]+(?=\s|$)/g, " ") // dashes used as separators (not "-7" suffixes)
    .replace(/\b(bars?|beats?|then|and)\b:?/gi, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** A short title when none was given: the request's gist, else style + key. */
export function autoTitle(sheet: ChordSheet, hint?: string | null): string {
  if (hint) {
    const cleaned = hint
      .replace(/^(please\s+)?(i\s+(want|need|would like)\s+(a|an|some)?\s*|make\s+(me\s+)?(a|an|it)?\s*|give\s+me\s+(a|an)?\s*|can\s+you\s+(make|give\s+me)\s+(a|an)?\s*|let'?s\s+(do|try|have)\s+(a|an)?\s*)/i, "")
      .replace(/[:.!?].*$/, "")
      .trim();
    const words = cleaned.split(/\s+/).filter((w) => !looksLikeChord(w) && !/^[|.()x×\d-]+$/.test(w));
    if (words.length >= 2 && words.length <= 7) return words.join(" ").replace(/^./, (ch) => ch.toUpperCase());
  }
  const style = STYLES.find((s) => s.id === sheet.arrangement.style)?.label ?? sheet.arrangement.style;
  return `${style} in ${sheet.key.tonic} ${sheet.key.mode === "ionian" ? "major" : sheet.key.mode === "aeolian" ? "minor" : sheet.key.mode}`;
}

/** Which fields of a sheet differ — so the reply can say what actually happened. */
export function describeDiff(before: ChordSheet, after: ChordSheet): string[] {
  const out: string[] = [];
  if (before === after) return out;
  if (before.tempo !== after.tempo) out.push(`tempo ${before.tempo}→${after.tempo}`);
  if (before.arrangement.style !== after.arrangement.style) out.push(`style ${after.arrangement.style}`);
  if (before.key.tonic !== after.key.tonic || before.key.mode !== after.key.mode) out.push(`key ${after.key.tonic} ${after.key.mode}`);
  if (before.timeSignature.beats !== after.timeSignature.beats || before.timeSignature.unit !== after.timeSignature.unit) out.push(`time ${after.timeSignature.beats}/${after.timeSignature.unit}`);
  if (before.arrangement.swing !== after.arrangement.swing) out.push(`swing ${Math.round(after.arrangement.swing * 100)}%`);
  const beforeChords = before.sections.map((s) => s.bars.map((b) => b.slots.map((sl) => sl.symbol).join(" ")).join("|")).join("/");
  const afterChords = after.sections.map((s) => s.bars.map((b) => b.slots.map((sl) => sl.symbol).join(" ")).join("|")).join("/");
  if (beforeChords !== afterChords) out.push(`new progression (${after.sections.reduce((n, s) => n + s.bars.length, 0)} bars)`);
  if (before.title !== after.title) out.push(`titled “${after.title}”`);
  for (const id of TRACK_IDS) {
    const a = before.arrangement.tracks[id];
    const b = after.arrangement.tracks[id];
    if (a.enabled !== b.enabled) out.push(`${id} ${b.enabled ? "on" : "off"}`);
    if ((a.complexity ?? 0.5) !== (b.complexity ?? 0.5)) out.push(`${id} ${(b.complexity ?? 0.5) > (a.complexity ?? 0.5) ? "busier" : "simpler"}`);
    if (a.volume !== b.volume) out.push(`${id} ${Math.round(b.volume * 100)}%`);
  }
  return out;
}

export function applyChanges(sheet: ChordSheet, c: SheetChanges, requestText?: string): ChordSheet {
  let out = sheet;
  if (c.progression) {
    const styleChanged = !!c.style && c.style !== out.arrangement.style;
    const { sheet: fresh } = sheetFromQuick(normaliseProgression(c.progression), undefined, {
      style: c.style ?? out.arrangement.style,
      // A new style with no explicit tempo takes the style's own tempo.
      tempo: c.tempo ?? (styleChanged ? undefined : out.tempo),
      timeSignature: c.timeSignature ?? out.timeSignature,
      title: c.title ?? undefined,
    });
    // Never replace a sheet with nothing: an unparsable progression is ignored, the rest still applies.
    if (fresh.sections.length > 0) {
      fresh.arrangement = { ...out.arrangement, style: fresh.arrangement.style, tracks: fresh.arrangement.tracks, swing: fresh.arrangement.swing };
      fresh.source = { kind: "chat", text: c.progression };
      if (!c.title) fresh.title = autoTitle(fresh, requestText);
      out = fresh;
    }
  }
  if (c.style && c.style !== out.arrangement.style) out = setStyle(out, c.style, { keepTempo: c.tempo === null && !c.progression });
  if (c.tempo) out = setTempo(out, c.tempo);
  if (c.timeSignature && !c.progression) out = { ...out, timeSignature: c.timeSignature };
  if (c.swing !== null && c.swing !== undefined) out = setSwing(out, c.swing);
  if (c.transpose) out = transposeSheet(out, c.transpose);
  if (c.key) {
    const tonicOk = noteToPc(c.key.tonic) !== null;
    if (tonicOk && c.key.tonic !== out.key.tonic && !c.transpose) out = setTonic(out, c.key.tonic);
    if (c.key.mode !== out.key.mode) out = setMode(out, c.key.mode);
    if (tonicOk) out = relabelKey(out, c.key.tonic, c.key.mode);
  }
  if (c.title && !c.progression) out = { ...out, title: c.title };
  if (c.tracks) {
    for (const t of c.tracks) {
      const patch: Partial<ChordSheet["arrangement"]["tracks"][TrackId]> = {};
      if (t.enabled !== null) patch.enabled = t.enabled;
      if (t.volume !== null) patch.volume = Math.max(0, Math.min(1, t.volume));
      if (t.voicing !== null) patch.voicing = t.voicing;
      if (t.complexity !== null && t.complexity !== undefined) patch.complexity = Math.max(0, Math.min(1, t.complexity));
      out = updateTrack(out, t.id, patch);
    }
  }
  return out;
}

// --- offline interpreter ----------------------------------------------------

const STYLE_WORDS: [RegExp, string][] = [
  [/\b(rock|punk|grunge|metal|heavy)\b/i, "rock"],
  [/\b(pop|indie|acoustic)\b/i, "pop"],
  [/\b(ballad|slow|mellow|moody|chill|dreamy|ambient)\b/i, "ballad"],
  [/\b(funk|funky|groove|groovy)\b/i, "funk"],
  [/\b(shuffle|blues|bluesy|boogie)\b/i, "shuffle"],
  [/\b(swing|jazz|jazzy|bebop)\b/i, "swing"],
  [/\b(bossa|latin|samba|brazil\w*)\b/i, "bossa"],
];

const TRACK_WORDS: [RegExp, TrackId][] = [
  [/\bdrums?|kit|beat\b/i, "drums"],
  [/\bbass\b/i, "bass"],
  [/\bpiano|keys|keyboard\b/i, "piano"],
  [/\b(dist(orted|ortion)?|heavy|crunch\w*|overdrive\w*)\s*(guitar|gtr)?\b/i, "distGuitar"],
  [/\b(clean\s+)?(guitar|gtr|strum\w*)\b/i, "guitar"],
];

const RUN_SEPARATOR = /^(\||\.+|[-–—]|\(?[x×]\d+\)?|\[[^\]]+\]|then)$/i;

/** Longest run of chord-ish tokens in free text, as quick syntax. Null if fewer than two chords. */
export function extractProgression(msg: string): string | null {
  const tokens = msg.replace(/[,:;]/g, " ").split(/\s+/).filter(Boolean);
  let best: string[] = [];
  let bestChords = 0;
  let run: string[] = [];
  let chords = 0;
  const flush = () => {
    // Two bare letters ("A and B") aren't a progression; real ones have suffixes or more chords.
    const credible = chords >= 3 || run.some((t) => looksLikeChord(t) && t.length > 1);
    if (chords >= 2 && credible && chords > bestChords) {
      best = run;
      bestChords = chords;
    }
    run = [];
    chords = 0;
  };
  for (const raw of tokens) {
    const t = /^\.+$/.test(raw) ? raw : raw.replace(/[.!?]+$/, "");
    if (looksLikeChord(t)) {
      run.push(t);
      chords++;
    } else if (RUN_SEPARATOR.test(t) && run.length) {
      const rep = /^\(?[x×](\d+)\)?$/i.exec(t);
      if (rep) run.push(`x${rep[1]}`);
      else if (t === "|" || /^\.+$/.test(t) || t.startsWith("[")) run.push(t);
    } else {
      flush();
    }
  }
  flush();
  return best.length ? best.join(" ") : null;
}

export function interpretLocally(message: string, sheet: ChordSheet): SheetChanges {
  const c = emptyChanges();
  const notes: string[] = [];
  const msg = message.trim();

  const bpm = /(\d{2,3})\s*(bpm|beats per minute)/i.exec(msg) ?? /\b(?:tempo|speed)\s*(?:to|at|of|=)?\s*(\d{2,3})\b/i.exec(msg);
  if (bpm) {
    c.tempo = Number(bpm[1]);
    notes.push(`tempo ${c.tempo}`);
  } else if (/\b(faster|speed (it )?up|quicker|more energy)\b/i.test(msg)) {
    c.tempo = Math.round(sheet.tempo * 1.12);
    notes.push(`tempo up to ${c.tempo}`);
  } else if (/\b(slower|slow (it )?down|laid.?back|relax\w*)\b/i.test(msg)) {
    c.tempo = Math.round(sheet.tempo * 0.88);
    notes.push(`tempo down to ${c.tempo}`);
  }

  for (const [re, id] of STYLE_WORDS) {
    if (re.test(msg)) {
      c.style = id;
      notes.push(`${id} feel`);
      break;
    }
  }

  const ts = /\b(\d{1,2})\s*\/\s*(4|8)\b/.exec(msg);
  if (ts) c.timeSignature = { beats: Number(ts[1]), unit: Number(ts[2]) };

  if (/\bswing (it|feel|it more)\b|\bswung\b/i.test(msg)) c.swing = 0.6;
  if (/\bstraight(en)?\b/i.test(msg)) c.swing = 0;

  const modeWord = new RegExp(`\\b(${MODE_NAMES.join("|")}|major|minor)\\b`, "i").exec(msg);
  // Tonic letters must be capitals so "in a moody …" doesn't become the key of A.
  const keyWord = /\b(?:in|key of|to)\s+([A-G](?:#|b)?)(?=\s|$|[,.])\s*(major|minor|maj|min|m\b|dorian|phrygian|lydian|mixolydian|aeolian|locrian|ionian)?/.exec(msg);
  if (keyWord || modeWord) {
    const tonic = keyWord?.[1] ?? sheet.key.tonic;
    const raw = (keyWord?.[2] ?? modeWord?.[1] ?? sheet.key.mode).toLowerCase();
    const mode: ModeName = raw.startsWith("maj") ? "ionian" : raw.startsWith("min") || raw === "m" ? "aeolian" : (MODE_NAMES.find((m) => m === raw) ?? sheet.key.mode);
    if (noteToPc(tonic) !== null) {
      c.key = { tonic, mode };
      notes.push(`${tonic} ${mode}`);
    }
  }

  const tr = /\b(transpose|move|shift)\s+(up|down)\s+(?:by\s+)?(\d+|a\s+(?:half|whole)\s+step|a\s+(?:semitone|tone))/i.exec(msg);
  if (tr) {
    const amountText = tr[3].toLowerCase();
    const n = /\d+/.test(amountText) ? Number(amountText) : /whole|tone(?!s)/.test(amountText) && !/semitone/.test(amountText) ? 2 : 1;
    c.transpose = tr[2].toLowerCase() === "up" ? n : -n;
    notes.push(`transposed ${c.transpose > 0 ? "up" : "down"} ${Math.abs(c.transpose)}`);
  }

  const trackChanges: NonNullable<SheetChanges["tracks"]> = [];
  const busier = /\b(busier|busy|more (complex|involved|active|detail\w*)|complex|elaborate|fancier|more fills?)\b/i.test(msg);
  const simpler = /\b(simpler|simple|sparser?|less busy|strip\w* (it )?(back|down)|minimal|bare|fewer fills?|calm\w* down)\b/i.test(msg);
  const mentioned: TrackId[] = [];
  for (const [re, id] of TRACK_WORDS) {
    const m = re.exec(msg);
    if (!m) continue;
    const before = msg.slice(Math.max(0, m.index - 24), m.index);
    const after = msg.slice(m.index + m[0].length, m.index + m[0].length + 24);
    const off = /\b(mute|no|without|remove|drop|kill|cut|less)\b\s*(the\s+)?$/i.test(before) || /^\s*(off|out)\b/i.test(after);
    const on = /\b(add|unmute|bring (back|in)|with|more|turn up)\b\s*(the\s+)?$/i.test(before) || /^\s*(on|in|back)\b/i.test(after);
    // "distorted guitar" already matched the dist track; don't double-count it as the clean guitar.
    if (id === "guitar" && mentioned.includes("distGuitar") && /dist|heavy|crunch|overdriv/i.test(before)) continue;
    mentioned.push(id);
    if (off || on) trackChanges.push({ id, enabled: on && !off ? true : false, volume: null, voicing: null, complexity: null });
  }
  if (busier !== simpler) {
    // "busier drums" targets the named tracks; "make it busier" nudges the whole band.
    const targets = mentioned.filter((id) => !trackChanges.some((t) => t.id === id && t.enabled === false));
    const ids = targets.length ? targets : TRACK_IDS.filter((id) => sheet.arrangement.tracks[id].enabled);
    for (const id of ids) {
      const current = sheet.arrangement.tracks[id].complexity ?? 0.5;
      const next = Math.max(0, Math.min(1, current + (busier ? 0.25 : -0.25)));
      const existing = trackChanges.find((t) => t.id === id);
      if (existing) existing.complexity = next;
      else trackChanges.push({ id, enabled: null, volume: null, voicing: null, complexity: next });
    }
    notes.push(busier ? "busier" : "simpler");
  }
  if (trackChanges.length) {
    c.tracks = trackChanges;
    const toggles = trackChanges.filter((t) => t.enabled !== null).map((t) => `${t.id} ${t.enabled ? "on" : "off"}`);
    if (toggles.length) notes.push(toggles.join(", "));
  }

  // A chord list anywhere in the message replaces the progression: take the
  // longest run of chord-ish tokens ("Cmaj7 D (x4) then Cmaj7#11 – D – Em").
  const progression = extractProgression(msg);
  if (progression) {
    c.progression = progression;
    notes.push("new progression");
  }

  c.reply = notes.length ? `Done: ${notes.join(", ")}.` : "I couldn't map that to a change offline. Try things like \"110 bpm\", \"make it a funk groove\", \"D dorian\", \"mute the piano\", or paste chords.";
  return c;
}
