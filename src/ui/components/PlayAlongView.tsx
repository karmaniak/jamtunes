/**
 * Play-along view: no controls, just what a musician needs on a stand —
 * the passage happening now (name, musical description, chords, scale,
 * lyric), and what's coming next. Built so a "coach" (listen, analyse,
 * score) can be dropped into the slot at the bottom later.
 */
import type { ReactNode } from "react";
import { describeSection } from "@core/sheet/describe";
import type { Bar, ChordSheet, Section } from "@core/sheet/model";
import type { Jam } from "../useJam";

interface Passage {
  section: Section;
  pass: number;
  barIndex: number;
}

function sectionIndex(sheet: ChordSheet, id: string): number {
  return sheet.sections.findIndex((s) => s.id === id);
}

/** The passage after this one: same section again, the next section, or the loop top. */
function nextPassage(sheet: ChordSheet, cur: Passage): { section: Section; pass: number; loops: boolean } | null {
  if (cur.pass < cur.section.repeat - 1) return { section: cur.section, pass: cur.pass + 1, loops: false };
  const i = sectionIndex(sheet, cur.section.id);
  const next = sheet.sections[i + 1];
  if (next) return { section: next, pass: 0, loops: false };
  return sheet.sections.length ? { section: sheet.sections[0], pass: 0, loops: true } : null;
}

function prettify(symbol: string): string {
  return symbol.replace(/^([A-G])b/, "$1♭").replace(/^([A-G])#/, "$1♯").replace(/\/([A-G])b$/, "/$1♭").replace(/\/([A-G])#$/, "/$1♯");
}

function BarChords({ bar, activeSlotId, big }: { bar: Bar; activeSlotId: string | null; big: boolean }) {
  return (
    <div className={`pa-bar ${big ? "big" : ""}`}>
      {bar.slots.map((slot) => (
        <span key={slot.id} className={`pa-chord ${slot.id === activeSlotId ? "active" : ""} ${slot.ext?.tied ? "tied" : ""}`} style={{ flex: slot.beats }}>
          {slot.ext?.tied ? "—" : prettify(slot.symbol)}
        </span>
      ))}
    </div>
  );
}

export function PlayAlongView({ jam, coach }: { jam: Jam; coach?: ReactNode }) {
  const { sheet, activeMarker, activeSlotId } = jam;
  if (sheet.sections.length === 0) return <div className="playalong empty">Nothing to play yet — build a progression on the Sheet tab.</div>;

  const section = (activeMarker && sheet.sections.find((s) => s.id === activeMarker.sectionId)) || sheet.sections[0];
  const barIndex = activeMarker ? Math.max(0, section.bars.findIndex((b) => b.id === activeMarker.barId)) : 0;
  const pass = activeMarker?.sectionPass ?? 0;
  const cur: Passage = { section, pass, barIndex };
  const now = describeSection(section, sheet.key);
  const next = nextPassage(sheet, cur);
  const nextDesc = next ? describeSection(next.section, sheet.key) : null;
  const total = section.bars.length * section.repeat;
  const done = pass * section.bars.length + barIndex;
  const barsLeft = total - done;
  const bar = section.bars[barIndex];
  const following = section.bars[barIndex + 1] ?? (next ? next.section.bars[0] : undefined);
  const lyric = bar?.slots.find((s) => s.id === activeSlotId)?.lyric ?? bar?.slots.map((s) => s.lyric).filter(Boolean).join(" ");
  const playing = jam.engineState === "playing";

  return (
    <div className="playalong">
      <section className="pa-now">
        <div className="pa-label">
          <span className="pa-tag now">{playing ? "Now" : "Starts with"}</span>
          <span className="pa-section">{section.name}</span>
          {section.repeat > 1 && (
            <span className="muted">
              pass {pass + 1}/{section.repeat}
            </span>
          )}
          <span className="pa-count muted">
            {barsLeft} bar{barsLeft === 1 ? "" : "s"} left
          </span>
        </div>
        <h1 className="pa-title">{now.title}</h1>
        <div className="pa-numerals muted">{now.numerals}</div>
        {bar && <BarChords bar={bar} activeSlotId={activeSlotId} big />}
        {following && (
          <div className="pa-following">
            <span className="muted small">then</span>
            <BarChords bar={following} activeSlotId={null} big={false} />
          </div>
        )}
        {lyric && <div className="pa-lyric">{lyric}</div>}
        <div className="pa-scale">
          <span className="muted small">Play over it</span>
          <span className="pa-scale-name">{now.scale.name}</span>
          <span className="pa-notes">{now.scale.notes.map(prettify).join("  ")}</span>
        </div>
      </section>

      {next && nextDesc && (
        <section className="pa-next">
          <div className="pa-label">
            <span className="pa-tag">Upcoming</span>
            <span className="pa-section">
              {next.section.name}
              {next.section === section ? " (again)" : ""}
              {next.loops ? " · back to top" : ""}
            </span>
          </div>
          <h2 className="pa-title small">{nextDesc.title}</h2>
          <div className="pa-chords-inline">{nextDesc.chords}</div>
          <div className="pa-scale compact">
            <span className="pa-scale-name">{nextDesc.scale.name}</span>
            <span className="pa-notes">{nextDesc.scale.notes.map(prettify).join("  ")}</span>
          </div>
        </section>
      )}

      <section className="pa-coach">{coach ?? <span className="muted small">Coach — listening, analysis and scoring will live here.</span>}</section>
    </div>
  );
}
