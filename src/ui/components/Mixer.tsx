import { instrumentsForRole } from "@core/instruments";
import { TRACK_IDS, type TrackId } from "@core/sheet/model";
import { updateTrack } from "@core/sheet/transforms";
import type { Jam } from "../useJam";

const LABELS: Record<TrackId, string> = { piano: "Piano", guitar: "Guitar", distGuitar: "Dist. guitar", bass: "Bass", drums: "Drums" };

export function Mixer({ jam }: { jam: Jam }) {
  const { sheet, commit } = jam;
  return (
    <div className="panel mixer">
      <div className="panel-head">
        <h3>Band</h3>
      </div>
      {TRACK_IDS.map((id) => {
        const t = sheet.arrangement.tracks[id];
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
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={t.volume}
              onChange={(e) => commit(updateTrack(sheet, id, { volume: Number(e.target.value) }), { undoable: false })}
              aria-label={`${LABELS[id]} volume`}
            />
          </div>
        );
      })}
    </div>
  );
}
