/**
 * App state: the sheet, undo history, recent jams, the audio engine,
 * playback position, chat. Everything that mutates the sheet goes through
 * `commit`, which keeps playback in sync (re-arranges live from the current
 * bar). No accounts: everything persists in this browser.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildTimeline, type SlotMarker, type Timeline } from "@core/arrange/arranger";
import { applyChanges, describeDiff, interpretLocally, summariseSheet, type SheetChanges } from "@core/chat/intent";
import { instrumentFor } from "@core/instruments";
import { timelineToMidi } from "@core/midi/writer";
import { sheetFromQuick, sheetFromText } from "@core/parse/build";
import { keyLabel } from "@core/sheet/describe";
import { totalBars, TRACK_IDS, type ChordSheet } from "@core/sheet/model";
import { JamEngine, type EngineState } from "@audio/engine";

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  source?: "ai" | "local";
  error?: boolean;
}

export interface ChatStatus {
  mode: "unknown" | "ai" | "local";
}

export interface RecentJam {
  id: string;
  title: string;
  key: string;
  style: string;
  bars: number;
  savedAt: number;
  sheet: ChordSheet;
}

const STORAGE_KEY = "jamtunes.sheet.v1";
const RECENT_KEY = "jamtunes.recent.v1";
const DEVICE_KEY = "jamtunes.device.v1";
const RECENT_MAX = 10;
const DEMO = "[Verse]\n| Am F | C G |\n| Am F | C G |\n[Chorus]\nF G C Am\nF . G . C . . . E7 . . .";

function migrate(sheet: ChordSheet): ChordSheet {
  // Instrument ids change between versions; fall back to the role default.
  for (const id of TRACK_IDS) sheet.arrangement.tracks[id].instrument = instrumentFor(id, sheet.arrangement.tracks[id].instrument).id;
  return sheet;
}

function loadStored(): ChordSheet | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? migrate(JSON.parse(raw) as ChordSheet) : null;
  } catch {
    return null;
  }
}

function loadRecent(): RecentJam[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as RecentJam[]) : [];
    return list.map((r) => ({ ...r, sheet: migrate(r.sheet) }));
  } catch {
    return [];
  }
}

/** Anonymous per-browser id, only used so the server can apply fair-use limits. */
function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^a-z0-9-]/gi, "").slice(0, 64);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

function toRecent(sheet: ChordSheet): RecentJam {
  return { id: sheet.id, title: sheet.title || "Untitled jam", key: keyLabel(sheet.key), style: sheet.arrangement.style, bars: totalBars(sheet, false), savedAt: Date.now(), sheet };
}

export function useJam() {
  const [sheet, setSheetState] = useState<ChordSheet>(() => loadStored() ?? sheetFromQuick(DEMO, undefined, { style: "rock", title: "Demo jam" }).sheet);
  const [recent, setRecent] = useState<RecentJam[]>(() => loadRecent());
  const [undo, setUndo] = useState<ChordSheet[]>([]);
  const [engineState, setEngineState] = useState<EngineState>("idle");
  const [loadLabel, setLoadLabel] = useState("");
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [activeMarker, setActiveMarker] = useState<SlotMarker | null>(null);
  const [focusSectionId, setFocusSectionId] = useState<string | null>(null);
  const [countInActive, setCountInActive] = useState(false);
  const [loop, setLoop] = useState(true);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatStatus, setChatStatus] = useState<ChatStatus>({ mode: "unknown" });
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
          setActiveMarker(marker ?? null);
        }
      };
      engineRef.current = e;
    }
    return engineRef.current;
  };

  // Persist the current sheet immediately; refresh the recent list a beat later.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sheet));
    } catch {
      /* storage full or unavailable */
    }
    const handle = window.setTimeout(() => {
      try {
        if (sheet.sections.length > 0) {
          setRecent((list) => {
            const next = [toRecent(sheet), ...list.filter((r) => r.id !== sheet.id)].slice(0, RECENT_MAX);
            localStorage.setItem(RECENT_KEY, JSON.stringify(next));
            return next;
          });
        }
      } catch {
        /* storage full or unavailable */
      }
    }, 600);
    return () => window.clearTimeout(handle);
  }, [sheet]);

  useEffect(() => () => engineRef.current?.dispose(), []);

  // Is the band's AI available? (Operator-configured; users never set anything up.)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((r) => r.json())
      .then((d: { chat?: "ai" | "local" }) => {
        if (!cancelled) setChatStatus({ mode: d.chat ?? "local" });
      })
      .catch(() => {
        if (!cancelled) setChatStatus({ mode: "local" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Replace the sheet; if playing, keep playing from the same bar with the new arrangement. */
  const commit = useCallback((next: ChordSheet, opts: { undoable?: boolean } = {}) => {
    const prev = sheetRef.current;
    if (next === prev) return;
    if (opts.undoable !== false) setUndo((u) => [...u.slice(-49), prev]);
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
    setActiveMarker(null);
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
    (text: string) => {
      const { sheet: s, warnings } = sheetFromText(text);
      if (s.sections.length === 0) {
        setNotice("No chord lines found in that text.");
        return;
      }
      commit(s);
      setNotice(warnings.length ? warnings.join(" · ") : null);
    },
    [commit],
  );

  const loadRecentJam = useCallback(
    (id: string) => {
      const r = recent.find((x) => x.id === id);
      if (r) commit(structuredClone(r.sheet));
    },
    [recent, commit],
  );

  const removeRecentJam = useCallback((id: string) => {
    setRecent((list) => {
      const next = list.filter((r) => r.id !== id);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const exportJson = useCallback(() => {
    const s = sheetRef.current;
    const blob = new Blob([JSON.stringify({ jamtunes: 1, sheet: s }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(s.title || "jam").replace(/[^\w\- ]+/g, "").trim() || "jam"}.jam.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, []);

  const importJson = useCallback(
    async (file: File) => {
      try {
        const data = JSON.parse(await file.text()) as { sheet?: ChordSheet } | ChordSheet;
        const s = "sheet" in data && data.sheet ? data.sheet : (data as ChordSheet);
        if (!s || !Array.isArray(s.sections) || !s.arrangement) throw new Error("not a JamTunes file");
        commit(migrate(structuredClone(s)));
        setNotice(null);
      } catch (err) {
        setNotice(`Couldn't open that file: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [commit],
  );

  const sendChat = useCallback(
    async (message: string) => {
      const current = sheetRef.current;
      const id = Date.now();
      setChat((c) => [...c, { id, role: "user", text: message }]);
      setChatBusy(true);
      let changes: SheetChanges | null = null;
      let source: "ai" | "local" = "local";
      let serverError: string | null = null;
      try {
        const history = chat.slice(-8).map((m) => ({ role: m.role, content: m.text }));
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json", "x-jam-device": deviceId() },
          body: JSON.stringify({ message, sheetSummary: summariseSheet(current), history }),
        });
        const data = (await res.json()) as { changes?: SheetChanges; source?: "ai" | "local"; error?: string };
        if (res.ok && data.changes) {
          changes = data.changes;
          source = data.source ?? "ai";
        } else if (data.error) {
          serverError = data.error;
        }
      } catch {
        serverError = chatStatus.mode === "ai" ? "Couldn't reach the band's AI; applied what I could locally." : null;
      }
      if (!changes) changes = interpretLocally(message, current);
      // Apply to the *latest* sheet: the user may have edited while we waited.
      const latest = sheetRef.current;
      let applied: string[] = [];
      try {
        const next = applyChanges(latest, changes, message);
        applied = describeDiff(latest, next);
        if (next !== latest && applied.length) commit(next);
      } catch (err) {
        changes.reply += ` (Couldn't apply everything: ${err instanceof Error ? err.message : String(err)})`;
      }
      // The reply is the model's claim; the diff is what actually happened.
      const receipt = applied.length ? `✓ ${applied.join(" · ")}` : "— nothing changed on the sheet";
      const reply = `${changes.reply}\n${receipt}${serverError ? `\n\n${serverError}` : ""}`;
      setChat((c) => [...c, { id: id + 1, role: "assistant", text: reply, source, error: !!serverError }]);
      setChatBusy(false);
    },
    [chat, chatStatus.mode, commit],
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
    recent,
    loadRecentJam,
    removeRecentJam,
    exportJson,
    importJson,
    engineState,
    loadLabel,
    activeSlotId,
    activeMarker,
    focusSectionId,
    focusSection: setFocusSectionId,
    countInActive,
    loop,
    setLoop,
    play,
    stop,
    togglePlay,
    loadQuick,
    loadText,
    chat,
    chatBusy,
    chatStatus,
    sendChat,
    exportMidi,
    notice,
    setNotice,
  };
}

export type Jam = ReturnType<typeof useJam>;
