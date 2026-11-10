import { useCallback, useEffect, useRef, useState } from "react";
import Brand from "../components/Brand.jsx";
import HoldButton from "../components/HoldButton.jsx";
import TriageTag from "../components/TriageTag.jsx";
import Timeline from "../components/Timeline.jsx";
import { PatientMap } from "../components/Maps.jsx";
import { SYMPTOMS, STATUS_LABEL, sendSOS, getIncident } from "../lib/api.js";

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const AUTO_SEND_SECONDS = 5;
const AUTO_SEND_RESUME_MS = 10000;

function useLocation() {
  const [pos, setPos] = useState(null);
  const [loc, setLoc] = useState({ kind: "wait", text: "Finding your location…" });

  useEffect(() => {
    if (!navigator.geolocation) {
      setLoc({ kind: "bad", text: "This browser cannot share your location." });
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLoc({ kind: "ok", text: "Location found, accurate to about " + Math.round(p.coords.accuracy) + " m" });
      },
      (err) => {
        setLoc({ kind: "bad", text: err.code === 1 ? "Location is blocked. Allow it in your browser settings." : "Cannot find your location yet." });
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  return { pos, loc };
}

export default function Sos() {
  const [screen, setScreen] = useState("home"); 
  const { pos, loc } = useLocation();
  const [selected, setSelected] = useState([]);
  const [form, setForm] = useState({ age: "", name: "", phone: "" });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [incident, setIncident] = useState(null);
  const [autoSendIn, setAutoSendIn] = useState(null);
  const [autoSendPaused, setAutoSendPaused] = useState(false);
  const [voice, setVoice] = useState({ supported: true, listening: false, text: "", error: "" });
  const headingRef = useRef(null);
  const recognitionRef = useRef(null);
  const autoSendAttemptedRef = useRef(false);
  const autoSendResumeRef = useRef(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    headingRef.current?.focus({ preventScroll: true });
  }, [screen]);

  useEffect(() => () => recognitionRef.current?.stop(), []);
  useEffect(() => () => clearTimeout(autoSendResumeRef.current), []);

  useEffect(() => {
    if (screen !== "details" || incident || sending || autoSendAttemptedRef.current) {
      setAutoSendIn(null);
      return;
    }

    if (autoSendIn === null) setAutoSendIn(AUTO_SEND_SECONDS);
    const countdown = setInterval(() => {
      if (autoSendPaused) return;
      setAutoSendIn((seconds) => {
        if (seconds === null || seconds <= 1) {
          clearInterval(countdown);
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
    return () => clearInterval(countdown);
  }, [screen, incident, sending, autoSendPaused]);

  useEffect(() => {
    if (screen !== "details" || autoSendIn !== 0 || sending || incident) return;
    send(true);
  }, [screen, autoSendIn, sending, incident]);


  useEffect(() => {
    if (screen !== "result" || !incident) return;
    if (incident.status === "arrived" || incident.status === "closed") return;
    const t = setInterval(async () => {
      try {
        const fresh = await getIncident(incident.id);
        setIncident((cur) => (cur ? { ...cur, status: fresh.status } : cur));
      } catch { /* keep showing the last status */ }
    }, 4000);
    return () => clearInterval(t);
  }, [screen, incident]);

  const onHold = useCallback(() => {
    autoSendAttemptedRef.current = false;
    setAutoSendPaused(false);
    setScreen("details");
  }, []);

  const pauseAutoSend = useCallback(() => {
    if (screen !== "details" || autoSendAttemptedRef.current) return;
    setAutoSendPaused(true);
    clearTimeout(autoSendResumeRef.current);
    autoSendResumeRef.current = setTimeout(() => {
      setAutoSendPaused(false);
      autoSendResumeRef.current = null;
    }, AUTO_SEND_RESUME_MS);
  }, [screen]);

  const toggle = (id) => {
    pauseAutoSend();
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  function toggleVoice() {
    if (voice.listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoice((v) => ({ ...v, supported: false, error: "Voice input is not supported in this browser." }));
      return;
    }
    const recognition = new Recognition();
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onstart = () => {
      pauseAutoSend();
      setVoice((v) => ({ ...v, listening: true, error: "" }));
    };
    recognition.onresult = (event) => {
      const text = Array.from(event.results).map((result) => result[0].transcript).join(" ");
      const spoken = text.toLowerCase();
      const matches = SYMPTOMS.filter((symptom) =>
        [symptom.label, symptom.id.replaceAll("_", " ")].some((term) => spoken.includes(term.toLowerCase()))
      ).map((symptom) => symptom.id);
      setSelected((current) => [...new Set([...current, ...matches])]);
      pauseAutoSend();
      setVoice((v) => ({ ...v, text, error: matches.length ? "" : "I heard you, but could not match a symptom. Please choose one below." }));
    };
    recognition.onerror = (event) => {
      setVoice((v) => ({ ...v, listening: false, error: event.error === "not-allowed" ? "Microphone access was blocked. Allow it in your browser settings." : "Could not hear that. Please try again or choose a symptom below." }));
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setVoice((v) => ({ ...v, listening: false }));
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  async function send(automatic = false) {
    if (sending || incident) return;
    if (!pos) {
      setAutoSendIn(null);
      setError(automatic ? "Automatic SOS needs your location. Call 112 now." : "Waiting for your location before we can send.");
      return;
    }
    if (automatic) autoSendAttemptedRef.current = true;
    setSending(true);
    setAutoSendIn(null);
    setError("");
    try {
      const inc = await sendSOS({
        name: form.name.trim(),
        phone: form.phone.trim(),
        age: Number(form.age) || null,
        symptoms: selected,
        lat: pos.lat,
        lng: pos.lng,
      });
      setIncident(inc);
      setScreen("result");
    } catch (error) {
      const detail = error?.name === "AbortError"
        ? "The emergency server did not respond in time. Check the backend and try again."
        : error?.message === "Failed to fetch"
          ? "The emergency server is offline. Start the backend, then try again."
        : error?.message || "The emergency server rejected the alert.";
      setError(automatic
        ? `Automatic SOS failed: ${detail} Call 112 now.`
        : `${detail} Try again or call 112.`);
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setSelected([]);
    setForm({ age: "", name: "", phone: "" });
    setIncident(null);
    autoSendAttemptedRef.current = false;
    clearTimeout(autoSendResumeRef.current);
    autoSendResumeRef.current = null;
    setAutoSendPaused(false);
    setAutoSendIn(null);
    setVoice({ supported: true, listening: false, text: "", error: "" });
    setScreen("home");
  }

  return (
    <main className="app">
      <header className="topbar">
        <Brand />
      </header>

      {screen === "home" && (
        <section className="screen">
          <h1 tabIndex={-1} ref={headingRef}>Need an ambulance?</h1>
          <p className="lede">Press and hold the button for 2 seconds. We share your location and find the nearest suitable hospital.</p>
          <div className={"loc " + loc.kind}><i /><span>{loc.text}</span></div>
          <div className="hold-wrap"><HoldButton onComplete={onHold} /></div>
          <p className="hint">Holding stops accidental alerts. Let go early to cancel.</p>
          <div className="callrow">Prefer to talk? <a href="tel:112">Call 112</a></div>
        </section>
      )}

      {screen === "details" && (
        <section className="screen">
          <h2 tabIndex={-1} ref={headingRef}>What is happening?</h2>
          <p className="lede">Choose anything that applies. This helps us pick the right hospital. You can send without it.</p>
          <div className="voice-box">
            <div className="voice-copy">
              <div className="legend">In a hurry?</div>
              <p>Say what is happening and we’ll select matching symptoms.</p>
            </div>
            <button type="button" className={"voice-btn" + (voice.listening ? " listening" : "")} onClick={() => { pauseAutoSend(); toggleVoice(); }} aria-pressed={voice.listening}>
              <span aria-hidden="true">{voice.listening ? "■" : "●"}</span>
              {voice.listening ? "Stop listening" : "Speak symptoms"}
            </button>
            {voice.text && <p className="voice-text">“{voice.text}”</p>}
            {voice.error && <p className="voice-note">{voice.error}</p>}
          </div>
          <div>
            <div className="legend" id="sym-legend">Symptoms</div>
            <div className="chips" role="group" aria-labelledby="sym-legend">
              {SYMPTOMS.map((s) => (
                <button key={s.id} type="button" className="chip" aria-pressed={selected.includes(s.id)} onClick={() => toggle(s.id)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor="age">Age</label>
              <input id="age" type="number" inputMode="numeric" min="0" max="120" placeholder="30" value={form.age} onFocus={pauseAutoSend} onChange={(e) => { pauseAutoSend(); setForm({ ...form, age: e.target.value }); }} />
            </div>
            <div className="field">
              <label htmlFor="name">Patient name</label>
              <input id="name" autoComplete="name" placeholder="Optional" value={form.name} onFocus={pauseAutoSend} onChange={(e) => { pauseAutoSend(); setForm({ ...form, name: e.target.value }); }} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="phone">Phone number</label>
            <input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="So the ambulance can call you" value={form.phone} onFocus={pauseAutoSend} onChange={(e) => { pauseAutoSend(); setForm({ ...form, phone: e.target.value }); }} />
          </div>
          <p className="note">{error || (pos ? "" : "Waiting for your location before we can send.")}</p>
          {autoSendIn !== null && (
            <p className="note" role="status" aria-live="polite">
              {autoSendPaused
                ? "Automatic SOS paused while you provide information. The countdown resumes after 10 seconds of inactivity."
                : `SOS will be sent automatically in ${autoSendIn} seconds if you cannot submit these details.`}
            </p>
          )}
          <div className="stack">
            <button className="btn" disabled={!pos || sending} onClick={send}>{sending ? "Sending…" : "Send alert"}</button>
            <button className="btn ghost" onClick={reset}>Cancel automatic SOS</button>
            <a className="btn dark" href="tel:112" style={{ textAlign: "center", lineHeight: "56px", textDecoration: "none" }}>Call 112 now</a>
          </div>
        </section>
      )}

      {screen === "result" && incident && (
        <section className="screen">
          <h2 tabIndex={-1} ref={headingRef}>
            {incident.status === "arrived" ? "Ambulance has arrived" : incident.status === "closed" ? "Case closed" : "Help is on the way"}
          </h2>

          <TriageTag severity={incident.severity}>
            <p className="eta">Ambulance about {incident.hospital.eta_min} min away</p>
            <dl className="kv">
              <dt>Hospital</dt><dd>{incident.hospital.name}</dd>
              <dt>Distance</dt><dd>{incident.hospital.distance_km} km from you</dd>
              <dt>Can treat</dt>
              <dd>{cap(incident.specialty)}{incident.hospital.specialty_match ? "" : " (not at this hospital)"}</dd>
              <dt>Case ID</dt><dd>{incident.id}</dd>
            </dl>
          </TriageTag>

          <PatientMap me={[incident.lat, incident.lng]} hospital={incident.hospital} />

          <div>
            <h3>Status</h3>
            <div style={{ marginTop: 12 }}><Timeline status={incident.status} /></div>
            <span className="sr-only" aria-live="polite">{STATUS_LABEL[incident.status]}</span>
          </div>

          {(incident.alternatives || []).length > 0 && (
            <div>
              <h3>Other nearby options</h3>
              {incident.alternatives.slice(0, 2).map((a) => (
                <div key={a.id} className="alt" style={{ marginTop: 10 }}>
                  <b>{a.name}</b>{a.distance_km} km, about {a.eta_min} min
                </div>
              ))}
            </div>
          )}

          <p className="note">This service supports emergency coordination and is not a medical diagnosis. If life is at risk, call 112.</p>
          <div className="stack">
            <a className="btn dark" href="tel:112" style={{ textAlign: "center", lineHeight: "56px", textDecoration: "none" }}>Call 112</a>
            <button className="btn ghost" onClick={reset}>Back to start</button>
          </div>
        </section>
      )}
      <div className="emergency-bar" aria-label="Emergency actions">
        <span>Need immediate help?</span>
        <a href="tel:112">Call 112</a>
      </div>
    </main>
  );
}
