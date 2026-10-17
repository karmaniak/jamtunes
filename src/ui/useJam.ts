/**
 * App state: the sheet, undo history, the audio engine, playback position,
 * chat. Everything that mutates the sheet goes through `commit`, which keeps
 * playback in sync (re-arranges live from the current bar).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildTimeline, type Timeline } from "@core/arrange/arranger";
import { applyChanges, interpretLocally, summariseSheet, type SheetChanges } from "@core/chat/intent";
import { timelineToMidi } from "@core/midi/writer";
import { sheetFromQuick, sheetFromText } from "@core/parse/build";
import type { ChordSheet } from "@core/sheet/model";
import { JamEngine, type EngineState } from "@audio/engine";

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  source?: "claude" | "local";
}

const STORAGE_KEY = "jamtunes.sheet.v1";
const DEMO = "[Verse]\n| Am F | C G |\n| Am F | C G |\n[Chorus]\nF G C Am\nF . G . C . . . E7 . . .";

function loadStored(): ChordSheet | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChordSheet) : null;
  } catch {
    return null;
  }
}

export function useJam() {
  const [sheet, setSheetState] = useState<ChordSheet>(() => loadStored() ?? sheetFromQuick(DEMO, undefined, { style: "rock", title: "Demo jam" }).sheet);
  const [undo, setUndo] = useState<ChordSheet[]>([]);
  const [engineState, setEngineState] = useState<EngineState>("idle");
  const [loadLabel, setLoadLabel] = useState("");
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [countInActive, setCountInActive] = useState(false);
  const [loop, setLoop] = useState(true);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const engineRef = useRef<JamEngine | null>(null);
  const timelineRef = useRef<Timeline | null>(null);
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;

  const timeline = useMemo(() => buildTimeline(sheet), [sheet]);
  timelineRef.current = timeline;

  const engine = () => {
    if (!engineRef.current) {
      const e = new JamEngine();
      e.onState = setEngineState;
      e.onLoadProgress = setLoadLabel;
      let lastSlot: string | null = null;
      let lastCountIn = false;
      e.onPosition = (beat) => {
        const t = timelineRef.current;
        if (!t) return;
        const inCountIn = beat < 0;
        if (inCountIn !== lastCountIn) {
          lastCountIn = inCountIn;
          setCountInActive(inCountIn);
        }
        const marker = inCountIn ? null : t.markers.find((m) => beat >= m.start && beat < m.end);
        const id = marker?.slotId ?? null;
        if (id !== lastSlot) {
          lastSlot = id;
          setActiveSlotId(id);
        }
      };
      engineRef.current = e;
    }
    return engineRef.current;
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sheet));
    } catch {
      /* storage full or unavailable */
    }
  }, [sheet]);

  useEffect(() => () => engineRef.current?.dispose(), []);

  /** Replace the sheet; if playing, keep playing from the same bar with the new arrangement. */
  const commit = useCallback((next: ChordSheet, opts: { undoable?: boolean } = {}) => {
    const prev = sheetRef.current;
    if (next === prev) return;
    if (opts.undoable !== false) setUndo((u) => [...u.slice(-29), prev]);
    setSheetState(next);
    const e = engineRef.current;
    if (e && e.isPlaying) {
      const t = buildTimeline(next);
      const beat = e.currentTimelineBeat();
      const barLen = t.beatsPerBar;
      const barsIn = beat >= t.loopStart ? Math.floor((beat - t.loopStart) / barLen) : 0;
      const start = Math.min(t.loopStart + barsIn * barLen, Math.max(t.loopStart, t.loopEnd - barLen));
      void e.play(t, next.arrangement, { loop: true, startBeat: start });
    }
  }, []);

  const undoLast = useCallback(() => {
    setUndo((u) => {
      if (u.length === 0) return u;
      const prev = u[u.length - 1];
      commit(prev, { undoable: false });
      return u.slice(0, -1);
    });
  }, [commit]);

  const play = useCallback(async () => {
    try {
      await engine().play(timelineRef.current!, sheetRef.current.arrangement, { loop });
    } catch (err) {
      setNotice(`Couldn't start audio: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [loop]);

  const stop = useCallback(() => {
    engineRef.current?.stop();
    setActiveSlotId(null);
    setCountInActive(false);
  }, []);

  const togglePlay = useCallback(() => {
    if (engineRef.current?.isPlaying) stop();
    else void play();
  }, [play, stop]);

  // Keep the mixer live without re-arranging.
  useEffect(() => {
    engineRef.current?.applyMix(sheet.arrangement);
  }, [sheet.arrangement]);

  const loadQuick = useCallback(
    (progression: string, timing: string, style: string) => {
      const { sheet: s, warnings } = sheetFromQuick(progression, timing || undefined, { style, title: "Quick jam" });
      if (s.sections.length === 0) {
        setNotice("No chords found — try something like  Am F C G");
        return;
      }
      commit(s);
      setNotice(warnings.length ? warnings.join(" · ") : null);
    },
    [commit],
  );

  const loadText = useCallback(
    (text: string, source?: ChordSheet["source"], extra: { title?: string; artist?: string; key?: string } = {}) => {
      const { sheet: s, warnings } = sheetFromText(extra.key ? `Key: ${extra.key}\n${text}` : text, { title: extra.title }, source);
      if (s.sections.length === 0) {
        setNotice("No chord lines found in that text.");
        return;
      }
      if (extra.artist) s.artist = extra.artist;
      commit(s);
      setNotice(warnings.length ? warnings.join(" · ") : null);
    },
    [commit],
  );

  const loadUrl = useCallback(
    async (url: string) => {
      setNotice("Fetching chord sheet…");
      try {
        const res = await fetch(`/api/ug?url=${encodeURIComponent(url)}`);
        const data = (await res.json()) as { error?: string; text?: string; title?: string; artist?: string; key?: string };
        if (!res.ok || !data.text) throw new Error(data.error ?? "Fetch failed");
        loadText(data.text, { kind: "url", url, text: data.text }, { title: data.title, artist: data.artist, key: data.key });
      } catch (err) {
        setNotice(`${err instanceof Error ? err.message : String(err)} — copy the chords from the page and use Paste instead.`);
      }
    },
    [loadText],
  );

  const sendChat = useCallback(
    async (message: string) => {
      const current = sheetRef.current;
      const id = Date.now();
      setChat((c) => [...c, { id, role: "user", text: message }]);
      setChatBusy(true);
      let changes: SheetChanges | null = null;
      let source: "claude" | "local" = "local";
      try {
        const history = chat.slice(-8).map((m) => ({ role: m.role, content: m.text }));
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message, sheetSummary: summariseSheet(current), history }),
        });
        const data = (await res.json()) as { changes?: SheetChanges; source?: "claude" | "local"; error?: string };
        if (res.ok && data.changes) {
          changes = data.changes;
          source = data.source ?? "claude";
        }
      } catch {
        /* offline: fall through to local */
      }
      if (!changes) changes = interpretLocally(message, current);
      try {
        const next = applyChanges(current, changes);
        if (next !== current) commit(next);
      } catch (err) {
        changes.reply += ` (Couldn't apply everything: ${err instanceof Error ? err.message : String(err)})`;
      }
      setChat((c) => [...c, { id: id + 1, role: "assistant", text: changes!.reply, source }]);
      setChatBusy(false);
    },
    [chat, commit],
  );

  const exportMidi = useCallback(() => {
    const bytes = timelineToMidi(timelineRef.current!, sheetRef.current.arrangement, { loops: 2, title: sheetRef.current.title });
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "audio/midi" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${sheetRef.current.title.replace(/[^\w\- ]+/g, "").trim() || "jamtunes"}.mid`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, []);

  return {
    sheet,
    timeline,
    commit,
    undoLast,
    canUndo: undo.length > 0,
    engineState,
    loadLabel,
    activeSlotId,
    countInActive,
    loop,
    setLoop,
    play,
    stop,
    togglePlay,
    loadQuick,
    loadText,
    loadUrl,
    chat,
    chatBusy,
    sendChat,
    exportMidi,
    notice,
    setNotice,
  };
}

export type Jam = ReturnType<typeof useJam>;
