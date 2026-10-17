import { SHARP_NAMES, FLAT_NAMES } from "@core/theory/notes";
import { MODE_LABELS, MODE_NAMES, type ModeName } from "@core/theory/scales";
import { STYLES } from "@core/arrange/styles";
import { setMode, setStyle, setSwing, setTempo, setTonic } from "@core/sheet/transforms";
import type { Jam } from "../useJam";

const TONICS = SHARP_NAMES.map((s, i) => (s === FLAT_NAMES[i] ? s : `${s}/${FLAT_NAMES[i]}`));

export function Transport({ jam, chatOpen, onToggleChat }: { jam: Jam; chatOpen: boolean; onToggleChat: () => void }) {
  const { sheet, commit } = jam;
  const playing = jam.engineState === "playing";
  const loading = jam.engineState === "loading";
  const tonicIndex = SHARP_NAMES.findIndex((n, i) => n === sheet.key.tonic || FLAT_NAMES[i] === sheet.key.tonic);

  return (
    <header className="transport">
      <div className="brand">
        <span className="logo">♩</span>
        <span className="name">JamTunes</span>
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

      <label className="field">
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
      <button className={`ghost ${chatOpen ? "active" : ""}`} onClick={onToggleChat}>
        {chatOpen ? "Hide chat" : "Chat"}
      </button>
    </header>
  );
}
