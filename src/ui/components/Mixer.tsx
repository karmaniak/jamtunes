import { instrumentsForRole } from "@core/instruments";
import { TRACK_IDS, type TrackId } from "@core/sheet/model";
import { updateTrack } from "@core/sheet/transforms";
import type { Jam } from "../useJam";

const LABELS: Record<TrackId, string> = { piano: "Keys", guitar: "Guitar", distGuitar: "Dist. guitar", bass: "Bass", drums: "Drums" };
const SHORT: Record<TrackId, string> = { piano: "Keys", guitar: "Gtr", distGuitar: "Dist", bass: "Bass", drums: "Drums" };

/** Who's playing and how involved they are. Volume lives in the Mixer. */
export function Band({ jam }: { jam: Jam }) {
  const { sheet, commit } = jam;
  return (
    <div className="panel band">
      <div className="panel-head">
        <h3>Band</h3>
        <span className="muted small">simple ↔ busy</span>
      </div>
      {TRACK_IDS.map((id) => {
        const t = sheet.arrangement.tracks[id];
        const complexity = t.complexity ?? 0.5;
        return (
          <div key={id} className={`track ${t.enabled ? "" : "off"}`}>
            <label className="check">
              <input type="checkbox" checked={t.enabled} onChange={(e) => commit(updateTrack(sheet, id, { enabled: e.target.checked }), { undoable: false })} />
              <span>{LABELS[id]}</span>
            </label>
            <select value={t.instrument} onChange={(e) => commit(updateTrack(sheet, id, { instrument: e.target.value }))}>
              {instrumentsForRole(id).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
            <input
              className="complexity"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={complexity}
              disabled={!t.enabled}
              onChange={(e) => commit(updateTrack(sheet, id, { complexity: Number(e.target.value) }))}
              aria-label={`${LABELS[id]} complexity`}
              title={`Complexity ${Math.round(complexity * 100)}% — left: sparse and simple, middle: the style as written, right: busy and involved`}
            />
          </div>
        );
      })}
    </div>
  );
}

/** Levels only. Click a name to mute. */
export function Mixer({ jam }: { jam: Jam }) {
  const { sheet, commit } = jam;
  return (
    <div className="panel mixer">
      <div className="panel-head">
        <h3>Mixer</h3>
      </div>
      <div className="faders">
        {TRACK_IDS.map((id) => {
          const t = sheet.arrangement.tracks[id];
          return (
            <div key={id} className={`fader ${t.enabled ? "" : "off"}`}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={t.volume}
                onChange={(e) => commit(updateTrack(sheet, id, { volume: Number(e.target.value) }), { undoable: false })}
                aria-label={`${LABELS[id]} volume`}
                title={`${LABELS[id]} ${Math.round(t.volume * 100)}%`}
              />
              <button className={`fader-name ${t.enabled ? "" : "muted-track"}`} onClick={() => commit(updateTrack(sheet, id, { enabled: !t.enabled }), { undoable: false })} title={t.enabled ? "Mute" : "Unmute"}>
                {SHORT[id]}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
