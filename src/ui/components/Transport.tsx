import { SetupControls } from "./SetupControls";
import type { Jam } from "../useJam";

export type View = "sheet" | "play";

export function Transport({ jam, view, setView, chatOpen, onToggleChat }: { jam: Jam; view: View; setView: (v: View) => void; chatOpen: boolean; onToggleChat: () => void }) {
  const playing = jam.engineState === "playing";
  const loading = jam.engineState === "loading";

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

      <SetupControls jam={jam} />

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
