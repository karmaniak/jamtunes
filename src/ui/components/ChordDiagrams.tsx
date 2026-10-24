/**
 * Chord reference for the chord being played: name, a guitar grid and a
 * piano diagram. Display only — nothing here is playable, by design.
 */
import { useMemo } from "react";
import { parseChord } from "@core/theory/chords";
import { guitarShape, pianoChordNotes, TUNING, type GuitarShape } from "@core/theory/guitarShapes";
import { midiToName, mod12, pcToName } from "@core/theory/notes";
import type { Jam } from "../useJam";

function prettify(symbol: string): string {
  return symbol.replace(/^([A-G])b/, "$1♭").replace(/^([A-G])#/, "$1♯").replace(/\/([A-G])b$/, "/$1♭").replace(/\/([A-G])#$/, "/$1♯");
}

export function ChordDiagrams({ jam }: { jam: Jam }) {
  const { sheet, activeSlotId } = jam;
  const slot = useMemo(() => {
    for (const s of sheet.sections) for (const b of s.bars) for (const sl of b.slots) if (sl.id === activeSlotId) return sl;
    return sheet.sections[0]?.bars[0]?.slots[0] ?? null;
  }, [sheet, activeSlotId]);
  const symbol = slot?.symbol ?? null;
  const chord = symbol ? parseChord(symbol) : null;
  const shape = chord ? guitarShape(chord) : null;
  const pianoNotes = chord ? pianoChordNotes(chord) : [];

  return (
    <div className="panel diagrams">
      <div className="panel-head">
        <h3>Chord</h3>
        <span className="muted small">{activeSlotId ? "now playing" : "first chord"}</span>
      </div>
      {!chord ? (
        <div className="muted small">{symbol ? `${symbol} — no diagram for this symbol` : "No chord yet"}</div>
      ) : (
        <>
          <div className="diagram-name">
            <span className="diagram-symbol">{prettify(chord.symbol)}</span>
            <span className="diagram-tones muted">{[...new Set(chord.intervals.map((i) => mod12(chord.rootPc + i)))].map((pc) => pcToName(pc, chord.rootName.includes("b") ? "flat" : "sharp")).join(" · ")}</span>
          </div>
          <div className="diagram-row">
            <figure>
              {shape && <GuitarGrid shape={shape} />}
              <figcaption className="muted tiny">
                Guitar{shape && shape.position > 1 ? ` · ${shape.position}fr` : ""}
                {shape && shape.missing.length > 0 ? " · no 5th" : ""}
              </figcaption>
            </figure>
            <figure>
              <PianoKeys notes={pianoNotes} />
              <figcaption className="muted tiny">Piano · {pianoNotes.map((n) => midiToName(n).replace(/\d/, "")).join(" ")}</figcaption>
            </figure>
          </div>
        </>
      )}
    </div>
  );
}

function GuitarGrid({ shape }: { shape: GuitarShape }) {
  const W = 120;
  const H = 140;
  const left = 18;
  const top = 26;
  const stringGap = (W - left * 2) / 5;
  const fretGap = (H - top - 12) / 4;
  const base = shape.position <= 1 ? 1 : shape.position; // first drawn fret
  const fretY = (fret: number) => top + (fret - base + 0.5) * fretGap;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="guitar-grid" role="img" aria-label="Guitar chord diagram">
      {/* nut or position marker */}
      {base === 1 ? <rect x={left - 1} y={top - 3} width={stringGap * 5 + 2} height={4} fill="currentColor" /> : <text x={left - 10} y={fretY(base) + 4} fontSize={10} textAnchor="end" fill="currentColor">{base}</text>}
      {Array.from({ length: 5 }, (_, i) => (
        <line key={`f${i}`} x1={left} x2={left + stringGap * 5} y1={top + i * fretGap} y2={top + i * fretGap} stroke="currentColor" strokeOpacity={0.5} />
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <line key={`s${i}`} x1={left + i * stringGap} x2={left + i * stringGap} y1={top} y2={top + 4 * fretGap} stroke="currentColor" strokeOpacity={0.6} />
      ))}
      {shape.barre && (
        <rect x={left + shape.barre.from * stringGap - 6} y={fretY(shape.barre.fret) - 6} width={(shape.barre.to - shape.barre.from) * stringGap + 12} height={12} rx={6} fill="var(--accent)" />
      )}
      {shape.frets.map((f, i) => {
        const x = left + i * stringGap;
        if (f < 0) return <text key={i} x={x} y={top - 8} fontSize={11} textAnchor="middle" fill="currentColor" opacity={0.7}>×</text>;
        if (f === 0) return <circle key={i} cx={x} cy={top - 11} r={3.5} fill="none" stroke="currentColor" />;
        if (shape.barre && f === shape.barre.fret && i >= shape.barre.from && i <= shape.barre.to) return null;
        return <circle key={i} cx={x} cy={fretY(f)} r={6} fill="var(--accent)" />;
      })}
      {shape.frets.map((f, i) => (
        <text key={`n${i}`} x={left + i * stringGap} y={H - 1} fontSize={8} textAnchor="middle" fill="currentColor" opacity={0.6}>
          {f < 0 ? "" : midiToName(TUNING[i] + f).replace(/\d/, "")}
        </text>
      ))}
    </svg>
  );
}

function PianoKeys({ notes }: { notes: number[] }) {
  const start = 48; // C3
  const octaves = 2;
  const whiteW = 14;
  const H = 70;
  const whites: { midi: number; x: number }[] = [];
  const blacks: { midi: number; x: number }[] = [];
  let x = 0;
  for (let m = start; m < start + 12 * octaves; m++) {
    const pc = mod12(m);
    const isBlack = [1, 3, 6, 8, 10].includes(pc);
    if (isBlack) blacks.push({ midi: m, x: x - whiteW * 0.3 });
    else {
      whites.push({ midi: m, x });
      x += whiteW;
    }
  }
  const W = x;
  const set = new Set(notes.map((n) => ((n - start) % (12 * octaves) + 12 * octaves) % (12 * octaves) + start));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="piano-keys" role="img" aria-label="Piano chord diagram">
      {whites.map((k) => (
        <rect key={k.midi} x={k.x} y={0} width={whiteW} height={H} fill={set.has(k.midi) ? "var(--accent)" : "#f3f4f6"} stroke="#555" strokeWidth={0.6} />
      ))}
      {blacks.map((k) => (
        <rect key={k.midi} x={k.x} y={0} width={whiteW * 0.6} height={H * 0.62} fill={set.has(k.midi) ? "var(--accent)" : "#1a1d24"} stroke="#333" strokeWidth={0.6} />
      ))}
    </svg>
  );
}
