import json
import hashlib
import math
import os
import secrets
import sqlite3
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from collections import defaultdict, deque

import jwt
from fastapi import Depends, FastAPI, Header, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv
import certifi

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")
DB_PATH = ROOT / os.getenv("RAPIDRELAY_DB", "rapidrelay.sqlite3")
JWT_SECRET = os.getenv("RAPIDRELAY_JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("RAPIDRELAY_JWT_SECRET must be set")

app = FastAPI(title="RapidRelay API")

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "RAPIDRELAY_ALLOWED_ORIGINS",
        "http://localhost:5173"
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/")
def home():
    return {
        "app": "RapidRelay",
        "status": "running",
        "message": "RapidRelay API is online"
    }
OVERPASS_URLS = [
    url.strip()
    for url in os.getenv(
        "RAPIDRELAY_OVERPASS_URLS",
        "https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter",
    ).split(",")
    if url.strip()
]
NOMINATIM_URL = os.getenv("RAPIDRELAY_NOMINATIM_URL", "https://nominatim.openstreetmap.org/search")
TLS_CONTEXT = ssl.create_default_context(cafile=certifi.where())
HOSPITAL_CACHE = {}
RATE_LIMIT = defaultdict(deque)
RATE_WINDOW_SECONDS = 60
RATE_MAX_REQUESTS = 10


class IncidentIn(BaseModel):
    name: str = ""
    phone: str = ""
    age: int | None = Field(default=None, ge=0, le=120)
    symptoms: list[str] = Field(default_factory=list, max_length=20)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    emergency_contact: str = ""


class StatusIn(BaseModel):
    status: str


class LoginIn(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=128)


class DispatcherIn(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")
    password: str = Field(min_length=8, max_length=128)


class DispatcherUpdate(BaseModel):
    active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)


class ProfileIn(BaseModel):
    name: str = ""
    age: int | None = Field(default=None, ge=0, le=120)
    blood_group: str = ""
    allergies: str = ""
    medications: str = ""
    conditions: str = ""
    emergency_contact: str = ""


def db():
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def rate_limit(client_key):
    now = time.time()
    requests = RATE_LIMIT[client_key]
    while requests and now - requests[0] > RATE_WINDOW_SECONDS:
        requests.popleft()
    if len(requests) >= RATE_MAX_REQUESTS:
        raise HTTPException(status_code=429, detail="Too many requests. Please try again shortly.")
    requests.append(now)


def init_db():
    with db() as connection:
        connection.executescript(
            """
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS incidents (
                id TEXT PRIMARY KEY, created INTEGER NOT NULL, status TEXT NOT NULL,
                name TEXT NOT NULL, phone TEXT NOT NULL, age INTEGER, symptoms TEXT NOT NULL,
                lat REAL NOT NULL, lng REAL NOT NULL, emergency_contact TEXT NOT NULL,
                severity TEXT NOT NULL, confidence REAL NOT NULL, specialty TEXT NOT NULL,
                hospital TEXT NOT NULL, ambulance_lat REAL, ambulance_lng REAL
            );
            CREATE TABLE IF NOT EXISTS profiles (
                id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS dispatchers (
                username TEXT PRIMARY KEY,
                password_hash TEXT NOT NULL,
                created INTEGER NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                role TEXT NOT NULL DEFAULT 'dispatcher'
            );
            CREATE TABLE IF NOT EXISTS incident_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                incident_id TEXT NOT NULL,
                event TEXT NOT NULL,
                actor TEXT NOT NULL,
                created INTEGER NOT NULL,
                FOREIGN KEY (incident_id) REFERENCES incidents(id)
            );
            CREATE INDEX IF NOT EXISTS idx_incidents_status_created
                ON incidents (status, created DESC);
            CREATE INDEX IF NOT EXISTS idx_incidents_created
                ON incidents (created DESC);
            """
        )
        columns = {row["name"] for row in connection.execute("PRAGMA table_info(dispatchers)")}
        if "active" not in columns:
            connection.execute("ALTER TABLE dispatchers ADD COLUMN active INTEGER NOT NULL DEFAULT 1")
        if "role" not in columns:
            connection.execute("ALTER TABLE dispatchers ADD COLUMN role TEXT NOT NULL DEFAULT 'dispatcher'")


@app.on_event("startup")
def startup():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    init_db()


@app.get("/api/health")
def health():
    with db() as connection:
        connection.execute("SELECT 1").fetchone()
    return {"status": "ok", "database": "sqlite"}


@app.get("/api/hospitals")
def hospitals(lat: float = Query(ge=-90, le=90), lng: float = Query(ge=-180, le=180)):
    nearby = nearby_hospitals(lat, lng)
    ranked = sorted(nearby, key=lambda hospital: distance(lat, lng, hospital["lat"], hospital["lng"]))
    return [
        {
            **hospital,
            "distance_km": round(distance(lat, lng, hospital["lat"], hospital["lng"]), 1),
            "eta_min": max(3, round(distance(lat, lng, hospital["lat"], hospital["lng"]) / 35 * 60 + 2)),
        }
        for hospital in ranked[:5]
    ]


@app.get("/api/location")
def location(lat: float = Query(ge=-90, le=90), lng: float = Query(ge=-180, le=180)):
    params = {"format": "jsonv2", "lat": lat, "lon": lng, "zoom": 10, "accept-language": "en"}
    request = urllib.request.Request(
        f"https://nominatim.openstreetmap.org/reverse?{urllib.parse.urlencode(params)}",
        headers={"User-Agent": "RapidRelay emergency response/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=5, context=TLS_CONTEXT) as response:
            address = json.load(response).get("address", {})
        return {"city": address.get("city") or address.get("town") or address.get("village") or address.get("state_district") or ""}
    except (OSError, ValueError, urllib.error.URLError):
        return {"city": ""}


def token_for(username: str, role="dispatcher"):
    return jwt.encode({"sub": username, "role": role, "exp": int(time.time()) + 3600}, JWT_SECRET, algorithm="HS256") # type: ignore


def password_hash(password: str, salt: bytes | None = None):
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310000)
    return f"pbkdf2_sha256$310000${salt.hex()}${digest.hex()}"


def password_matches(password: str, encoded: str):
    try:
        algorithm, rounds, salt_hex, digest_hex = encoded.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(rounds))
        return secrets.compare_digest(candidate.hex(), digest_hex)
    except (TypeError, ValueError):
        return False


def dispatcher(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Dispatcher login required")
    try:
        return jwt.decode(authorization[7:], JWT_SECRET, algorithms=["HS256"]) # type: ignore
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid dispatcher token") from exc


def admin_only(identity: dict = Depends(dispatcher)):
    if identity.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Administrator access required")
    return identity


def distance(a_lat, a_lng, b_lat, b_lng):
    radius, radians = 6371, math.pi / 180
    d_lat, d_lng = (b_lat - a_lat) * radians, (b_lng - a_lng) * radians
    value = math.sin(d_lat / 2) ** 2 + math.cos(a_lat * radians) * math.cos(b_lat * radians) * math.sin(d_lng / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(value))


def triage(symptoms, age):
    urgent = {"unconscious", "severe_bleeding", "chest_pain", "breathing_difficulty", "stroke_signs", "allergic_reaction", "poisoning", "pregnancy_emergency"}
    score = sum(3 if symptom in urgent else 2 if symptom in {"seizure", "burns", "fracture", "abdominal_pain", "fainting", "eye_injury", "confusion"} else 1 for symptom in symptoms)
    if age is not None and (age > 65 or age < 5):
        score += 1
    return ("critical" if score >= 3 else "medium" if score else "low"), 0.8


def hospital_for(lat, lng, specialty="general"):
    nearby = nearby_hospitals(lat, lng)
    if not nearby:
        raise HTTPException(
            status_code=503,
            detail="Nearby hospital directory is temporarily unavailable. Call 112 or try again.",
        )
    ranked = sorted(nearby, key=lambda hospital: distance(lat, lng, hospital["lat"], hospital["lng"]) + (0 if specialty in hospital["specialties"] else 15))
    hospital = ranked[0]
    km = distance(lat, lng, hospital["lat"], hospital["lng"])
    return {**hospital, "distance_km": round(km, 1), "eta_min": max(3, round(km / 35 * 60 + 2)), "specialty_match": specialty in hospital["specialties"]}


def nearby_hospitals(lat, lng):
    cache_key = (round(lat, 2), round(lng, 2))
    cached = HOSPITAL_CACHE.get(cache_key)
    if cached and time.time() - cached[0] < 900:
        return cached[1]

    query = f"""
    [out:json][timeout:8];
    (
      nwr["amenity"="hospital"](around:50000,{lat},{lng});
      nwr["healthcare"="hospital"](around:50000,{lat},{lng});
    );
    out center tags;
    """
    hospitals = []
    hospitals = nearby_hospitals_nominatim(lat, lng)
    if hospitals:
        HOSPITAL_CACHE[cache_key] = (time.time(), hospitals)
        return hospitals

    for endpoint in OVERPASS_URLS:
        try:
            request = urllib.request.Request(
                endpoint,
                data=urllib.parse.urlencode({"data": query}).encode(),
                headers={"User-Agent": "RapidRelay emergency response/1.0"},
            )
            with urllib.request.urlopen(request, timeout=4, context=TLS_CONTEXT) as response:
                elements = json.load(response).get("elements", [])
            for element in elements:
                if not isinstance(element, dict):
                    continue
                tags = element.get("tags", {})
                if not isinstance(tags, dict):
                    continue
                center = element.get("center", element)
                if not isinstance(center, dict):
                    continue
                name = tags.get("name") or tags.get("official_name")
                element_type, element_id = element.get("type"), element.get("id")
                if not name or not element_type or not element_id or "lat" not in center or "lon" not in center:
                    continue
                hospitals.append({
                    "id": f"osm-{element_type}-{element_id}",
                    "name": name,
                    "lat": center["lat"],
                    "lng": center["lon"],
                    "specialties": ["emergency", "general"],
                    "beds": None,
                    "phone": tags.get("phone") or tags.get("contact:phone", ""),
                    "source": "OpenStreetMap",
                })
            if hospitals:
                break
        except (OSError, ValueError, urllib.error.URLError):
            continue

    if not hospitals:
        hospitals = nearby_hospitals_nominatim(lat, lng)

    HOSPITAL_CACHE[cache_key] = (time.time(), hospitals)
    return hospitals


def nearby_hospitals_nominatim(lat, lng):
    viewbox = f"{lng - 0.6},{lat + 0.45},{lng + 0.6},{lat - 0.45}"
    params = {
        "format": "jsonv2",
        "q": "hospital",
        "limit": 50,
        "bounded": 1,
        "viewbox": viewbox,
        "accept-language": "en",
    }
    try:
        request = urllib.request.Request(
            f"{NOMINATIM_URL}?{urllib.parse.urlencode(params)}",
            headers={"User-Agent": "RapidRelay emergency response/1.0"},
        )
        with urllib.request.urlopen(request, timeout=8, context=TLS_CONTEXT) as response:
            results = json.load(response)
    except (OSError, ValueError, urllib.error.URLError):
        return []

    if not isinstance(results, list):
        return []

    hospitals = []
    for result in results:
        if not isinstance(result, dict):
            continue
        if result.get("type") != "hospital" and result.get("category") != "amenity":
            continue
        try:
            hospital_lat, hospital_lng = float(result["lat"]), float(result["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        if distance(lat, lng, hospital_lat, hospital_lng) > 50:
            continue
        osm_type, osm_id = result.get("osm_type"), result.get("osm_id")
        display_name = result.get("display_name")
        if not osm_type or not osm_id or not isinstance(display_name, str) or not display_name.strip():
            continue
        hospitals.append({
            "id": f"osm-{osm_type}-{osm_id}",
            "name": display_name.split(",")[0],
            "lat": hospital_lat,
            "lng": hospital_lng,
            "specialties": ["emergency", "general"],
            "beds": None,
            "phone": "",
            "source": "OpenStreetMap",
        })
    return hospitals


def output(row):
    value = dict(row)
    value["symptoms"] = json.loads(value.pop("symptoms"))
    value["hospital"] = json.loads(value.pop("hospital"))
    return value


@app.post("/api/login")
def login(payload: LoginIn):
    expected_user = os.getenv("RAPIDRELAY_DISPATCHER_USER", "dispatcher")
    expected_password = os.getenv("RAPIDRELAY_DISPATCHER_PASSWORD")
    valid = bool(expected_password and payload.username == expected_user and secrets.compare_digest(payload.password, expected_password))
    if not valid:
        with db() as connection:
            row = connection.execute("SELECT password_hash, active, role FROM dispatchers WHERE username = ?", (payload.username,)).fetchone()
        valid = bool(row and row["active"] and password_matches(payload.password, row["password_hash"]))
    if not valid:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    role = "admin" if payload.username == expected_user else row["role"] # type: ignore
    return {"access_token": token_for(payload.username, role), "token_type": "bearer", "username": payload.username, "role": role}


@app.post("/api/dispatchers")
def create_dispatcher(payload: DispatcherIn, _: dict = Depends(admin_only)):
    with db() as connection:
        try:
            connection.execute(
                "INSERT INTO dispatchers (username, password_hash, created) VALUES (?, ?, ?)",
                (payload.username, password_hash(payload.password), int(time.time() * 1000)),
            )
        except sqlite3.IntegrityError as exc:
            raise HTTPException(status_code=409, detail="That dispatcher username is already in use.") from exc
    return {"username": payload.username}


@app.get("/api/dispatchers")
def list_dispatchers(_: dict = Depends(admin_only)):
    with db() as connection:
        rows = connection.execute("SELECT username, created, active, role FROM dispatchers ORDER BY username").fetchall()
    expected_user = os.getenv("RAPIDRELAY_DISPATCHER_USER", "dispatcher")
    return [{"username": expected_user, "created": None, "active": True, "role": "admin"}] + [dict(row) for row in rows]


@app.patch("/api/dispatchers/{username}")
def update_dispatcher(username: str, payload: DispatcherUpdate, _: dict = Depends(admin_only)):
    if username == os.getenv("RAPIDRELAY_DISPATCHER_USER", "dispatcher"):
        raise HTTPException(status_code=400, detail="The primary administrator is managed through environment settings.")
    updates, values = [], []
    if payload.active is not None:
        updates.append("active = ?")
        values.append(int(payload.active))
    if payload.password is not None:
        updates.append("password_hash = ?")
        values.append(password_hash(payload.password))
    if not updates:
        raise HTTPException(status_code=400, detail="Provide an active state or a new password.")
    values.append(username)
    with db() as connection:
        cursor = connection.execute(f"UPDATE dispatchers SET {', '.join(updates)} WHERE username = ?", values)
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Dispatcher account not found")
    return {"username": username}


@app.post("/api/sos")
def create_incident(payload: IncidentIn):
    rate_limit(f"sos:{payload.phone or 'anonymous'}")
    severity, confidence = triage(payload.symptoms, payload.age)
    specialty = "general"
    hospital = hospital_for(payload.lat, payload.lng, specialty)
    incident_id = "SOS-" + format(int(time.time() * 1000), "x").upper()
    with db() as connection:
        connection.execute(
            """
            INSERT INTO incidents (
                id, created, status, name, phone, age, symptoms, lat, lng,
                emergency_contact, severity, confidence, specialty, hospital,
                ambulance_lat, ambulance_lng
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (incident_id, int(time.time() * 1000), "received", payload.name, payload.phone, payload.age, json.dumps(payload.symptoms), payload.lat, payload.lng, payload.emergency_contact, severity, confidence, specialty, json.dumps(hospital), None, None),
        )
        row = connection.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
        connection.execute(
            "INSERT INTO incident_events (incident_id, event, actor, created) VALUES (?, ?, ?, ?)",
            (incident_id, "received", "patient", int(time.time() * 1000)),
        )
    return output(row)


@app.get("/api/incidents")
def incidents(_: dict = Depends(dispatcher)):
    with db() as connection:
        return [output(row) for row in connection.execute("SELECT * FROM incidents ORDER BY created DESC")]


@app.get("/api/incidents/{incident_id}")
def incident(incident_id: str):
    with db() as connection:
        row = connection.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Incident not found")
    return output(row)


@app.patch("/api/incidents/{incident_id}")
def update_incident(incident_id: str, payload: StatusIn, identity: dict = Depends(dispatcher)):
    if payload.status not in {"received", "assigned", "enroute", "arrived", "closed"}:
        raise HTTPException(status_code=400, detail="Unsupported incident status")
    with db() as connection:
        connection.execute("UPDATE incidents SET status = ? WHERE id = ?", (payload.status, incident_id))
        row = connection.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
        if row:
            connection.execute(
                "INSERT INTO incident_events (incident_id, event, actor, created) VALUES (?, ?, ?, ?)",
                (incident_id, payload.status, identity.get("sub", "dispatcher"), int(time.time() * 1000)),
            )
    if not row:
        raise HTTPException(status_code=404, detail="Incident not found")
    return output(row)


@app.get("/api/incidents/{incident_id}/events")
def incident_events(incident_id: str, _: dict = Depends(dispatcher)):
    with db() as connection:
        rows = connection.execute(
            "SELECT event, actor, created FROM incident_events WHERE incident_id = ? ORDER BY created",
            (incident_id,),
        ).fetchall()
    return [dict(row) for row in rows]


@app.get("/api/incidents/{incident_id}/tracking")
def tracking(incident_id: str):
    with db() as connection:
        row = connection.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Incident not found")
    hospital = json.loads(row["hospital"])
    progress = min(1, max(0, (time.time() * 1000 - row["created"]) / 60000))
    return {"lat": row["lat"] + (hospital["lat"] - row["lat"]) * progress, "lng": row["lng"] + (hospital["lng"] - row["lng"]) * progress, "simulated": True}


@app.get("/api/profile")
def profile():
    with db() as connection:
        row = connection.execute("SELECT data FROM profiles WHERE id = 1").fetchone()
    return json.loads(row["data"]) if row else {}


@app.put("/api/profile")
def save_profile(payload: ProfileIn):
    with db() as connection:
        connection.execute("INSERT OR REPLACE INTO profiles (id, data) VALUES (1, ?)", (payload.model_dump_json(),))
    return payload
