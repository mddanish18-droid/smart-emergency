import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Brand from "../components/Brand.jsx";
import { DispatchMap } from "../components/Maps.jsx";
import { getIncidents, getIncidentEvents, setStatus, login, createDispatcher, getDispatchers, updateDispatcher, logout, isLoggedIn, dispatcherRole, SYMPTOM_LABEL, STATUS_LABEL } from "../lib/api.js";

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const RANK = { critical: 0, medium: 1, low: 2 };
const NEXT = {
  received: { to: "assigned", label: "Assign ambulance" },
  assigned: { to: "enroute", label: "Mark on the way" },
  enroute: { to: "arrived", label: "Mark arrived" },
};
const sevClass = (i) => (i.severity === "critical" ? "" : i.severity);

function ago(ts) {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  return m < 1 ? "just now" : m < 60 ? m + " min ago" : Math.round(m / 60) + " h ago";
}

export default function Dispatch() {
  const [incidents, setIncidents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [actionError, setActionError] = useState("");
  const [authenticated, setAuthenticated] = useState(isLoggedIn());
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [account, setAccount] = useState({ username: "", password: "" });
  const [accountMessage, setAccountMessage] = useState("");
  const [accountError, setAccountError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [dispatchers, setDispatchers] = useState([]);
  const [events, setEvents] = useState([]);
  const [role, setRole] = useState(dispatcherRole());
  const isAdmin = role === "admin";

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setIncidents(await getIncidents());
      setRefreshError("");
    } catch (error) {
      setRefreshError(error.message || "Could not load incidents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authenticated) return undefined;
    refresh();
    if (isAdmin) getDispatchers().then(setDispatchers).catch((error) => setAccountError(error.message || "Could not load dispatcher accounts."));
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh, authenticated]);

  const sorted = useMemo(
    () =>
      [...incidents].filter((incident) => {
        const text = `${incident.id} ${incident.name} ${incident.phone} ${incident.symptoms.join(" ")}`.toLowerCase();
        return (!query || text.includes(query.toLowerCase())) &&
          (statusFilter === "all" || (statusFilter === "open" ? incident.status !== "closed" : incident.status === statusFilter)) &&
          (severityFilter === "all" || incident.severity === severityFilter);
      }).sort((a, b) => {
        const ca = a.status === "closed", cb = b.status === "closed";
        if (ca !== cb) return ca ? 1 : -1;
        return RANK[a.severity] - RANK[b.severity] || b.created - a.created;
      }),
    [incidents, query, statusFilter, severityFilter]
  );

  async function signIn(event) {
    event.preventDefault();
    setLoginError("");
    try {
      const result = await login(credentials.username.trim(), credentials.password);
      setRole(result.role || "dispatcher");
      setAuthenticated(true);
    } catch (error) {
      setLoginError(error.message || "Could not sign in.");
    }
  }

  async function addDispatcher(event) {
    event.preventDefault();
    setAccountMessage("");
    setAccountError("");
    try {
      await createDispatcher(account.username, account.password);
      setAccount({ username: "", password: "" });
      setAccountMessage("Dispatcher account created. They can sign in now.");
    } catch (error) {
      setAccountError(error.message || "Could not create the dispatcher account.");
    }
  }

  async function toggleDispatcher(accountRow) {
    try {
      await updateDispatcher(accountRow.username, { active: !accountRow.active });
      setDispatchers(await getDispatchers());
    } catch (error) {
      setAccountError(error.message || "Could not update the dispatcher account.");
    }
  }

  if (!authenticated) {
    return (
      <main className="dispatch-auth">
        <header className="dispatch-auth-head">
          <Brand suffix=" dispatch" />
          <Link className="dispatch-home-link" to="/">Back to home</Link>
        </header>
        <section className="dispatch-auth-card" aria-labelledby="dispatcher-signin-title">
          <div className="dispatch-auth-icon" aria-hidden="true">✦</div>
          <p className="dispatch-eyebrow">RapidRelay control room</p>
          <h1 id="dispatcher-signin-title">Welcome back</h1>
          <p className="lede">Sign in to coordinate emergency alerts and keep help moving.</p>
          <div className="dispatch-secure-note"><span aria-hidden="true">●</span> Secure dispatcher access</div>
          <form className="stack dispatch-auth-form" onSubmit={signIn}>
            <div className="field"><label htmlFor="dispatcher-user">Username</label><input id="dispatcher-user" autoComplete="username" placeholder="Enter your username" value={credentials.username} onChange={(e) => setCredentials({ ...credentials, username: e.target.value })} required /></div>
            <div className="field"><label htmlFor="dispatcher-password">Password</label><input id="dispatcher-password" type="password" autoComplete="current-password" placeholder="Enter your password" value={credentials.password} onChange={(e) => setCredentials({ ...credentials, password: e.target.value })} required /></div>
            {loginError && <p className="note error" role="alert">{loginError}</p>}
            <button className="btn" type="submit">Enter dispatcher view <span aria-hidden="true">→</span></button>
          </form>
          <p className="dispatch-auth-footer">Need emergency help? <a href="tel:112">Call 112</a></p>
        </section>
      </main>
    );
  }

  const open = incidents.filter((i) => i.status !== "closed");
  const selected = incidents.find((i) => i.id === selectedId);
  const allOpenSelected = open.length > 0 && open.every((i) => selectedIds.includes(i.id));

  async function act(status) {
    setActionError("");
    try {
      await setStatus(selectedId, status);
      await refresh();
      setEvents(await getIncidentEvents(selectedId));
    } catch (error) {
      setActionError(error.message || "Could not update the incident.");
    }

    useEffect(() => {
      if (!selectedId || !authenticated) return undefined;
      getIncidentEvents(selectedId).then(setEvents).catch(() => setEvents([]));
      return undefined;
    }, [selectedId, authenticated]);
  }

  function toggleAllOpen() {
    setSelectedIds(allOpenSelected ? [] : open.map((i) => i.id));
  }

  async function closeSelected() {
    if (!selectedIds.length || !window.confirm(`Close ${selectedIds.length} selected case${selectedIds.length === 1 ? "" : "s"}?`)) return;
    setActionError("");
    try {
      await Promise.all(selectedIds.map((id) => setStatus(id, "closed")));
      setSelectedIds([]);
      setSelectedId(null);
      refresh();
    } catch (error) {
      setActionError(error.message || "Some cases could not be closed.");
      refresh();
    }
  }

  return (
    <div className="dash">
      <aside className="dash-list">
        <div className="dash-head">
          <div className="dash-brand-row">
            <Brand suffix=" dispatch" />
            <button className="dash-signout" onClick={() => { logout(); setRole("dispatcher"); setAuthenticated(false); }}>Sign out</button>
          </div>
          <nav className="dash-nav" aria-label="Dispatcher navigation">
            <Link to="/"><span>⌂</span> Home</Link>
            <Link to="/sos"><span>＋</span> Patient app</Link>
            <Link className="active" to="/dispatch"><span>▣</span> Control room</Link>
          </nav>
          <div className="dash-section-label">Live overview</div>
          <div className="dash-stats" aria-live="polite">
            <div><strong>{open.length}</strong><span>Open cases</span></div>
            <div><strong>{open.filter((i) => i.severity === "critical").length}</strong><span>Critical</span></div>
            <div><strong>{incidents.length - open.length}</strong><span>Closed</span></div>
          </div>
          <div className="dash-section-label cases-label">Incoming alerts</div>
          <div className="incident-filters">
            <label className="sr-only" htmlFor="incident-search">Search incidents</label>
            <input id="incident-search" placeholder="Search cases, symptoms or phone" value={query} onChange={(event) => setQuery(event.target.value)} />
            <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="open">Open cases</option><option value="all">All cases</option><option value="received">Received</option><option value="assigned">Assigned</option><option value="enroute">On the way</option><option value="arrived">Arrived</option><option value="closed">Closed</option>
            </select>
            <select aria-label="Filter by severity" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
              <option value="all">All priorities</option><option value="critical">Critical</option><option value="medium">Medium</option><option value="low">Low</option>
            </select>
          </div>
          <div className="bulk-actions">
            <button className="dash-select-all" onClick={toggleAllOpen} disabled={!open.length}>
              <span>{allOpenSelected ? "−" : "✓"}</span>{allOpenSelected ? "Clear selection" : "Select all open"}
            </button>
            <button className="btn dark bulk-close" onClick={closeSelected} disabled={!selectedIds.length}>
              Close selected <b>{selectedIds.length}</b>
            </button>
          </div>
          {actionError && <p className="note error" role="alert">{actionError}</p>}
          {refreshError && <p className="note error" role="alert">{refreshError} <button className="linkbtn" onClick={refresh}>Retry</button></p>}
          {loading && <p className="note" role="status">Refreshing incidents…</p>}
        </div>

        <div className="incidents" aria-live="polite">
          {sorted.length === 0 && <p className="empty">{incidents.length ? "No cases match these filters." : "No alerts yet. When someone sends an SOS it appears here."}</p>}
          {sorted.map((i) => {
            const sym = i.symptoms.length ? i.symptoms.map((s) => SYMPTOM_LABEL[s]).join(", ") : "No symptoms given";
            return (
              <button
                key={i.id}
                className={"inc " + sevClass(i)}
                aria-current={i.id === selectedId}
                style={i.status === "closed" ? { opacity: 0.55 } : undefined}
                onClick={() => setSelectedId(i.id)}
              >
                {i.status !== "closed" && (
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(i.id)}
                    aria-label={`Select case ${i.id}`}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => setSelectedIds((ids) => ids.includes(i.id) ? ids.filter((id) => id !== i.id) : [...ids, i.id])}
                  />
                )}
                <strong>{cap(i.severity)}: {sym}</strong>
                <span>{i.name || "Unnamed patient"}{i.age ? ", " + i.age : ""}</span>
                <span>{STATUS_LABEL[i.status]}, {ago(i.created)}</span>
              </button>
            );
          })}
        </div>
        {isAdmin && (
          <div className="account-list">
            <div className="dash-section-label">Dispatcher accounts</div>
            {dispatchers.map((accountRow) => (
              <div className="account-row" key={accountRow.username}>
                <span><strong>{accountRow.username}</strong><small>{accountRow.role}</small></span>
                <button className="linkbtn" disabled={accountRow.role === "admin"} onClick={() => toggleDispatcher(accountRow)}>
                  {accountRow.role === "admin" ? "Primary admin" : accountRow.active ? "Disable" : "Enable"}
                </button>
              </div>
            ))}
          </div>
        )}
      </aside>

      <section className="dash-main">
        <div className="dash-workspace">
          <header className="dash-toolbar">
            <div>
              <p className="dash-kicker">Operations dashboard</p>
              <h1>Emergency response <span className="dash-live-badge">LIVE</span></h1>
            </div>
            <div className="dash-toolbar-actions">
              {isAdmin && <button className="btn ghost account-toggle" onClick={() => { setAccountOpen((value) => !value); setAccountError(""); setAccountMessage(""); }}>
                {accountOpen ? "Close account form" : "＋ Add dispatcher"}
              </button>}
              <div className="dash-live"><span /> Live monitoring <small>Updates every 3 sec</small></div>
            </div>
          </header>
          {isAdmin && accountOpen && (
            <form className="account-panel" onSubmit={addDispatcher}>
              <div>
                <p className="dash-kicker">Team access</p>
                <h2>Create dispatcher account</h2>
                <p>Give a trusted responder their own sign-in. Passwords are stored securely by the backend.</p>
              </div>
              <div className="account-fields">
                <div className="field"><label htmlFor="new-dispatcher-user">Username</label><input id="new-dispatcher-user" autoComplete="off" placeholder="e.g. night-shift" value={account.username} onChange={(e) => setAccount({ ...account, username: e.target.value })} required minLength="3" /></div>
                <div className="field"><label htmlFor="new-dispatcher-password">Temporary password</label><input id="new-dispatcher-password" type="password" autoComplete="new-password" placeholder="At least 8 characters" value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} required minLength="8" /></div>
                <button className="btn" type="submit">Create account</button>
              </div>
              {accountMessage && <p className="account-success" role="status">{accountMessage}</p>}
              {accountError && <p className="note error" role="alert">{accountError}</p>}
            </form>
          )}
          <div className="dash-map-wrap">
            <DispatchMap incidents={incidents} selectedId={selectedId} onSelect={setSelectedId} />
            <div className="map-overlay"><span>⌖</span> Incident map <small>{open.length} active</small></div>
          </div>
        </div>
        <div className="detail">
          {!selected && <div className="detail-empty"><span>↖</span><strong>Select an alert to inspect it</strong><p>Patient details, hospital routing and response actions will appear here.</p></div>}
          {selected && (
            <>
              <div className="detail-title">
                <p className="dash-kicker">Selected incident</p>
                <h2>{selected.name || "Unnamed patient"}{selected.age ? ", " + selected.age : ""}</h2>
              </div>
              <span className={"detail-status " + selected.severity}>{cap(selected.severity)} priority</span>
              <div style={{ display: "grid", gap: 12 }}>
                <div className="pillrow">
                  {selected.symptoms.length
                    ? selected.symptoms.map((s) => <span key={s} className="pill">{SYMPTOM_LABEL[s]}</span>)
                    : <span className="pill">No symptoms given</span>}
                </div>
                {events.length > 0 && (
                  <div className="audit-log">
                    <h3>Activity log</h3>
                    {events.map((event) => <div key={`${event.event}-${event.created}`}><strong>{STATUS_LABEL[event.event] || event.event}</strong><span>{event.actor} · {new Date(event.created).toLocaleString()}</span></div>)}
                  </div>
                )}
                <dl className="kv">
                  <dt>Priority</dt><dd>{cap(selected.severity)} ({Math.round(selected.confidence * 100)}% model confidence)</dd>
                  <dt>Hospital</dt><dd>{selected.hospital.name}, {selected.hospital.distance_km} km, about {selected.hospital.eta_min} min</dd>
                  <dt>Needs</dt><dd>{cap(selected.specialty)}</dd>
                  <dt>Phone</dt><dd>{selected.phone ? <a href={"tel:" + selected.phone}>{selected.phone}</a> : "Not given"}</dd>
                  <dt>Status</dt><dd>{STATUS_LABEL[selected.status]}</dd>
                  <dt>Case ID</dt><dd>{selected.id}, received {ago(selected.created)}</dd>
                </dl>
              </div>
              <div className="actions">
                {NEXT[selected.status] && <button className="btn dark" onClick={() => act(NEXT[selected.status].to)}>{NEXT[selected.status].label}</button>}
                {selected.status !== "closed" && <button className="btn ghost" onClick={() => act("closed")}>Close case</button>}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
