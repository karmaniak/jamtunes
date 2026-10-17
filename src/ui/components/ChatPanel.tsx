import { useEffect, useRef, useState } from "react";
import type { Jam } from "../useJam";

const SUGGESTIONS = ["Moody 6/8 ballad in D dorian, 80 bpm", "Make it a funk groove", "Switch to lydian", "Mute the piano, add distorted guitar", "12-bar blues in A, shuffle"];

export function ChatPanel({ jam }: { jam: Jam }) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [jam.chat.length, jam.chatBusy]);

  const send = (msg: string) => {
    const m = msg.trim();
    if (!m || jam.chatBusy) return;
    setText("");
    void jam.sendChat(m);
  };

  return (
    <div className="panel chat">
      <div className="panel-head">
        <h3>Vibe &amp; tasks</h3>
        <span className="muted small">describe it; the sheet changes</span>
      </div>
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
            <div className="bubble">{m.text}</div>
            {m.role === "assistant" && m.source === "local" && <span className="muted tiny">offline interpreter</span>}
          </div>
        ))}
        {jam.chatBusy && <div className="msg assistant"><div className="bubble muted">…</div></div>}
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. slower, more laid back, in E mixolydian" disabled={jam.chatBusy} />
        <button className="primary" type="submit" disabled={!text.trim() || jam.chatBusy}>
          Send
        </button>
      </form>
    </div>
  );
}
