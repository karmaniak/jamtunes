import { useState } from "react";
import { STYLES } from "@core/arrange/styles";
import type { Jam } from "../useJam";

type Tab = "quick" | "paste" | "link";

export function InputPanel({ jam }: { jam: Jam }) {
  const [tab, setTab] = useState<Tab>("quick");
  const [progression, setProgression] = useState("");
  const [timing, setTiming] = useState("");
  const [style, setStyle] = useState("rock");
  const [pasted, setPasted] = useState("");
  const [url, setUrl] = useState("");

  return (
    <div className="panel input-panel">
      <div className="tabs">
        {(["quick", "paste", "link"] as Tab[]).map((t) => (
          <button key={t} className={`tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
            {t === "quick" ? "Progression" : t === "paste" ? "Paste sheet" : "UG link"}
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
          <p className="hint muted small">Ultimate-Guitar style: chords above lyrics, [Section] headers, inline [C]chords. Each chord gets a bar unless bar lines are written.</p>
        </form>
      )}

      {tab === "link" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void jam.loadUrl(url);
          }}
        >
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://tabs.ultimate-guitar.com/tab/…" spellCheck={false} />
          <div className="row">
            <button className="primary" type="submit" disabled={!/^https?:\/\//.test(url)}>
              Fetch
            </button>
          </div>
          <p className="hint muted small">Fetched through the local server. UG sometimes blocks automated requests — pasting the chords always works.</p>
        </form>
      )}
    </div>
  );
}
