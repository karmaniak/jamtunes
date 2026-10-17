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

export function applyChanges(sheet: ChordSheet, c: SheetChanges): ChordSheet {
  let out = sheet;
  if (c.progression) {
    const { sheet: fresh } = sheetFromQuick(c.progression, undefined, {
      style: c.style ?? out.arrangement.style,
      tempo: c.tempo ?? out.tempo,
      timeSignature: c.timeSignature ?? out.timeSignature,
      title: c.title ?? out.title,
    });
    fresh.arrangement = { ...out.arrangement, style: fresh.arrangement.style, tracks: fresh.arrangement.tracks, swing: fresh.arrangement.swing };
    fresh.source = { kind: "chat", text: c.progression };
    out = fresh;
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
  const keyWord = /\b(?:in|key of|to)\s+([A-G](?:#|b)?)\s*(major|minor|maj|min|m\b|dorian|phrygian|lydian|mixolydian|aeolian|locrian|ionian)?/i.exec(msg);
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
  for (const [re, id] of TRACK_WORDS) {
    const m = re.exec(msg);
    if (!m) continue;
    const before = msg.slice(Math.max(0, m.index - 24), m.index);
    const after = msg.slice(m.index + m[0].length, m.index + m[0].length + 24);
    const off = /\b(mute|no|without|remove|drop|kill|cut|less)\b\s*(the\s+)?$/i.test(before) || /^\s*(off|out)\b/i.test(after);
    const on = /\b(add|unmute|bring (back|in)|with|more|turn up)\b\s*(the\s+)?$/i.test(before) || /^\s*(on|in|back)\b/i.test(after);
    if (off || on) trackChanges.push({ id, enabled: on && !off ? true : false, volume: null, voicing: null });
    if (id === "guitar" && trackChanges.some((t) => t.id === "distGuitar")) trackChanges.pop();
  }
  if (trackChanges.length) {
    c.tracks = trackChanges;
    notes.push(trackChanges.map((t) => `${t.id} ${t.enabled ? "on" : "off"}`).join(", "));
  }

  // A chord list in the message replaces the progression.
  const tokens = msg.replace(/[,]/g, " ").split(/\s+/);
  const chordTokens = tokens.filter((t) => looksLikeChord(t) || t === "|" || /^\.+$/.test(t) || /^x\d$/i.test(t) || /^\[.+\]$/.test(t));
  const realChords = chordTokens.filter(looksLikeChord);
  if (realChords.length >= 2 && realChords.length / tokens.filter((t) => t.length > 0).length > 0.4) {
    c.progression = chordTokens.join(" ");
    notes.push("new progression");
  }

  c.reply = notes.length ? `Done: ${notes.join(", ")}.` : "I couldn't map that to a change offline. Try things like \"110 bpm\", \"make it a funk groove\", \"D dorian\", \"mute the piano\", or paste chords.";
  return c;
}
