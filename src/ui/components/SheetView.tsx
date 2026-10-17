/**
 * The chord sheet. Sections -> bars -> chord slots, with optional layers
 * rendered under each chord. Layers are a registry: adding a new kind of
 * per-chord information (voicing names, rhythm glyphs, roman numerals,
 * lyrics…) means adding a renderer here, not changing the data model.
 */
import { useState, type ReactNode } from "react";
import { parseChord } from "@core/theory/chords";
import { noteToPc } from "@core/theory/notes";
import { degreeOf, diatonicChords } from "@core/theory/scales";
import { setSectionRepeat, setSlotLyric, setSlotSymbol, setSlotVoicing } from "@core/sheet/transforms";
import type { ChordSheet, ChordSlot, VoicingHint } from "@core/sheet/model";
import type { Jam } from "../useJam";

interface LayerContext {
  sheet: ChordSheet;
  slot: ChordSlot;
  commit: Jam["commit"];
}

interface Layer {
  id: string;
  label: string;
  defaultOn: boolean;
  render: (ctx: LayerContext) => ReactNode;
}

const VOICINGS: VoicingHint[] = ["auto", "close", "open", "shell", "rootless", "power"];

const LAYERS: Layer[] = [
  {
    id: "lyrics",
    label: "Lyrics",
    defaultOn: true,
    render: ({ sheet, slot, commit }) => (
      <input
        className="lyric"
        value={slot.lyric ?? ""}
        placeholder="…"
        onChange={(e) => commit(setSlotLyric(sheet, slot.id, e.target.value), { undoable: false })}
        aria-label="Lyric"
      />
    ),
  },
  {
    id: "roman",
    label: "Numerals",
    defaultOn: true,
    render: ({ sheet, slot }) => {
      const chord = parseChord(slot.symbol);
      if (!chord) return <span className="roman" />;
      const tonicPc = noteToPc(sheet.key.tonic) ?? 0;
      const { degree, offset } = degreeOf(chord.rootPc, tonicPc, sheet.key.mode);
      const dia = diatonicChords(tonicPc, sheet.key.mode)[degree];
      const base = dia.roman.replace("°", "");
      const roman = chord.quality === "minor" || chord.quality === "dim" ? base.toLowerCase() : base.toUpperCase();
      const acc = offset === 1 ? "♯" : offset === -1 ? "♭" : offset ? `${offset > 0 ? "+" : ""}${offset}` : "";
      return (
        <span className={`roman ${offset ? "chromatic" : ""}`}>
          {acc}
          {roman}
          {chord.quality === "dim" ? "°" : chord.hasSeventh ? "7" : ""}
        </span>
      );
    },
  },
  {
    id: "voicing",
    label: "Voicing",
    defaultOn: false,
    render: ({ sheet, slot, commit }) => (
      <select className="voicing" value={slot.voicing ?? "auto"} onChange={(e) => commit(setSlotVoicing(sheet, slot.id, e.target.value as VoicingHint))}>
        {VOICINGS.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    ),
  },
];

export function SheetView({ jam }: { jam: Jam }) {
  const { sheet, commit, activeSlotId } = jam;
  const [layersOn, setLayersOn] = useState<Record<string, boolean>>(() => Object.fromEntries(LAYERS.map((l) => [l.id, l.defaultOn])));
  const activeLayers = LAYERS.filter((l) => layersOn[l.id]);

  return (
    <div className="sheet">
      <div className="sheet-head">
        <div>
          <input
            className="title"
            value={sheet.title}
            onChange={(e) => commit({ ...sheet, title: e.target.value }, { undoable: false })}
            aria-label="Title"
          />
          <div className="meta muted">
            {sheet.artist ? `${sheet.artist} · ` : ""}
            {sheet.key.tonic} {sheet.key.mode} · {sheet.timeSignature.beats}/{sheet.timeSignature.unit} · {sheet.tempo} bpm · {sheet.arrangement.style}
            {typeof sheet.ext?.capo === "number" ? ` · capo ${sheet.ext.capo}` : ""}
          </div>
        </div>
        <div className="layers">
          {LAYERS.map((l) => (
            <label key={l.id} className={`chip ${layersOn[l.id] ? "on" : ""}`}>
              <input type="checkbox" checked={!!layersOn[l.id]} onChange={(e) => setLayersOn({ ...layersOn, [l.id]: e.target.checked })} />
              {l.label}
            </label>
          ))}
        </div>
      </div>

      {sheet.sections.length === 0 && <p className="empty">No chords yet. Type a progression on the left, paste a chord sheet, or ask the chat for a vibe.</p>}

      {sheet.sections.map((section) => (
        <section key={section.id} className="section">
          <div className="section-head">
            <h2>{section.name}</h2>
            <label className="repeat" title="Times through this section">
              ×
              <input type="number" min={1} max={16} value={section.repeat} onChange={(e) => commit(setSectionRepeat(sheet, section.id, Number(e.target.value)))} />
            </label>
            <span className="muted small">{section.bars.length} bars</span>
          </div>
          <div className="bars">
            {section.bars.map((bar) => (
              <div key={bar.id} className="bar">
                {bar.slots.map((slot) => (
                  <div
                    key={slot.id}
                    className={`slot ${slot.id === activeSlotId ? "active" : ""} ${slot.ext?.tied ? "tied" : ""}`}
                    style={{ flex: slot.beats }}
                    title={`${slot.beats} beat${slot.beats === 1 ? "" : "s"}`}
                  >
                    <ChordSymbol slot={slot} onChange={(symbol) => commit(setSlotSymbol(sheet, slot.id, symbol))} />
                    {activeLayers.map((layer) => (
                      <div key={layer.id} className={`layer layer-${layer.id}`}>
                        {layer.render({ sheet, slot, commit })}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ChordSymbol({ slot, onChange }: { slot: ChordSlot; onChange: (symbol: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(slot.symbol);
  const valid = slot.symbol === "N.C." || parseChord(slot.symbol) !== null;
  if (editing) {
    return (
      <input
        className="chord-edit"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft.trim() && draft !== slot.symbol) onChange(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(slot.symbol);
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <button
      className={`chord ${valid ? "" : "invalid"} ${slot.ext?.tied ? "tied" : ""}`}
      onClick={() => {
        setDraft(slot.symbol);
        setEditing(true);
      }}
      title={valid ? "Click to edit" : "Unrecognised chord (won't play)"}
    >
      {slot.ext?.tied ? "—" : prettify(slot.symbol)}
    </button>
  );
}

function prettify(symbol: string): string {
  return symbol.replace(/^([A-G])b/, "$1♭").replace(/^([A-G])#/, "$1♯").replace(/\/([A-G])b$/, "/$1♭").replace(/\/([A-G])#$/, "/$1♯");
}
