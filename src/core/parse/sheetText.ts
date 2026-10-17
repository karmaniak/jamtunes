/**
 * Ultimate-Guitar style chord sheet parser (copy-paste or fetched text):
 * chord lines above lyric lines, [Section] headers, inline [C]chords in
 * lyrics, meta lines (Key:, Capo:, Tempo:). Lyric fragments are attached to
 * the chord above them so the sheet keeps the lyrics layer.
 *
 * UG sheets carry no timing, so every chord defaults to one bar. Bar-line
 * notation ("| C | G |") is honoured when present.
 */
import { looksLikeChord } from "../theory/chords";
import { noteToPc } from "../theory/notes";
import { makeSection, type Section, type TimeSignature } from "../sheet/model";
import { isSectionHeader, packIntoBars, parseChordLine, stripRepeat, type ChordItem } from "./quick";

export interface SheetTextResult {
  title?: string;
  artist?: string;
  key?: string;
  tempo?: number;
  capo?: number;
  sections: Section[];
  warnings: string[];
}

interface Positioned {
  symbol: string;
  col: number;
}

const META_RE = /^(key|capo|tempo|bpm|tuning|tabbed by|difficulty|song|artist|title)\s*[:=]\s*(.+)$/i;

/** Strip UG markup like [ch]C[/ch] and [tab]...[/tab]. */
export function stripUgMarkup(text: string): string {
  return text
    .replace(/\[\/?tab\]/g, "")
    .replace(/\[ch\]([^[]*)\[\/ch\]/g, "$1")
    .replace(/\r/g, "");
}

function chordsWithColumns(line: string): Positioned[] {
  const out: Positioned[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const tok = m[0].replace(/,$/, "");
    if (looksLikeChord(tok) || /^N\.?C\.?$/i.test(tok)) out.push({ symbol: /^N\.?C\.?$/i.test(tok) ? "N.C." : tok, col: m.index });
  }
  return out;
}

function isLyricLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (isSectionHeader(t)) return false;
  if (META_RE.test(t)) return false;
  return parseChordLine(t, { beats: 4, unit: 4 }, 4) === null;
}

/** Inline "[C]Some [G]lyrics" -> chords + lyric fragments. */
function parseInline(line: string): ChordItem[] | null {
  const re = /\[([^\]\s]{1,12})\]/g;
  const matches = [...line.matchAll(re)].filter((m) => looksLikeChord(m[1]));
  if (matches.length === 0) return null;
  const items: ChordItem[] = [];
  matches.forEach((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? line.length) : line.length;
    items.push({ symbol: m[1], beats: NaN, lyric: line.slice(start, end).replace(/\[[^\]]*\]/g, "").trim() || undefined });
  });
  return items;
}

export function parseSheetText(raw: string, ts: TimeSignature = { beats: 4, unit: 4 }, beatsPerChord = ts.beats): SheetTextResult {
  const text = stripUgMarkup(raw);
  const lines = text.split("\n");
  const result: SheetTextResult = { sections: [], warnings: [] };
  let currentName = "Main";
  let currentItems: ChordItem[] = [];
  let currentRepeat = 1;

  const flush = () => {
    if (currentItems.length === 0) return;
    result.sections.push(makeSection(currentName, packIntoBars(currentItems, ts), currentRepeat));
    currentItems = [];
    currentRepeat = 1;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    const meta = META_RE.exec(trimmed);
    if (meta) {
      const k = meta[1].toLowerCase();
      const v = meta[2].trim();
      if (k === "key" && noteToPc(v.split(/[\s(]/)[0].replace(/m(in(or)?)?$/i, "")) !== null) result.key = v;
      else if (k === "tempo" || k === "bpm") result.tempo = parseInt(v, 10) || undefined;
      else if (k === "capo") result.capo = parseInt(v, 10) || undefined;
      else if (k === "title" || k === "song") result.title = v;
      else if (k === "artist") result.artist = v;
      continue;
    }

    const header = isSectionHeader(trimmed);
    if (header) {
      flush();
      currentName = header;
      const rep = /[x×]\s*(\d+)/i.exec(trimmed);
      if (rep) currentRepeat = Number(rep[1]);
      continue;
    }

    const inline = parseInline(line);
    if (inline) {
      for (const it of inline) it.beats = beatsPerChord;
      currentItems.push(...inline);
      continue;
    }

    const { line: body, repeat } = stripRepeat(trimmed);
    const parsed = parseChordLine(body, ts, beatsPerChord);
    if (!parsed) {
      // Stray lyric line without chords above it: keep going, not an error.
      if (!result.title && i < 3 && /^[^|[\]]{3,60}$/.test(trimmed) && !/^(\s*\S+\s*){9,}$/.test(trimmed)) {
        const dash = trimmed.split(/\s[-–]\s/);
        if (dash.length === 2) {
          result.title = dash[1].trim();
          result.artist = dash[0].trim();
        } else {
          result.title = trimmed;
        }
      }
      continue;
    }

    let items = parsed.items;
    // Attach lyrics from the following line by column alignment.
    const next = lines[i + 1];
    if (!parsed.explicitBars && next !== undefined && isLyricLine(next)) {
      const positioned = chordsWithColumns(line);
      if (positioned.length === items.length) {
        items = items.map((it, idx) => {
          const start = positioned[idx].col;
          const end = idx + 1 < positioned.length ? positioned[idx + 1].col : next.length;
          const frag = next.slice(start, end).trim();
          return { ...it, lyric: frag || undefined };
        });
        // Lyric text before the first chord belongs to a pickup; prepend to the first fragment.
        const lead = next.slice(0, positioned[0].col).trim();
        if (lead) items[0].lyric = `${lead} ${items[0].lyric ?? ""}`.trim();
      }
      i++; // consume lyric line
    }
    if (repeat > 1) {
      const once = items;
      items = [];
      for (let r = 0; r < repeat; r++) items.push(...once.map((it) => ({ ...it })));
    }
    currentItems.push(...items);
  }
  flush();
  if (result.sections.length === 0) result.warnings.push("No chord lines found.");
  return result;
}
