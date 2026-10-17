import { useEffect, useRef, useState } from "react";
import type { Jam } from "../useJam";

const SUGGESTIONS = ["Moody 6/8 ballad in D dorian, 80 bpm", "Make it a funk groove", "Switch to lydian", "Mute the piano, add distorted guitar", "12-bar blues in A, shuffle"];

export function ChatPanel({ jam }: { jam: Jam }) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const status = jam.chatStatus;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [jam.chat.length, jam.chatBusy]);

  const send = (msg: string) => {
    const m = msg.trim();
    if (!m || jam.chatBusy) return;
    setText("");
    void jam.sendChat(m);
  };

  const connected = status.mode === "claude";

  return (
    <div className="panel chat">
      <div className="panel-head">
        <h3>Vibe &amp; tasks</h3>
        <span className={`pill ${connected ? "ok" : status.mode === "unknown" ? "" : "warn"}`} title={connected ? `Connected via ${status.credential}` : "Offline interpreter: tempo, style, key/mode, track and chord-list requests only"}>
          {connected ? "Claude" : status.mode === "unknown" ? "…" : "offline"}
        </span>
      </div>

      {status.mode === "local" && (
        <div className="connect-hint">
          <strong>Connect your Claude</strong> to get free-form requests. In a terminal:
          <pre>ant auth login</pre>
          then restart <code>npm run dev</code>. (Or put <code>ANTHROPIC_API_KEY</code> in <code>.env</code>.) Needs the Anthropic CLI: <code>brew install anthropics/tap/ant</code>.
        </div>
      )}

      <div className="messages" ref={listRef}>
        {jam.chat.length === 0 && (
          <div className="suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chip" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {jam.chat.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <div className={`bubble ${m.error ? "error" : ""}`}>{m.text}</div>
            {m.role === "assistant" && m.source === "local" && connected && <span className="muted tiny">offline interpreter</span>}
          </div>
        ))}
        {jam.chatBusy && (
          <div className="msg assistant">
            <div className="bubble muted">…</div>
          </div>
        )}
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <textarea
          value={text}
          rows={Math.min(5, Math.max(1, text.split("\n").length))}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(text);
            }
          }}
          placeholder="Describe a change…"
          title="Enter sends · Shift+Enter for a new line"
          disabled={jam.chatBusy}
        />
        <button className="primary" type="submit" disabled={!text.trim() || jam.chatBusy}>
          Send
        </button>
      </form>
    </div>
  );
}
