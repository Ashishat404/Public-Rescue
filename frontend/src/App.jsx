import { useCallback, useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMapEvents } from "react-leaflet";
import { api } from "./api";

const STATUSES = ["Reported", "Assigned", "In Progress", "Rescued", "Resolved", "Closed"];
const TYPES = ["Landslide", "Flash Flood", "Road Accident", "Cloudburst", "Avalanche", "Earthquake", "Other"];
const COLOR = { Reported: "#c8321e", Assigned: "#d98a00", "In Progress": "#1f6fb2", Rescued: "#2f8f5b", Resolved: "#2f8f5b", Closed: "#7b8794" };
const CENTER = [29.58, 80.22];

function MapClicks({ onPick }) {
  useMapEvents({ click: (e) => onPick(e.latlng) });
  return null;
}

export default function App() {
  const [incidents, setIncidents] = useState([]);
  const [teams, setTeams] = useState([]);
  const [selId, setSelId] = useState(null);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [i, t] = await Promise.all([api.incidents(), api.teams()]);
      setIncidents(i); setTeams(t); setError("");
    } catch { setError("Cannot reach the API. Start FastAPI on port 8000."); }
  }, []);

  useEffect(() => { load(); const id = setInterval(load, 5000); return () => clearInterval(id); }, [load]);

  const act = (fn) => async (...a) => { try { await fn(...a); await load(); } catch (e) { setError(e.message); } };
  const assign = act(api.assign), setStatus = act(api.setStatus);
  const submit = act(async (e) => { e.preventDefault(); await api.report(draft); setDraft(null); });

  const sel = incidents.find((i) => i.id === selId);
  const active = incidents.filter((i) => !["Resolved", "Closed"].includes(i.status));
  const free = teams.filter((t) => t.available);

  return (
    <div className="app">
      <aside>
        <header>
          <h1>Rescue Control Room</h1>
          <p>{active.length} active incidents · {free.length} of {teams.length} teams free</p>
          <button className={picking ? "on" : ""} onClick={() => setPicking(!picking)}>
            {picking ? "Click the map to place report" : "Report incident"}
          </button>
          {error && <p className="error">{error}</p>}
        </header>

        <ul className="list">
          {incidents.length === 0 && <li className="empty">No incidents yet. Reports and sensor alerts appear here.</li>}
          {incidents.map((i) => (
            <li key={i.id} className={i.id === selId ? "sel" : ""} onClick={() => setSelId(i.id)}>
              <span className="dot" style={{ background: COLOR[i.status] }} />
              <div><b>{i.type}</b> <small>{i.severity}</small><br /><small>{i.status} · {i.source}</small></div>
            </li>
          ))}
        </ul>

        {sel && (
          <section className="detail">
            <h2>#{sel.id} {sel.type}</h2>
            <p>{sel.description || "No description."}</p>
            <p><small>{sel.lat.toFixed(4)}, {sel.lng.toFixed(4)} · Contact: {sel.contact || "n/a"}</small></p>
            {sel.status === "Reported" && (
              <label>Assign team
                <select defaultValue="" onChange={(e) => assign(sel.id, +e.target.value)}>
                  <option value="" disabled>Choose available team</option>
                  {free.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
            )}
            {sel.team_id && <p>Team: <b>{teams.find((t) => t.id === sel.team_id)?.name}</b></p>}
            {sel.status !== "Reported" && (
              <div className="steps">
                {STATUSES.slice(2).map((s) => (
                  <button key={s} disabled={sel.status === s} onClick={() => setStatus(sel.id, s)}>{s}</button>
                ))}
              </div>
            )}
            <ol className="log">{sel.log.map((l, k) => <li key={k}>{l.status} <small>{l.time.slice(11, 16)} UTC</small></li>)}</ol>
          </section>
        )}
      </aside>

      <MapContainer center={CENTER} zoom={9} className={picking ? "map picking" : "map"}>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapClicks onPick={(p) => { if (picking) { setDraft({ type: "Landslide", description: "", contact: "", severity: "Medium", lat: p.lat, lng: p.lng }); setPicking(false); } }} />
        {incidents.map((i) => (
          <CircleMarker key={i.id} center={[i.lat, i.lng]} radius={i.id === selId ? 13 : 9}
            pathOptions={{ color: "#fff", weight: 2, fillColor: COLOR[i.status], fillOpacity: 0.95 }}
            eventHandlers={{ click: () => setSelId(i.id) }}>
            <Tooltip>{i.type} · {i.status}</Tooltip>
          </CircleMarker>
        ))}
        {teams.map((t) => (
          <CircleMarker key={"t" + t.id} center={[t.lat, t.lng]} radius={6}
            pathOptions={{ color: t.available ? "#2f8f5b" : "#7b8794", weight: 2, fillOpacity: 0 }}>
            <Tooltip>{t.name} ({t.available ? "free" : "busy"})</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>

      {draft && (
        <div className="modal" onClick={() => setDraft(null)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <h2>Report incident</h2>
            <label>Type<select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
            <label>Severity<select value={draft.severity} onChange={(e) => setDraft({ ...draft, severity: e.target.value })}>{["Low", "Medium", "High"].map((s) => <option key={s}>{s}</option>)}</select></label>
            <label>What happened<textarea rows="3" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
            <label>Contact number<input value={draft.contact} onChange={(e) => setDraft({ ...draft, contact: e.target.value })} /></label>
            <small>Location: {draft.lat.toFixed(4)}, {draft.lng.toFixed(4)}</small>
            <div className="row"><button type="button" onClick={() => setDraft(null)}>Cancel</button><button className="on">Send report</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
