import { useEffect, useRef, useState } from "react";
import type { Jam } from "../useJam";

const SUGGESTIONS = ["Moody 6/8 ballad in D dorian, 80 bpm", "Make it a funk groove", "Switch to lydian", "Busier drums, simpler bass", "12-bar blues in A, shuffle"];

export function ChatPanel({ jam }: { jam: Jam }) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const ai = jam.chatStatus.mode === "ai";

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
        <h3>Tell the band</h3>
        {jam.chatStatus.mode !== "unknown" && (
          <span className={`pill ${ai ? "ok" : ""}`} title={ai ? "The band understands free-form requests" : "Basic requests: tempo, style, key/mode, instruments, chord lists"}>
            {ai ? "listening" : "basic"}
          </span>
        )}
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
            <div className={`bubble ${m.error ? "error" : ""}`}>{m.text}</div>
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
