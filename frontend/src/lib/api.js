// Shared data layer. All incident data is stored by the FastAPI backend in SQLite.

export const SYMPTOMS = [
  { id: "unconscious", label: "Not responding", w: 3, spec: "emergency" },
  { id: "severe_bleeding", label: "Heavy bleeding", w: 3, spec: "trauma" },
  { id: "chest_pain", label: "Chest pain", w: 3, spec: "cardiology" },
  { id: "breathing_difficulty", label: "Trouble breathing", w: 3, spec: "emergency" },
  { id: "stroke_signs", label: "Face drooping or slurred speech", w: 3, spec: "neurology" },
  { id: "seizure", label: "Seizure", w: 2, spec: "neurology" },
  { id: "burns", label: "Burns", w: 2, spec: "burns" },
  { id: "fracture", label: "Broken bone", w: 2, spec: "trauma" },
  { id: "high_fever", label: "High fever", w: 1, spec: "general" },
  { id: "vomiting", label: "Vomiting", w: 1, spec: "general" },
  { id: "headache", label: "Bad headache", w: 1, spec: "general" },
  { id: "minor_injury", label: "Minor injury", w: 0, spec: "general" },
  { id: "abdominal_pain", label: "Severe stomach pain", w: 2, spec: "general" },
  { id: "allergic_reaction", label: "Severe allergic reaction", w: 3, spec: "emergency" },
  { id: "fainting", label: "Fainting or dizziness", w: 2, spec: "emergency" },
  { id: "poisoning", label: "Possible poisoning", w: 3, spec: "emergency" },
  { id: "pregnancy_emergency", label: "Pregnancy emergency", w: 3, spec: "emergency" },
  { id: "eye_injury", label: "Eye injury", w: 2, spec: "trauma" },
  { id: "confusion", label: "Sudden confusion", w: 2, spec: "neurology" },
  { id: "diarrhea", label: "Severe diarrhea", w: 1, spec: "general" },
];
export const SYMPTOM_LABEL = Object.fromEntries(SYMPTOMS.map((s) => [s.id, s.label]));

export const STATUS_ORDER = ["received", "assigned", "enroute", "arrived"];
export const STATUS_LABEL = {
  received: "Alert received",
  assigned: "Ambulance assigned",
  enroute: "Ambulance on the way",
  arrived: "Ambulance arrived",
  closed: "Case closed",
};

function formatErrorDetail(detail, fallback) {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((item) => item?.msg).filter(Boolean);
    if (messages.length) return messages.join(". ");
  }
  return fallback;
}

async function http(path, opts = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 30000);
  try {
    const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
    const token = sessionStorage.getItem("rapidrelay.dispatcher_token");
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(path, { ...opts, signal: ctl.signal, headers });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(formatErrorDetail(body?.detail, `Request failed (${res.status})`));
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export async function login(username, password) {
  const result = await http("/api/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  sessionStorage.setItem("rapidrelay.dispatcher_token", result.access_token);
  sessionStorage.setItem("rapidrelay.dispatcher_role", result.role || "dispatcher");
  sessionStorage.setItem("rapidrelay.dispatcher_username", result.username || username);
  return result;
}

export async function createDispatcher(username, password) {
  return http("/api/dispatchers", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function getDispatchers() {
  return http("/api/dispatchers");
}

export async function updateDispatcher(username, changes) {
  return http(`/api/dispatchers/${encodeURIComponent(username)}`, { method: "PATCH", body: JSON.stringify(changes) });
}

export function logout() {
  sessionStorage.removeItem("rapidrelay.dispatcher_token");
  sessionStorage.removeItem("rapidrelay.dispatcher_role");
  sessionStorage.removeItem("rapidrelay.dispatcher_username");
}

export function isLoggedIn() {
  return Boolean(sessionStorage.getItem("rapidrelay.dispatcher_token"));
}

export function dispatcherRole() {
  return sessionStorage.getItem("rapidrelay.dispatcher_role") || "dispatcher";
}

export async function sendSOS(p) {
  return http("/api/sos", { method: "POST", body: JSON.stringify(p) });
}

export async function getHealth() {
  return http("/api/health");
}

export async function getNearbyHospitals(lat, lng) {
  return http(`/api/hospitals?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`);
}

export async function getLocationLabel(lat, lng) {
  return http(`/api/location?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`);
}

export async function getIncident(id) {
  return http("/api/incidents/" + encodeURIComponent(id));
}

export async function getIncidentEvents(id) {
  return http(`/api/incidents/${encodeURIComponent(id)}/events`);
}

export async function getIncidents() {
  return http("/api/incidents");
}

export async function setStatus(id, status) {
  return http("/api/incidents/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify({ status }) });
}
