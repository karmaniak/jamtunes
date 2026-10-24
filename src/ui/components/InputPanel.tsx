import { useRef, useState } from "react";
import { STYLES } from "@core/arrange/styles";
import type { Jam } from "../useJam";

type Tab = "quick" | "paste" | "recent";

export function InputPanel({ jam }: { jam: Jam }) {
  const [tab, setTab] = useState<Tab>("quick");
  const [progression, setProgression] = useState("");
  const [timing, setTiming] = useState("");
  const [style, setStyle] = useState("rock");
  const [pasted, setPasted] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="panel input-panel">
      <div className="tabs">
        {(["quick", "paste", "recent"] as Tab[]).map((t) => (
          <button key={t} className={`tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
            {t === "quick" ? "Progression" : t === "paste" ? "Paste sheet" : `Recent${jam.recent.length ? ` (${jam.recent.length})` : ""}`}
          </button>
        ))}
      </div>

      {tab === "quick" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            jam.loadQuick(progression, timing, style);
          }}
        >
          <textarea
            value={progression}
            onChange={(e) => setProgression(e.target.value)}
            rows={5}
            placeholder={"Am F C G\n| Dm7 G7 | Cmaj7 |\nE . . . A . B7 .\n[Chorus] x2"}
            spellCheck={false}
          />
          <label className="field block">
            <span>Timing (optional)</span>
            <input value={timing} onChange={(e) => setTiming(e.target.value)} placeholder="4 4 2 2   ·   2b   ·   6/8 90bpm" spellCheck={false} />
          </label>
          <div className="row">
            <select value={style} onChange={(e) => setStyle(e.target.value)}>
              {STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <button className="primary" type="submit" disabled={!progression.trim()}>
              Build jam
            </button>
          </div>
          <p className="hint muted small">
            One bar per chord by default. Use <code>|</code> for bars, dots or <code>(2)</code> for beats, <code>x2</code> to repeat, <code>[Verse]</code> for sections.
          </p>
        </form>
      )}

      {tab === "paste" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            jam.loadText(pasted);
          }}
        >
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={9}
            placeholder={"[Verse]\nC          G\nSome lyrics here\nAm         F\nmore lyrics"}
            spellCheck={false}
          />
          <div className="row">
            <button className="primary" type="submit" disabled={!pasted.trim()}>
              Import
            </button>
          </div>
          <p className="hint muted small">Chord-sheet style: chords above lyrics, [Section] headers, inline [C]chords. Each chord gets a bar unless bar lines are written.</p>
        </form>
      )}

      {tab === "recent" && (
        <div className="recent">
          {jam.recent.length === 0 && <p className="muted small">Jams you build show up here automatically and stay on this device.</p>}
          <ul className="recent-list">
            {jam.recent.map((r) => (
              <li key={r.id} className={r.id === jam.sheet.id ? "current" : ""}>
                <button className="recent-item" onClick={() => jam.loadRecentJam(r.id)} title="Open this jam">
                  <span className="recent-title">{r.title}</span>
                  <span className="muted tiny">
                    {r.key} · {r.style} · {r.bars} bars · {new Date(r.savedAt).toLocaleDateString()}
                  </span>
                </button>
                <button className="ghost danger" title="Forget" onClick={() => jam.removeRecentJam(r.id)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="row">
            <button className="ghost" onClick={jam.exportJson} title="Save the current jam as a file you can open on another device">
              Save file
            </button>
            <button className="ghost" onClick={() => fileRef.current?.click()}>
              Open file…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json,.jam.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void jam.importJson(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
