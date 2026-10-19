import { useEffect, useState } from "react";
import { describeTimeline } from "@core/arrange/arranger";
import { useJam } from "./useJam";
import { Transport, type View } from "./components/Transport";
import { SheetView } from "./components/SheetView";
import { InputPanel } from "./components/InputPanel";
import { Band, Mixer } from "./components/Mixer";
import { ChatPanel } from "./components/ChatPanel";
import { ArrangementView } from "./components/ArrangementView";
import { PlayAlongView } from "./components/PlayAlongView";

export function App() {
  const jam = useJam();
  const [chatOpen, setChatOpen] = useState(true);
  const [view, setView] = useState<View>("sheet");
  const debug = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "notes";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (e.code === "Space" && !typing) {
        e.preventDefault();
        jam.togglePlay();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !typing) {
        e.preventDefault();
        jam.undoLast();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jam]);

  return (
    <div className="app">
      <Transport jam={jam} view={view} setView={setView} chatOpen={chatOpen} onToggleChat={() => setChatOpen((o) => !o)} />
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
        <div className={`layout ${chatOpen ? "with-chat" : ""}`}>
          <aside className="side left">
            <InputPanel jam={jam} />
            <Band jam={jam} />
            <div className="side-bottom">
              <Mixer jam={jam} />
            </div>
          </aside>
          <main className="sheet-area">
            <div className="sheet-scroll">
              <SheetView jam={jam} />
              {debug && <pre className="debug">{describeTimeline(jam.timeline)}</pre>}
            </div>
            <ArrangementView jam={jam} />
          </main>
          {chatOpen && (
            <aside className="side right">
              <ChatPanel jam={jam} />
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
