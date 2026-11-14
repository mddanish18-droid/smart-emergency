import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import Brand from "../components/Brand.jsx";
import { getHealth, getNearbyHospitals, getLocationLabel } from "../lib/api.js";
import { MapContainer, TileLayer, CircleMarker } from "react-leaflet";

// Anchor links would clash with the hash router, so sections are reached by scrolling.
const goTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

const STEPS = [
  { t: "Hold SOS", d: "A 2-second hold sends your location and stops accidental alerts." },
  { t: "Get a priority", d: "A model reads the symptoms and age, then marks the case critical, medium or low." },
  { t: "Match a hospital", d: "Hospitals are ranked by distance, the specialty needed and free beds." },
  { t: "Follow the ambulance", d: "The status updates as dispatch assigns an ambulance and sends it." },
];
const BENEFITS = [
  ["01", "One clear action", "A large SOS control helps people act quickly under stress."],
  ["02", "Location-aware matching", "Nearby hospitals are ranked from the patient's current location."],
  ["03", "Shared visibility", "Patients and dispatchers can follow the same incident status."],
];
const ROLES = [
  ["For patients", "One large SOS action, location sharing, and clear updates without creating an account.", "Open patient app", "/sos"],
  ["For dispatchers", "A live control room to prioritize alerts, coordinate ambulances, and record every update.", "Open control room", "/dispatch"],
  ["For hospitals", "A clearer handoff with symptoms, urgency, location, and the care specialty needed.", "See the workflow", "#how"],
];
const STATS = [
  ["24/7", "incident visibility"],
  ["50 km", "hospital search radius"],
  ["2 sec", "SOS hold to prevent mistakes"],
];
const FAQS = [
  ["Do I need an account?", "No. A patient can start an SOS without creating an account."],
  ["Can I cancel an alert?", "Yes. Release the SOS button early or cancel before submitting the details."],
  ["What if location is unavailable?", "Allow location access and try again. For immediate danger, call 112."],
];
const USE_CASES = [
  ["Cardiac symptoms", "Chest pain or breathing difficulty can be shared with dispatchers quickly."],
  ["Road accidents", "Location sharing helps responders understand where help is needed."],
  ["Elderly support", "A simple hold action reduces the need to complete a form first."],
];
const DEFAULT_MAP_CENTER = [20.5937, 78.9629];
const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || "support@rapidrelay.example";

function PreviewMap({ position }) {
  const center = position || DEFAULT_MAP_CENTER;
  return (
    <MapContainer key={center.join(",")} className="landing-map" center={center} zoom={position ? 13 : 5} scrollWheelZoom={false}>
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
      {position && <CircleMarker center={position} radius={10} pathOptions={{ color: "#fff", weight: 3, fillColor: "#c2414b", fillOpacity: 1 }} />}
    </MapContainer>
  );
}
const COPY = {
  en: {
    title: "Tell us what is wrong. We find the nearest hospital that can treat it.",
    subtitle: "RapidRelay turns one press into a location, a priority level and a hospital match. It then keeps the patient and the dispatcher updated until the ambulance arrives.",
    patient: "Open patient app",
    dispatcher: "Open dispatcher view",
    how: "How an alert travels",
    contact: "We are here to help.",
  },
  hi: {
    title: "हमें बताएं क्या हुआ है। हम इलाज कर सकने वाले सबसे नज़दीकी अस्पताल को खोजते हैं।",
    subtitle: "RapidRelay एक प्रेस से आपका स्थान, प्राथमिकता और अस्पताल का मिलान करता है।",
    patient: "मरीज़ ऐप खोलें",
    dispatcher: "डिस्पैचर व्यू खोलें",
    how: "अलर्ट कैसे आगे बढ़ता है",
    contact: "हम आपकी सहायता के लिए यहाँ हैं।",
  },
  mr: {
    title: "काय झाले ते सांगा. आम्ही उपचार करू शकणारे जवळचे रुग्णालय शोधतो.",
    subtitle: "RapidRelay एका क्लिकमध्ये तुमचे स्थान, प्राधान्य आणि रुग्णालय जुळवते.",
    patient: "रुग्ण ॲप उघडा",
    dispatcher: "डिस्पॅचर दृश्य उघडा",
    how: "अलर्टचा प्रवास",
    contact: "आम्ही मदतीसाठी येथे आहोत.",
  },
  bn: {
    title: "আপনার কী সমস্যা হয়েছে বলুন। আমরা চিকিৎসা করতে পারে এমন নিকটতম হাসপাতাল খুঁজে দিই।",
    subtitle: "RapidRelay এক প্রেসে আপনার অবস্থান, অগ্রাধিকার এবং উপযুক্ত হাসপাতাল খুঁজে দেয়। অ্যাম্বুলেন্স পৌঁছানো পর্যন্ত রোগী ও ডিসপ্যাচার আপডেট পান।",
    patient: "রোগীর অ্যাপ খুলুন",
    dispatcher: "ডিসপ্যাচার ভিউ খুলুন",
    how: "একটি অ্যালার্টের পথ",
    contact: "আমরা সাহায্যের জন্য এখানে আছি।",
  },
  gu: {
    title: "શું થયું છે તે જણાવો. અમે સારવાર કરી શકે તેવી નજીકની હોસ્પિટલ શોધીએ છીએ.",
    subtitle: "RapidRelay એક ક્લિકમાં તમારું સ્થાન, પ્રાથમિકતા અને યોગ્ય હોસ્પિટલ શોધે છે. એમ્બ્યુલન્સ આવે ત્યાં સુધી દર્દી અને ડિસ્પેચરને અપડેટ મળે છે.",
    patient: "દર્દી એપ ખોલો",
    dispatcher: "ડિસ્પેચર વ્યૂ ખોલો",
    how: "ચેતવણીની સફર",
    contact: "અમે મદદ માટે અહીં છીએ.",
  },
  ta: {
    title: "என்ன பிரச்சினை என்பதைச் சொல்லுங்கள். சிகிச்சை அளிக்கக்கூடிய அருகிலுள்ள மருத்துவமனையை நாங்கள் கண்டறிவோம்.",
    subtitle: "RapidRelay ஒரே அழுத்தத்தில் உங்கள் இருப்பிடம், முன்னுரிமை மற்றும் பொருத்தமான மருத்துவமனையைத் தேடுகிறது.",
    patient: "நோயாளர் செயலியைத் திறக்கவும்",
    dispatcher: "அனுப்புநர் பார்வையைத் திறக்கவும்",
    how: "அலர்ட் செல்லும் பாதை",
    contact: "உதவுவதற்காக நாங்கள் இங்கே இருக்கிறோம்.",
  },
  te: {
    title: "ఏమి జరిగిందో చెప్పండి. చికిత్స చేయగల సమీప ఆసుపత్రిని మేము కనుగొంటాము.",
    subtitle: "RapidRelay ఒక్కసారి నొక్కితే మీ స్థానం, ప్రాధాన్యత మరియు సరైన ఆసుపత్రిని కనుగొంటుంది.",
    patient: "రోగి యాప్ తెరవండి",
    dispatcher: "డిస్పాచర్ వీక్షణ తెరవండి",
    how: "అలర్ట్ ప్రయాణం",
    contact: "మీకు సహాయం చేయడానికి మేము ఇక్కడ ఉన్నాము.",
  },
  kn: {
    title: "ಏನಾಯಿತು ಎಂದು ನಮಗೆ ತಿಳಿಸಿ. ಚಿಕಿತ್ಸೆ ನೀಡಬಲ್ಲ ಹತ್ತಿರದ ಆಸ್ಪತ್ರೆಯನ್ನು ನಾವು ಹುಡುಕುತ್ತೇವೆ.",
    subtitle: "RapidRelay ಒಂದೇ ಒತ್ತುವಿಕೆಯಲ್ಲಿ ನಿಮ್ಮ ಸ್ಥಳ, ಆದ್ಯತೆ ಮತ್ತು ಸೂಕ್ತ ಆಸ್ಪತ್ರೆಯನ್ನು ಕಂಡುಹಿಡಿಯುತ್ತದೆ.",
    patient: "ರೋಗಿ ಆ್ಯಪ್ ತೆರೆಯಿರಿ",
    dispatcher: "ಡಿಸ್ಪ್ಯಾಚರ್ ವೀಕ್ಷಣೆ ತೆರೆಯಿರಿ",
    how: "ಎಚ್ಚರಿಕೆಯ ಪ್ರಯಾಣ",
    contact: "ಸಹಾಯ ಮಾಡಲು ನಾವು ಇಲ್ಲಿದ್ದೇವೆ.",
  },
  ur: {
    title: "بتائیں کیا مسئلہ ہے۔ ہم ایسا قریبی اسپتال تلاش کریں گے جہاں اس کا علاج ہو سکے۔",
    subtitle: "RapidRelay ایک کلک سے آپ کی جگہ، ترجیح اور مناسب اسپتال تلاش کرتا ہے۔ ایمبولینس پہنچنے تک مریض اور ڈسپیچر کو تازہ معلومات ملتی رہتی ہیں۔",
    patient: "مریض ایپ کھولیں",
    dispatcher: "ڈسپیچر ویو کھولیں",
    how: "الرٹ کا سفر",
    contact: "ہم مدد کے لیے یہاں موجود ہیں۔",
  },
};

export default function Landing() {
  const [dark, setDark] = useState(() => localStorage.getItem("rapidrelay.theme") === "dark");
  const [language, setLanguage] = useState("en");
  const [menuOpen, setMenuOpen] = useState(false);
  const [serviceStatus, setServiceStatus] = useState("checking");
  const [locationStatus, setLocationStatus] = useState("not-checked");
  const [previewPosition, setPreviewPosition] = useState(null);
  const [nearbyHospitals, setNearbyHospitals] = useState([]);
  const [directoryStatus, setDirectoryStatus] = useState("not-checked");
  const [cityLabel, setCityLabel] = useState("");
  const [demoStep, setDemoStep] = useState(0);
  const text = COPY[language];
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ur" ? "rtl" : "ltr";
  }, [language]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("rapidrelay.theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    getHealth().then(() => setServiceStatus("online")).catch(() => setServiceStatus("offline"));
  }, []);
  function checkLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("unavailable");
      return;
    }
    if (!window.isSecureContext && !["localhost", "127.0.0.1"].includes(window.location.hostname)) {
      setLocationStatus("insecure");
      return;
    }
    setLocationStatus("checking");
    let settled = false;
    const fallbackTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        setLocationStatus("unavailable");
      }
    }, 15000);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (settled) return;
        settled = true;
        clearTimeout(fallbackTimer);
        setPreviewPosition([position.coords.latitude, position.coords.longitude]);
        setLocationStatus("ready");
        setDirectoryStatus("checking");
        getLocationLabel(position.coords.latitude, position.coords.longitude)
          .then(({ city }) => setCityLabel(city))
          .catch(() => setCityLabel(""));
        getNearbyHospitals(position.coords.latitude, position.coords.longitude)
          .then((hospitals) => {
            setNearbyHospitals(hospitals);
            setDirectoryStatus(hospitals.length ? "ready" : "unavailable");
          })
          .catch(() => setDirectoryStatus("unavailable"));
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(fallbackTimer);
        setLocationStatus("unavailable");
      },
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 30000 }
    );
  }
  function advanceDemo() {
    setDemoStep((step) => (step + 1) % 4);
  }
  return (
    <>
      <div className="site">
        <nav className="site-nav" aria-label="Main">
          <Brand />
          <div className="nav-links">
            <button className="navlink" onClick={() => goTo("how")}>Alert flow</button>
            <button className="navlink" onClick={() => goTo("roles")}>Roles</button>
            <button className="navlink" onClick={() => goTo("benefits")}>Benefits</button>
            <button className="navlink" onClick={() => goTo("location")}>Location</button>
            <button className="navlink" onClick={() => goTo("safety")}>Safety</button>
            <label className="language-select">
              <span className="sr-only">Language</span>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Language">
                <option value="en">English</option>
                <option value="hi">हिन्दी</option>
                <option value="mr">मराठी</option>
                <option value="bn">বাংলা</option>
                <option value="gu">ગુજરાતી</option>
                <option value="ta">தமிழ்</option>
                <option value="te">తెలుగు</option>
                <option value="kn">ಕನ್ನಡ</option>
                <option value="ur">اردو</option>
              </select>
            </label>
            <button className={"theme-switch " + (dark ? "is-dark" : "")} onClick={() => setDark((value) => !value)} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} aria-pressed={dark}>
              <span className="theme-switch-track"><span className="theme-switch-knob">{dark ? "☾" : "☀"}</span></span>
              <span className="theme-switch-label">{dark ? "Dark" : "Light"}</span>
            </button>
            <button className="menu-toggle" type="button" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen} aria-controls="mobile-navigation" aria-label="Toggle navigation">☰</button>
            <Link className="btn inline small" to="/sos">{text.patient}</Link>
          </div>
          {menuOpen && <div className="mobile-menu" id="mobile-navigation">
            <button className="navlink" onClick={() => { goTo("how"); setMenuOpen(false); }}>Alert flow</button>
            <button className="navlink" onClick={() => { goTo("roles"); setMenuOpen(false); }}>Roles</button>
            <button className="navlink" onClick={() => { goTo("benefits"); setMenuOpen(false); }}>Benefits</button>
            <button className="navlink" onClick={() => { goTo("location"); setMenuOpen(false); }}>Location</button>
            <button className="navlink" onClick={() => { goTo("safety"); setMenuOpen(false); }}>Safety</button>
            <label className="mobile-language-select">
              <span>Language</span>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Language">
                <option value="en">English</option>
                <option value="hi">हिन्दी</option>
                <option value="mr">मराठी</option>
                <option value="bn">বাংলা</option>
                <option value="gu">ગુજરાતી</option>
                <option value="ta">தமிழ்</option>
                <option value="te">తెలుగు</option>
                <option value="kn">ಕನ್ನಡ</option>
                <option value="ur">اردو</option>
              </select>
            </label>
          </div>}
        </nav>

        <header className="hero">
          <div>
            <h1 className="hero-title">{text.title}</h1>
            <p className="hero-sub">{text.subtitle}</p>
            <div className="hero-cta">
              <Link className="btn inline" to="/sos">{text.patient}</Link>
              <Link className="btn inline ghost" to="/dispatch">{text.dispatcher}</Link>
            </div>
            <p className="hero-trust"><span>✓</span> No account required · Your location is requested only when you choose SOS</p>
            <p className="emergency-cta"><strong>Need help now?</strong> <a href="tel:112">Call 112</a> for immediate medical emergencies.</p>
            <div className="hero-statuses">
              <span className={"service-dot " + serviceStatus} /> {serviceStatus === "online" ? "Response service online" : serviceStatus === "offline" ? "Service unavailable" : "Checking service status…"}
            </div>
          </div>
          <div className="hero-visual" aria-label="RapidRelay emergency response">
            <img className="hero-main-image" src="/hero-response.svg" alt="Ambulance travelling toward a hospital" />
            <img className="hero-care-image" src="/hero-care.svg" alt="Emergency responder coordinating care" />
            <img className="hero-network-image" src="/hero-network.svg" alt="Connected emergency locations on a map" />
            <div className="hero-image-label"><span className="service-dot online" /> Coordinated help, in real time</div>
          </div>
        </header>
      </div>

      <section className="site proof-strip" aria-label="RapidRelay capabilities">
        {STATS.map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}
      </section>

      <section id="how" className="band">
        <div className="site">
          <h2 className="section-title">{text.how}</h2>
          <ol className="steps">
            {STEPS.map((s) => (
              <li key={s.t}>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="site demo-section" aria-labelledby="demo-title">
        <div className="demo-copy">
          <span className="eyebrow">How RapidRelay works</span>
          <h2 id="demo-title">One connected workflow from SOS to response.</h2>
          <p>Patients, dispatchers, and hospitals stay aligned as an alert moves from location sharing to coordinated care.</p>
          <button className="btn inline" onClick={advanceDemo}>{demoStep === 3 ? "Start again" : "Next step"} <span aria-hidden="true">→</span></button>
          <Link className="demo-link" to="/sos">Open the patient app</Link>
        </div>
        <div className="demo-card">
          <div className="demo-card-top"><span>RapidRelay response flow</span><span className="demo-live"><i /> LIVE FLOW</span></div>
          <div className="demo-progress">{[0, 1, 2, 3].map((step) => <span className={step <= demoStep ? "active" : ""} key={step} />)}</div>
          <div className="demo-icon" aria-hidden="true">{["＋", "⌖", "✦", "✓"][demoStep]}</div>
          <p className="eyebrow">Step {demoStep + 1} of 4</p>
          <h3>{["Hold SOS", "Share location", "Find suitable care", "Follow the response"][demoStep]}</h3>
          <p>{[
            "Hold the button for two seconds to prevent accidental alerts.",
            "Your location helps responders understand where help is needed.",
            "Nearby hospitals are ranked by distance and the specialty required.",
            "The patient and dispatcher see the same status as help moves.",
          ][demoStep]}</p>
        </div>
      </section>

      <section id="roles" className="site roles">
        {ROLES.map(([title, description, action, href], index) => (
          <article className={"role-card " + (index === 1 ? "featured" : "")} key={title}>
            <span className="role-number">0{index + 1}</span>
            <h2>{title}</h2>
            <p>{description}</p>
            {href.startsWith("#")
              ? <button className="btn inline" onClick={() => goTo(href.slice(1))}>{action} <span aria-hidden="true">→</span></button>
              : <Link className="btn inline" to={href}>{action} <span aria-hidden="true">→</span></Link>}
          </article>
        ))}
      </section>

      <section id="benefits" className="band benefits">
        <div className="site">
          <h2 className="section-title">Designed for the moments that matter</h2>
          <div className="benefit-grid">
            {BENEFITS.map(([number, title, description]) => (
              <article className="benefit-card" key={number}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="location" className="site location-preview">
        <div>
          <span className="eyebrow">Location preview</span>
          <h2>See how location helps coordinate care.</h2>
          <p>Your location is checked only after you choose to allow it. It is not sent from this preview.</p>
          <button className="btn inline" onClick={checkLocation}>Check my location</button>
          <p className="location-result" role="status">
            {locationStatus === "ready" ? "Location available for an SOS." : locationStatus === "checking" ? "Checking location permission…" : locationStatus === "insecure" ? "Location sharing requires a secure HTTPS connection." : locationStatus === "unavailable" ? "Location is unavailable. Allow access and try again, or call 112." : "Location has not been checked."}
          </p>
          {cityLabel && <p className="location-city">Showing hospitals near {cityLabel}</p>}
          {directoryStatus === "ready" && <div className="nearby-list">{nearbyHospitals.slice(0, 3).map((hospital) => <div key={hospital.id}><strong>{hospital.name}</strong><span>{hospital.distance_km} km · about {hospital.eta_min} min</span></div>)}</div>}
          {directoryStatus === "unavailable" && <p className="location-result">Live hospital directory is unavailable. No hospital has been assigned.</p>}
        </div>
        <div className="map-preview" aria-label="Nearby location map">
          <PreviewMap position={previewPosition} />
        </div>
      </section>

      <section className="site use-cases">
        <h2 className="section-title">When every second matters</h2>
        <div className="use-case-grid">{USE_CASES.map(([title, description]) => <article key={title}><span className="case-icon">✦</span><h3>{title}</h3><p>{description}</p></article>)}</div>
      </section>

      <section className="site trust-faq">
        <div id="safety" className="trust-panel">
          <span className="eyebrow">Built with care</span>
          <h2>Safety comes first</h2>
          <p>Location is requested only to coordinate help. Access to dispatcher information is protected, and incident changes are recorded for accountability.</p>
          <ul className="trust-list">
            <li>Call 112 directly if life is at risk.</li>
            <li>This service coordinates emergency response and does not replace medical diagnosis.</li>
            <li>Only the information needed to coordinate help is shared.</li>
          </ul>
          <Link className="btn inline" to="/sos">Start an SOS</Link>
        </div>
        <div className="faq">
          <h2>Questions, answered</h2>
          {FAQS.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="band contact">
        <div className="site contact-inner">
          <div>
            <span className="eyebrow">Need assistance?</span>
            <h2>{text.contact}</h2>
            <p>For access, partnership, or service questions, contact the response team.</p>
          </div>
          <a className="btn inline light" href={`mailto:${SUPPORT_EMAIL}`}>Contact support</a>
        </div>
      </section>

      <footer className="site foot">
        <Brand />
        <span className="watermark" tabIndex="0" aria-label="Dikshu">Dikshu❤️</span>
      </footer>
    </>
  );
}
