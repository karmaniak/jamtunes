import { SHARP_NAMES, FLAT_NAMES } from "@core/theory/notes";
import { MODE_LABELS, MODE_NAMES, type ModeName } from "@core/theory/scales";
import { STYLES } from "@core/arrange/styles";
import { setMode, setStyle, setSwing, setTempo, setTimeSignature, setTonic } from "@core/sheet/transforms";
import type { Jam } from "../useJam";

const TONICS = SHARP_NAMES.map((s, i) => (s === FLAT_NAMES[i] ? s : `${s}/${FLAT_NAMES[i]}`));
const METERS = ["4/4", "3/4", "2/4", "6/8", "12/8", "5/4", "7/8"];

export type View = "sheet" | "play";

export function Transport({ jam, view, setView, chatOpen, onToggleChat }: { jam: Jam; view: View; setView: (v: View) => void; chatOpen: boolean; onToggleChat: () => void }) {
  const { sheet, commit } = jam;
  const playing = jam.engineState === "playing";
  const loading = jam.engineState === "loading";
  const tonicIndex = SHARP_NAMES.findIndex((n, i) => n === sheet.key.tonic || FLAT_NAMES[i] === sheet.key.tonic);
  const meter = `${sheet.timeSignature.beats}/${sheet.timeSignature.unit}`;

  return (
    <header className="transport">
      <div className="brand">
        <span className="logo">♩</span>
        <span className="name">JamTunes</span>
      </div>

      <div className="view-tabs" role="tablist">
        <button role="tab" className={view === "sheet" ? "on" : ""} onClick={() => setView("sheet")}>
          Sheet
        </button>
        <button role="tab" className={view === "play" ? "on" : ""} onClick={() => setView("play")} title="Play-along view: what's happening now and what's next, no controls">
          Play
        </button>
      </div>

      <button className={`play ${playing ? "on" : ""}`} onClick={jam.togglePlay} disabled={loading} title="Space">
        {loading ? "Loading…" : playing ? "■ Stop" : "▶ Play"}
      </button>
      {jam.loadLabel && <span className="muted small">{jam.loadLabel}</span>}
      {jam.countInActive && <span className="pill count-in">count-in</span>}

      <label className="field">
        <span>Tempo</span>
        <div className="stepper">
          <button className="ghost" onClick={() => commit(setTempo(sheet, sheet.tempo - 4))}>−</button>
          <input type="number" min={30} max={300} value={sheet.tempo} onChange={(e) => commit(setTempo(sheet, Number(e.target.value)))} />
          <button className="ghost" onClick={() => commit(setTempo(sheet, sheet.tempo + 4))}>+</button>
        </div>
      </label>

      <label className="field">
        <span>Time</span>
        <select
          value={METERS.includes(meter) ? meter : "custom"}
          onChange={(e) => {
            const [beats, unit] = e.target.value.split("/").map(Number);
            if (beats && unit) commit(setTimeSignature(sheet, { beats, unit }));
          }}
          title="Chords keep their bars: a whole-bar chord stays a whole bar in the new meter"
        >
          {METERS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          {!METERS.includes(meter) && <option value="custom">{meter}</option>}
        </select>
      </label>

      <label className="field">
        <span>Key</span>
        <select value={tonicIndex} onChange={(e) => commit(setTonic(sheet, SHARP_NAMES[Number(e.target.value)]))}>
          {TONICS.map((t, i) => (
            <option key={t} value={i}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Mode</span>
        <select value={sheet.key.mode} onChange={(e) => commit(setMode(sheet, e.target.value as ModeName))} title="Switching mode re-derives each chord from the new mode (same scale degrees).">
          {MODE_NAMES.map((m) => (
            <option key={m} value={m}>
              {MODE_LABELS[m]}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Style</span>
        <select value={sheet.arrangement.style} onChange={(e) => commit(setStyle(sheet, e.target.value, { keepTempo: false }))}>
          {STYLES.map((s) => (
            <option key={s.id} value={s.id} title={s.description}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field keep" title="Swing amount">
        <span>Swing</span>
        <input type="range" min={0} max={1} step={0.05} value={sheet.arrangement.swing} onChange={(e) => commit(setSwing(sheet, Number(e.target.value)))} />
      </label>

      <label className="check">
        <input type="checkbox" checked={jam.loop} onChange={(e) => jam.setLoop(e.target.checked)} /> Loop
      </label>

      <div className="spacer" />
      <button className="ghost" onClick={jam.undoLast} disabled={!jam.canUndo} title="Ctrl/Cmd+Z">
        Undo
      </button>
      <button className="ghost" onClick={jam.exportMidi} title="Standard MIDI file, 2 passes of the loop">
        Export .mid
      </button>
      {view === "sheet" && (
        <button className={`ghost ${chatOpen ? "active" : ""}`} onClick={onToggleChat}>
          {chatOpen ? "Hide chat" : "Chat"}
        </button>
      )}
    </header>
  );
}
