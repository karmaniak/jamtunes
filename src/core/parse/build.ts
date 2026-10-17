/** Turn parser output into a playable ChordSheet with sensible defaults. */
import { allSymbols, defaultArrangement, emptySheet, type ChordSheet, type TimeSignature } from "../sheet/model";
import { setStyle } from "../sheet/transforms";
import { noteToPc, pcToName } from "../theory/notes";
import { detectKey, type ModeName } from "../theory/scales";
import { styleById } from "../arrange/styles";
import { parseQuick } from "./quick";
import { parseSheetText } from "./sheetText";

export interface BuildOptions {
  style?: string;
  tempo?: number;
  timeSignature?: TimeSignature;
  title?: string;
}

function finish(sheet: ChordSheet, opts: BuildOptions): ChordSheet {
  const style = styleById(opts.style ?? sheet.arrangement.style);
  let out = setStyle(sheet, style.id);
  out.tempo = opts.tempo ?? out.tempo;
  const guess = detectKey(allSymbols(out));
  out.key = { tonic: pcToName(guess.tonicPc, "sharp"), mode: guess.mode };
  return out;
}

export function sheetFromQuick(progression: string, timing?: string, opts: BuildOptions = {}): { sheet: ChordSheet; warnings: string[] } {
  const parsed = parseQuick(progression, timing, opts.timeSignature);
  const sheet = emptySheet();
  sheet.title = opts.title ?? "Quick jam";
  sheet.timeSignature = parsed.timeSignature ?? opts.timeSignature ?? sheet.timeSignature;
  sheet.sections = parsed.sections;
  sheet.arrangement = defaultArrangement(opts.style ?? "rock");
  sheet.source = { kind: "quick", text: timing ? `${progression}\n@timing ${timing}` : progression };
  const built = finish(sheet, { ...opts, tempo: opts.tempo ?? parsed.tempo });
  return { sheet: built, warnings: parsed.warnings };
}

export function sheetFromText(text: string, opts: BuildOptions = {}, source: ChordSheet["source"] = { kind: "paste", text }): { sheet: ChordSheet; warnings: string[] } {
  const ts = opts.timeSignature ?? { beats: 4, unit: 4 };
  const parsed = parseSheetText(text, ts);
  const sheet = emptySheet();
  sheet.title = opts.title ?? parsed.title ?? "Pasted sheet";
  sheet.artist = parsed.artist;
  sheet.timeSignature = ts;
  sheet.sections = parsed.sections;
  sheet.arrangement = defaultArrangement(opts.style ?? "pop");
  sheet.source = source;
  const built = finish(sheet, { ...opts, style: opts.style ?? "pop", tempo: opts.tempo ?? parsed.tempo });
  if (parsed.key) {
    const m = /^([A-G](?:#|b)?)\s*(m|min|minor)?/i.exec(parsed.key.trim());
    if (m && noteToPc(m[1]) !== null) {
      const mode: ModeName = m[2] ? "aeolian" : "ionian";
      built.key = { tonic: m[1], mode };
    }
  }
  if (parsed.capo) built.ext = { ...built.ext, capo: parsed.capo };
  return { sheet: built, warnings: parsed.warnings };
}
