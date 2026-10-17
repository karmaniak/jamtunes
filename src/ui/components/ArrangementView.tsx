/**
 * Song structure strip: the form as a flow of section blocks, sized by how
 * long they play (bars × repeats), with the playhead moving through them.
 * Click a block to jump the sheet to that section; drag to reorder; adjust
 * repeats, duplicate, remove, add — structure edits without leaving the view.
 */
import { Fragment, useState } from "react";
import { addSection, deleteSection, duplicateSection, reorderSection } from "@core/sheet/edit";
import { setSectionRepeat } from "@core/sheet/transforms";
import type { Section } from "@core/sheet/model";
import type { Jam } from "../useJam";

const COLORS = ["#4fc3f7", "#f5b942", "#9ccc65", "#ce93d8", "#ff8a65", "#4db6ac", "#f06292", "#aed581"];

export function sectionColor(index: number): string {
  return COLORS[index % COLORS.length];
}

function shortSymbol(symbol: string): string {
  return symbol.replace(/maj7/, "Δ").replace(/m7b5|ø7?/, "ø").replace(/dim/, "°").replace(/^([A-G])b/, "$1♭").replace(/^([A-G])#/, "$1♯");
}

export function ArrangementView({ jam }: { jam: Jam }) {
  const { sheet, commit, activeMarker, focusSectionId } = jam;
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const totalBars = sheet.sections.reduce((n, s) => n + s.bars.length * s.repeat, 0);
  const beatSeconds = (60 / sheet.tempo) * (sheet.timeSignature.unit === 8 ? 1 / 3 : 1);
  const seconds = totalBars * sheet.timeSignature.beats * beatSeconds;
  const mm = Math.floor(seconds / 60);
  const ss = String(Math.round(seconds % 60)).padStart(2, "0");

  const progressIn = (section: Section): number | null => {
    if (!activeMarker || activeMarker.sectionId !== section.id) return null;
    const barIdx = section.bars.findIndex((b) => b.id === activeMarker.barId);
    if (barIdx < 0) return null;
    const bar = section.bars[barIdx];
    const slotIdx = bar.slots.findIndex((s) => s.id === activeMarker.slotId);
    const beatsBefore = bar.slots.slice(0, Math.max(0, slotIdx)).reduce((n, s) => n + s.beats, 0);
    const barFraction = beatsBefore / sheet.timeSignature.beats;
    return (activeMarker.sectionPass * section.bars.length + barIdx + barFraction) / (section.bars.length * section.repeat);
  };

  const drop = (toIndex: number) => {
    if (dragId) commit(reorderSection(sheet, dragId, toIndex));
    setDragId(null);
    setOverIndex(null);
  };

  return (
    <div className="arrangement">
      <div className="arr-head">
        <h3>Structure</h3>
        <span className="muted small">
          {sheet.sections.length} section{sheet.sections.length === 1 ? "" : "s"} · {totalBars} bars · {mm}:{ss} per pass
        </span>
        <span className="muted small hint-right">click a block to edit its chords · drag to reorder</span>
      </div>
      <div className="arr-flow">
        {sheet.sections.map((section, i) => {
          const progress = progressIn(section);
          const weight = Math.max(1, section.bars.length * section.repeat);
          const color = sectionColor(i);
          return (
            <Fragment key={section.id}>
              {i > 0 && <span className="arr-arrow">→</span>}
              <div
                className={`arr-block ${focusSectionId === section.id ? "focused" : ""} ${progress !== null ? "playing" : ""} ${overIndex === i && dragId && dragId !== section.id ? "drop-target" : ""}`}
                style={{ flexGrow: weight, borderColor: color }}
                draggable
                onDragStart={(e) => {
                  setDragId(section.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverIndex(i);
                }}
                onDragLeave={() => setOverIndex((o) => (o === i ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  drop(i);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setOverIndex(null);
                }}
                onClick={() => jam.focusSection(section.id)}
                role="button"
                title={`${section.name}: ${section.bars.length} bars${section.repeat > 1 ? ` × ${section.repeat}` : ""}. Click to edit chords.`}
              >
                <div className="arr-block-head">
                  <span className="arr-name" style={{ color }}>
                    {section.name}
                  </span>
                  <span className="arr-len muted">
                    {section.bars.length}
                    {section.repeat > 1 ? ` ×${section.repeat}` : ""}
                  </span>
                </div>
                <div className="arr-mini">
                  {section.bars.map((bar) => (
                    <span key={bar.id} className={`arr-minibar ${activeMarker?.barId === bar.id ? "now" : ""}`}>
                      {bar.slots.map((s) => shortSymbol(s.symbol)).join(" ")}
                    </span>
                  ))}
                </div>
                {progress !== null && <div className="arr-progress" style={{ width: `${Math.min(100, progress * 100)}%`, background: color }} />}
                <div className="tools arr-tools" onClick={(e) => e.stopPropagation()}>
                  <button className="ghost" title="Play through once less" disabled={section.repeat <= 1} onClick={() => commit(setSectionRepeat(sheet, section.id, section.repeat - 1))}>
                    −
                  </button>
                  <span className="muted tiny">×{section.repeat}</span>
                  <button className="ghost" title="Play through once more" onClick={() => commit(setSectionRepeat(sheet, section.id, section.repeat + 1))}>
                    +
                  </button>
                  <button className="ghost" title="Duplicate section" onClick={() => commit(duplicateSection(sheet, section.id))}>
                    ⧉
                  </button>
                  <button className="ghost danger" title="Remove section" onClick={() => commit(deleteSection(sheet, section.id))}>
                    ×
                  </button>
                </div>
              </div>
            </Fragment>
          );
        })}
        {sheet.sections.length > 0 && (
          <span className="arr-arrow loop" title="Loops back to the top">
            ⟲
          </span>
        )}
        <button className="arr-add" onClick={() => commit(addSection(sheet, "New section"))} title="Add a section at the end">
          +
        </button>
      </div>
    </div>
  );
}
