/**
 * Phone layout: the sheet owns the screen. Top two-thirds is the chord
 * sheet, bottom third is a tray that toggles between song structure and
 * chord diagrams. Everything configurable lives in a setup drawer behind a
 * clearly labelled handle; the band's chat is a floating bubble; the
 * play-along view is one toggle away.
 */
import { useEffect, useState } from "react";
import { keyLabel } from "@core/sheet/describe";
import type { Jam } from "../useJam";
import type { View } from "./Transport";
import { SetupControls } from "./SetupControls";
import { SheetView } from "./SheetView";
import { ArrangementView } from "./ArrangementView";
import { ChordDiagrams } from "./ChordDiagrams";
import { PlayAlongView } from "./PlayAlongView";
import { InputPanel } from "./InputPanel";
import { Band, Mixer } from "./Mixer";
import { ChatPanel } from "./ChatPanel";

type Tray = "structure" | "chords";

export function MobileLayout({ jam, view, setView }: { jam: Jam; view: View; setView: (v: View) => void }) {
  const [tray, setTray] = useState<Tray>("chords");
  const [setupOpen, setSetupOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const { sheet } = jam;
  const playing = jam.engineState === "playing";
  const loading = jam.engineState === "loading";

  // One overlay at a time; Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSetupOpen(false);
        setChatOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app mobile">
      <header className="m-header">
        <button className="m-setup-handle" onClick={() => setSetupOpen(true)} aria-label="Open setup" title="Setup: tempo, key, style, band">
          <span className="m-sliders" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span>Setup</span>
        </button>
        <div className="m-title" onClick={() => setSetupOpen(true)}>
          <strong>{sheet.title}</strong>
          <span className="muted small">
            {sheet.tempo} bpm · {sheet.timeSignature.beats}/{sheet.timeSignature.unit} · {keyLabel(sheet.key)}
          </span>
        </div>
        <button className="ghost m-view" onClick={() => setView(view === "sheet" ? "play" : "sheet")} title={view === "sheet" ? "Play-along view" : "Back to the sheet"}>
          {view === "sheet" ? "Play view" : "Sheet"}
        </button>
        <button className={`play ${playing ? "on" : ""}`} onClick={jam.togglePlay} disabled={loading} aria-label={playing ? "Stop" : "Play"}>
          {loading ? "…" : playing ? "■" : "▶"}
        </button>
      </header>

      {jam.notice && (
        <div className="notice" role="status">
          <span>{jam.notice}</span>
          <button className="ghost" onClick={() => jam.setNotice(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {view === "play" ? (
        <main className="play-area">
          <PlayAlongView jam={jam} />
        </main>
      ) : (
        <>
          <main className="m-sheet">
            <SheetView jam={jam} />
          </main>
          <section className="m-tray">
            <div className="m-tray-tabs" role="tablist">
              <button role="tab" className={tray === "structure" ? "on" : ""} onClick={() => setTray("structure")}>
                Structure
              </button>
              <button role="tab" className={tray === "chords" ? "on" : ""} onClick={() => setTray("chords")}>
                Chords
              </button>
            </div>
            <div className="m-tray-body">{tray === "structure" ? <ArrangementView jam={jam} /> : <ChordDiagrams jam={jam} />}</div>
          </section>
        </>
      )}

      <button className="fab-chat" onClick={() => setChatOpen(true)} aria-label="Tell the band" title="Tell the band">
        💬
      </button>

      {setupOpen && (
        <div className="overlay" onClick={() => setSetupOpen(false)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <h3>Setup</h3>
              <div className="row">
                <button className="ghost" onClick={jam.undoLast} disabled={!jam.canUndo}>
                  Undo
                </button>
                <button className="ghost" onClick={jam.exportMidi}>
                  .mid
                </button>
                <button className="ghost" onClick={() => setSetupOpen(false)} aria-label="Close">
                  ×
                </button>
              </div>
            </div>
            <div className="panel">
              <div className="panel-head">
                <h3>Sheet</h3>
              </div>
              <div className="setup-grid">
                <SetupControls jam={jam} stacked />
              </div>
            </div>
            <InputPanel jam={jam} />
            <Band jam={jam} />
            <Mixer jam={jam} />
          </aside>
        </div>
      )}

      {chatOpen && (
        <div className="overlay" onClick={() => setChatOpen(false)}>
          <div className="chat-sheet" onClick={(e) => e.stopPropagation()}>
            <button className="ghost close-x" onClick={() => setChatOpen(false)} aria-label="Close">
              ×
            </button>
            <ChatPanel jam={jam} />
          </div>
        </div>
      )}
    </div>
  );
}
