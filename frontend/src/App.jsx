import { useCallback, useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMapEvents } from "react-leaflet";
import { api } from "./api";
import Landing from "./Landing.jsx";

const STATUSES = ["Reported", "Assigned", "In Progress", "Rescued", "Resolved", "Closed"];
const TYPES = ["Landslide", "Flash Flood", "Road Accident", "Cloudburst", "Avalanche", "Earthquake", "Other"];
const COLOR = { Reported: "#c8321e", Assigned: "#d98a00", "In Progress": "#1f6fb2", Rescued: "#2f8f5b", Resolved: "#2f8f5b", Closed: "#7b8794" };
const CENTER = [30.15, 79.25];

function MapClicks({ onPick }) {
  useMapEvents({ click: (e) => onPick(e.latlng) });
  return null;
}


function IncidentDetail({ incident, free, teams, assign, setStatus, user, onLogin }) {
  return <section className="detail-card"><div className="card-heading"><div><p className="eyebrow">Selected incident</p><h2>#{incident.id} {incident.type}</h2></div><span className="status-pill">{incident.status}</span></div>
    <p>{incident.description || "No description."}</p><p><small>{incident.lat.toFixed(4)}, {incident.lng.toFixed(4)} · Contact: {incident.contact || "n/a"}</small></p>
    {incident.status === "Reported" && user && <label>Assign team<select defaultValue="" onChange={(e) => assign(incident.id, +e.target.value)}><option value="" disabled>Choose available team</option>{free.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>}
    {incident.status === "Reported" && !user && <p className="staff-note">Staff login is required to assign teams. <button type="button" onClick={onLogin}>Sign in</button></p>}
    {incident.team_id && <p>Team: <b>{teams.find((team) => team.id === incident.team_id)?.name}</b></p>}
    {incident.status !== "Reported" && user && <div className="steps">{STATUSES.slice(2).map((status) => <button key={status} disabled={incident.status === status} onClick={() => setStatus(incident.id, status)}>{status}</button>)}</div>}
    <ol className="log">{incident.log.map((entry, index) => <li key={index}>{entry.status} <small>{entry.time.slice(11, 16)} UTC</small></li>)}</ol>
  </section>;
}

function AuthModal({ form, setForm, onSubmit, onClose, busy, error }) {
  return <div className="modal" onClick={onClose}><form className="auth-form" onClick={(event) => event.stopPropagation()} onSubmit={onSubmit}>
    <p className="eyebrow">Staff access</p><h2>Sign in to control room</h2>
    <label>Email<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
    <label>Password<input required minLength="8" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
    {error && <p className="auth-error">{error}</p>}
    <div className="row"><button type="button" onClick={onClose}>Cancel</button><button className="on" disabled={busy}>{busy ? "Please wait..." : "Sign in"}</button></div>
  </form></div>;
}

export default function App() {
  const [publicView, setPublicView] = useState(true);
  const [incidents, setIncidents] = useState([]);
  const [teams, setTeams] = useState([]);
  const [sensors, setSensors] = useState([]);
  const [selId, setSelId] = useState(null);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState("overview");
  const [user, setUser] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [volunteerAlerts, setVolunteerAlerts] = useState([]);
  const [volunteerLocation, setVolunteerLocation] = useState({ lat: "", lng: "", radius_km: 25 });
  const [locationBusy, setLocationBusy] = useState(false);
  const [staffAccounts, setStaffAccounts] = useState([]);
  const [staffForm, setStaffForm] = useState({ name: "", email: "", password: "" });
  const [staffBusy, setStaffBusy] = useState(false);
  const [staffRequests, setStaffRequests] = useState([]);
  const [staffRequestDecisionId, setStaffRequestDecisionId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [i, t, s] = await Promise.all([api.incidents(), api.teams(), api.sensors()]);
      setIncidents(i); setTeams(t); setSensors(s); setError("");
    } catch { setError("Cannot reach the API. Start FastAPI on port 8000."); }
  }, []);

  useEffect(() => { load(); const id = setInterval(load, 5000); return () => clearInterval(id); }, [load]);
  useEffect(() => { if (localStorage.getItem("rescue_staff_token")) api.me().then(setUser).catch(() => localStorage.removeItem("rescue_staff_token")); }, []);
  useEffect(() => {
    if (user?.role !== "admin") return undefined;
    api.staffUsers().then(setStaffAccounts).catch((accountError) => setError(accountError.message));
    api.staffRequests("pending").then(setStaffRequests).catch((requestError) => setError(requestError.message));
  }, [user]);
  useEffect(() => {
    if (user?.role !== "volunteer") return undefined;
    setVolunteerLocation({
      lat: user.lat ?? "",
      lng: user.lng ?? "",
      radius_km: user.radius_km ?? 25,
    });
    const loadAlerts = async () => {
      try {
        setVolunteerAlerts(await api.volunteerAlerts());
      } catch (alertError) {
        setError(alertError.message);
      }
    };
    loadAlerts();
    const interval = setInterval(loadAlerts, 10000);
    return () => clearInterval(interval);
  }, [user]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);
  useEffect(() => {
    if (!(menuOpen || authOpen || draft)) return undefined;
    document.body.classList.add("drawer-open");
    return () => document.body.classList.remove("drawer-open");
  }, [menuOpen, authOpen, draft]);

  const act = (fn) => async (...a) => { try { await fn(...a); await load(); } catch (e) { setError(e.message); } };
  const assign = act(api.assign), setStatus = act(api.setStatus);
  const submit = act(async (e) => { e.preventDefault(); await api.report(draft); setDraft(null); });

  const sel = incidents.find((i) => i.id === selId);
  const active = incidents.filter((i) => !["Resolved", "Closed"].includes(i.status));
  const free = teams.filter((t) => t.available);
  const highPriority = incidents.filter((i) => i.severity === "High" && !["Resolved", "Closed"].includes(i.status));
  const navigate = (nextView) => { setView(nextView); setMenuOpen(false); };
  const openAuth = () => { setAuthError(""); setAuthOpen(true); };
  const submitAuth = async (event) => {
    event.preventDefault(); setAuthBusy(true); setAuthError("");
    try {
      const result = await api.login({ email: authForm.email, password: authForm.password });
      localStorage.setItem("rescue_staff_token", result.token); setUser(result.user); setAuthOpen(false); setAuthForm({ name: "", email: "", password: "" }); setPublicView(false);
    } catch (authRequestError) { setAuthError(authRequestError.message); } finally { setAuthBusy(false); }
  };
  const signOut = () => { localStorage.removeItem("rescue_staff_token"); setUser(null); };
  const useVolunteerLocation = () => {
    if (!navigator.geolocation) {
      setError("Location access is not supported by this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setVolunteerLocation((location) => ({ ...location, lat: coords.latitude, lng: coords.longitude })),
      () => setError("Location access was denied."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };
  const updateVolunteerLocation = async (event) => {
    event.preventDefault();
    setLocationBusy(true);
    try {
      const saved = await api.volunteerLocation({
        lat: Number(volunteerLocation.lat),
        lng: Number(volunteerLocation.lng),
        radius_km: Number(volunteerLocation.radius_km),
      });
      setUser((current) => ({ ...current, ...saved }));
      setVolunteerLocation(saved);
      setError("");
    } catch (locationError) {
      setError(locationError.message);
    } finally {
      setLocationBusy(false);
    }
  };
  const reloadStaffAccounts = async () => {
    try {
      setStaffAccounts(await api.staffUsers());
    } catch (accountError) {
      setError(accountError.message);
    }
  };
  const createStaffAccount = async (event) => {
    event.preventDefault();
    setStaffBusy(true);
    try {
      await api.signup(staffForm);
      setStaffForm({ name: "", email: "", password: "" });
      await reloadStaffAccounts();
      setError("");
    } catch (accountError) {
      setError(accountError.message);
    } finally {
      setStaffBusy(false);
    }
  };
  const deleteStaffAccount = async (account) => {
    if (!window.confirm(`Delete staff account ${account.email}?`)) return;
    try {
      await api.deleteStaffUser(account.id);
      await reloadStaffAccounts();
      setError("");
    } catch (accountError) {
      setError(accountError.message);
    }
  };
  const reloadStaffRequests = async () => {
    try {
      setStaffRequests(await api.staffRequests("pending"));
    } catch (requestError) {
      setError(requestError.message);
    }
  };
  const approveStaffRequest = async (request) => {
    setStaffRequestDecisionId(request.id);
    try {
      await api.approveStaffRequest(request.id, "staff");
      await Promise.all([reloadStaffRequests(), reloadStaffAccounts()]);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setStaffRequestDecisionId(null);
    }
  };
  const rejectStaffRequest = async (request) => {
    if (!window.confirm(`Reject the access request from ${request.email}?`)) return;
    setStaffRequestDecisionId(request.id);
    try {
      await api.rejectStaffRequest(request.id);
      await reloadStaffRequests();
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setStaffRequestDecisionId(null);
    }
  };
  const navItems = [
    ["overview", "◈", "Overview"],
    ["incidents", "!", "Incidents"],
    ["teams", "+", "Response teams"],
    ["sensors", "⌁", "Sensors"],
    ["reports", "▤", "Reports"],
    ...(user?.role === "admin" ? [["staff-accounts", "◎", "Staff accounts"]] : []),
    ...(user?.role === "volunteer" ? [["volunteer-alerts", "⌖", "Nearby requests"], ["volunteer-location", "◎", "My location"]] : []),
  ];

  if (publicView) {
    return (
      <>
        <Landing
          onReport={() => { setPublicView(false); setPicking(true); }}
          onEnter={(nextView = "overview") => { setView(nextView); setPublicView(false); }}
          onVolunteerAuth={(volunteer) => {
            setUser(volunteer);
            setView("volunteer-alerts");
            setPublicView(false);
          }}
          onSignIn={openAuth}
        />
        {authOpen && <AuthModal form={authForm} setForm={setAuthForm} onSubmit={submitAuth} onClose={() => setAuthOpen(false)} busy={authBusy} error={authError} />}
      </>
    );
  }

  return (
    <div className="app">
      {menuOpen && <button type="button" className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <aside className={menuOpen ? "sidebar open" : "sidebar"}>
        <button type="button" className="brand" onClick={() => setPublicView(true)}><span>Public Rescue</span></button>
        <nav aria-label="Main navigation">
          {navItems.map(([key, icon, label]) => <button key={key} className={view === key ? "nav-item active" : "nav-item"} onClick={() => navigate(key)}><span>{icon}</span> {label}{key === "incidents" && <b>{active.length}</b>}</button>)}
        </nav>
        <div className="sidebar-foot"><small>Control room</small><strong>Live monitoring</strong></div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <button className={menuOpen ? "menu-button open" : "menu-button"} aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><span /><span /><span /></button>
          <div><p className="eyebrow">District response network</p><h1>Rescue Control Room</h1></div>
          <button className={picking ? "report-button on" : "report-button"} onClick={() => setPicking(!picking)}>
            <span>+</span>{picking ? "Place report on map" : "Report incident"}
          </button>
        </header>

        {error && <p className="error">{error}</p>}

        {view === "overview" ? <section className="bento" aria-label="Rescue dashboard">
          <article className="metric metric-alert"><span>Active incidents</span><strong>{active.length}</strong><small>Needs attention now</small></article>
          <article className="metric"><span>High priority</span><strong>{highPriority.length}</strong><small>Across monitored zones</small></article>
          <article className="metric metric-team"><span>Teams available</span><strong>{free.length}<em> / {teams.length}</em></strong><small>Ready to deploy</small></article>
          <article className="map-card"><div className="card-heading"><div><p className="eyebrow">Uttarakhand coverage</p><h2>Incident map</h2></div><span className="live"><i /> Live</span></div><MapContainer center={CENTER} zoom={7} className={picking ? "map picking" : "map"}>
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
          </MapContainer></article>

          <section className="incidents-card"><div className="card-heading"><div><p className="eyebrow">Response queue</p><h2>Recent incidents</h2></div><span className="count-label">{incidents.length} total</span></div>
            <ul className="list">
              {incidents.length === 0 && <li className="empty">No incidents yet. Reports and sensor alerts appear here.</li>}
              {incidents.map((i) => <li key={i.id} className={i.id === selId ? "sel" : ""} onClick={() => setSelId(i.id)}><span className="dot" style={{ background: COLOR[i.status] }} /><div><b>{i.type}</b> <small>{i.severity}</small><br /><small>{i.status} · {i.source}</small></div><span className="arrow">›</span></li>)}
            </ul>
          </section>

          {sel && <section className="detail-card"><div className="card-heading"><div><p className="eyebrow">Selected incident</p><h2>#{sel.id} {sel.type}</h2></div><span className="status-pill">{sel.status}</span></div>
            <p>{sel.description || "No description."}</p><p><small>{sel.lat.toFixed(4)}, {sel.lng.toFixed(4)} · Contact: {sel.contact || "n/a"}</small></p>
            {sel.status === "Reported" && user && <label>Assign team<select defaultValue="" onChange={(e) => assign(sel.id, +e.target.value)}><option value="" disabled>Choose available team</option>{free.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
            {sel.status === "Reported" && !user && <p className="staff-note">Staff login is required to assign teams. <button type="button" onClick={() => openAuth()}>Sign in</button></p>}
            {sel.team_id && <p>Team: <b>{teams.find((t) => t.id === sel.team_id)?.name}</b></p>}
            {sel.status !== "Reported" && user && <div className="steps">{STATUSES.slice(2).map((s) => <button key={s} disabled={sel.status === s} onClick={() => setStatus(sel.id, s)}>{s}</button>)}</div>}
            <ol className="log">{sel.log.map((l, k) => <li key={k}>{l.status} <small>{l.time.slice(11, 16)} UTC</small></li>)}</ol>
          </section>}
        </section> : <section className="data-view" aria-label={`${view} view`}>
          <div className="view-heading"><div><p className="eyebrow">Control room</p><h2>{navItems.find(([key]) => key === view)?.[2]}</h2></div><span className="count-label">Updated live</span></div>
          {view === "incidents" && <div className="view-grid"><div className="data-card"><div className="card-heading"><div><p className="eyebrow">All alerts</p><h2>Incident queue</h2></div><span className="count-label">{incidents.length} total</span></div><ul className="list">{incidents.map((i) => <li key={i.id} className={i.id === selId ? "sel" : ""} onClick={() => setSelId(i.id)}><span className="dot" style={{ background: COLOR[i.status] }} /><div><b>{i.type}</b> <small>{i.severity}</small><br /><small>{i.status} · {i.source}</small></div><span className="arrow">›</span></li>)}</ul></div>{sel && <IncidentDetail incident={sel} free={free} teams={teams} assign={assign} setStatus={setStatus} user={user} onLogin={() => openAuth()} />}</div>}
          {view === "teams" && <div className="data-card"><div className="card-heading"><div><p className="eyebrow">Statewide deployment roster</p><h2>Response teams</h2></div><span className="count-label">{free.length} available</span></div><div className="team-grid">{teams.map((team) => <div className="team-row" key={team.id}><span className={team.available ? "team-dot ready" : "team-dot busy"} /><div><b>{team.name}</b><small>{team.district} · {team.available ? "Ready to deploy" : "Currently assigned"}</small></div><span className="status-pill">{team.available ? "Available" : "Busy"}</span></div>)}</div></div>}
          {view === "sensors" && <div className="data-card"><div className="card-heading"><div><p className="eyebrow">Statewide field monitoring</p><h2>Connected sensors</h2></div><span className="count-label">{sensors.length} online</span></div>{sensors.length === 0 ? <p className="empty-copy">No sensor readings have been received yet.</p> : <div className="sensor-grid">{sensors.map((sensor) => <div className="sensor-row" key={sensor.sensor_id}><div><b>{sensor.sensor_id}</b><small>{sensor.district || "Unassigned"} · {sensor.lat.toFixed(3)}, {sensor.lng.toFixed(3)}</small></div><span>Rain {sensor.rainfall_mm} mm</span><span>Soil {sensor.soil_moisture}%</span><span className={sensor.breached ? "sensor-alert" : "sensor-ok"}>{sensor.breached ? "Alert" : "Normal"}</span></div>)}</div>}</div>}
          {view === "reports" && <div className="report-grid"><div className="report-stat"><span>Total incidents</span><strong>{incidents.length}</strong><small>All reported events</small></div><div className="report-stat"><span>Resolved</span><strong>{incidents.filter((i) => ["Resolved", "Closed"].includes(i.status)).length}</strong><small>Completed response cases</small></div><div className="report-stat"><span>Sensor alerts</span><strong>{incidents.filter((i) => i.source === "sensor").length}</strong><small>Automatically detected</small></div></div>}
          {view === "staff-accounts" && user?.role === "admin" && (
            <div className="staff-admin-grid">
              <div className="data-card">
                <div className="card-heading">
                  <div><p className="eyebrow">Awaiting review</p><h2>Pending access requests</h2></div>
                  <span className="count-label">{staffRequests.length} pending</span>
                </div>
                {staffRequests.length === 0 ? (
                  <p className="empty-copy">No pending requests. New "Request access" submissions from the landing page will appear here.</p>
                ) : (
                  <div className="staff-account-list">
                    {staffRequests.map((request) => (
                      <div className="staff-account-row" key={request.id}>
                        <div><b>{request.name}</b><small>{request.email}{request.note ? ` · ${request.note}` : ""}</small></div>
                        <span className="status-pill">{request.status}</span>
                        <div className="staff-request-actions">
                          <button type="button" className="reject-button" onClick={() => rejectStaffRequest(request)} disabled={staffRequestDecisionId === request.id}>Reject</button>
                          <button type="button" className="approve-button" onClick={() => approveStaffRequest(request)} disabled={staffRequestDecisionId === request.id}>{staffRequestDecisionId === request.id ? "Working..." : "Approve"}</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <form className="data-card staff-account-form" onSubmit={createStaffAccount}>
                <div className="card-heading">
                  <div><p className="eyebrow">Administrator</p><h2>Add staff account</h2></div>
                </div>
                <div className="staff-account-fields">
                  <label>Full name<input required value={staffForm.name} onChange={(event) => setStaffForm({ ...staffForm, name: event.target.value })} /></label>
                  <label>Email<input required type="email" value={staffForm.email} onChange={(event) => setStaffForm({ ...staffForm, email: event.target.value })} /></label>
                  <label>Password<input required minLength="8" type="password" value={staffForm.password} onChange={(event) => setStaffForm({ ...staffForm, password: event.target.value })} /></label>
                  <div className="row"><button className="on" disabled={staffBusy}>{staffBusy ? "Creating..." : "Create staff account"}</button></div>
                </div>
              </form>
              <div className="data-card">
                <div className="card-heading">
                  <div><p className="eyebrow">Account directory</p><h2>Staff accounts</h2></div>
                  <span className="count-label">{staffAccounts.filter((account) => account.role === "staff").length} staff</span>
                </div>
                {staffAccounts.length === 0 ? (
                  <p className="empty-copy">No accounts found.</p>
                ) : (
                  <div className="staff-account-list">
                    {staffAccounts.map((account) => (
                      <div className="staff-account-row" key={account.id}>
                        <div><b>{account.name}</b><small>{account.email}</small></div>
                        <span className="status-pill">{account.role}</span>
                        {account.role === "staff" && (
                          <button type="button" className="delete-account-button" onClick={() => deleteStaffAccount(account)}>Delete</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          {view === "volunteer-alerts" && <div className="view-grid"><div className="data-card"><div className="card-heading"><div><p className="eyebrow">Your active radius</p><h2>Nearby incident requests</h2></div><span className="count-label">{volunteerAlerts.length} nearby</span></div>{volunteerAlerts.length === 0 ? <p className="empty-copy">No active incidents are currently inside your alert radius.</p> : <ul className="list">{volunteerAlerts.map((alert) => <li key={alert.id}><span className="dot" style={{ background: COLOR[alert.status] }} /><div><b>#{alert.id} {alert.type}</b><small> · {alert.severity} · {alert.distance_km} km away</small><br /><small>{alert.status} · {alert.description || "No description"}</small></div></li>)}</ul>}</div></div>}
          {view === "volunteer-location" && <form className="data-card volunteer-location-form" onSubmit={updateVolunteerLocation}><div className="card-heading"><div><p className="eyebrow">Alert settings</p><h2>My location</h2></div></div><div className="volunteer-location-fields"><button type="button" className="location-button" onClick={useVolunteerLocation}>Use my current location</button><label>Latitude<input required type="number" step="any" min="-90" max="90" value={volunteerLocation.lat} onChange={(event) => setVolunteerLocation({ ...volunteerLocation, lat: event.target.value })} /></label><label>Longitude<input required type="number" step="any" min="-180" max="180" value={volunteerLocation.lng} onChange={(event) => setVolunteerLocation({ ...volunteerLocation, lng: event.target.value })} /></label><label>Alert radius (km)<input required type="number" min="1" max="500" value={volunteerLocation.radius_km} onChange={(event) => setVolunteerLocation({ ...volunteerLocation, radius_km: event.target.value })} /></label><div className="row"><button className="on" disabled={locationBusy}>{locationBusy ? "Saving..." : "Save location"}</button></div></div></form>}
        </section>}
      </main>

      {authOpen && <AuthModal form={authForm} setForm={setAuthForm} onSubmit={submitAuth} onClose={() => setAuthOpen(false)} busy={authBusy} error={authError} />}

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