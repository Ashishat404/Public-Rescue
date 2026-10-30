"""Public Rescue System API backed by a small SQLite database."""
from datetime import datetime, timezone
import hashlib
import hmac
import os
import secrets
import sqlite3
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DB_PATH = "rescue.db"
STATUSES = ["Reported", "Assigned", "In Progress", "Rescued", "Resolved", "Closed"]
THRESHOLDS = {"rainfall_mm": 100, "soil_moisture": 80, "water_level_cm": 300}
TOKEN_TTL_SECONDS = 60 * 60 * 12
DEMO_ACCOUNTS = [
    ("Rescue Administrator", "admin@publicrescue.local", "RescueAdmin!2026", "admin"),
    ("Response Operator", "operator@publicrescue.local", "RescueOperator!2026", "staff"),
    ("QA Operator", "qa@publicrescue.local", "RescueQa!2026", "staff"),
]
DISTRICT_DATA = [
    ("Almora", 29.5971, 79.6591),
    ("Bageshwar", 29.8383, 79.7716),
    ("Chamoli", 30.4010, 79.3210),
    ("Champawat", 29.3360, 80.0910),
    ("Dehradun", 30.3165, 78.0322),
    ("Haridwar", 29.9457, 78.1642),
    ("Nainital", 29.3919, 79.4542),
    ("Pauri Garhwal", 30.1460, 78.7790),
    ("Pithoragarh", 29.5828, 80.2182),
    ("Rudraprayag", 30.2844, 78.9811),
    ("Tehri Garhwal", 30.3780, 78.4800),
    ("Udham Singh Nagar", 28.9740, 79.3970),
    ("Uttarkashi", 30.7268, 78.4354),
]

app = FastAPI(title="Public Rescue System API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    with connect() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS incidents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                description TEXT,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                contact TEXT,
                severity TEXT NOT NULL,
                source TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Reported',
                team_id INTEGER,
                created TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS incident_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                incident_id INTEGER NOT NULL,
                time TEXT NOT NULL,
                status TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS teams (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                district TEXT,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                available INTEGER NOT NULL DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS sensors (
                sensor_id TEXT PRIMARY KEY,
                district TEXT,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                rainfall_mm REAL NOT NULL,
                soil_moisture REAL NOT NULL,
                water_level_cm REAL NOT NULL,
                breached TEXT NOT NULL,
                time TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'staff',
                created TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                expires_at INTEGER NOT NULL
            );
            """
        )
        team_columns = [item[1] for item in connection.execute("PRAGMA table_info(teams)")]
        sensor_columns = [item[1] for item in connection.execute("PRAGMA table_info(sensors)")]
        if "district" not in team_columns:
            connection.execute("ALTER TABLE teams ADD COLUMN district TEXT")
        if "district" not in sensor_columns:
            connection.execute("ALTER TABLE sensors ADD COLUMN district TEXT")
        user_columns = [item[1] for item in connection.execute("PRAGMA table_info(users)")]
        if "role" not in user_columns:
            connection.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'staff'")
        if "created" not in user_columns:
            connection.execute("ALTER TABLE users ADD COLUMN created TEXT NOT NULL DEFAULT ''")
        session_columns = [item[1] for item in connection.execute("PRAGMA table_info(sessions)")]
        if "expires_at" not in session_columns:
            connection.execute("ALTER TABLE sessions ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0")
        for team_id, (district, lat, lng) in enumerate(DISTRICT_DATA, start=1):
            connection.execute(
                "INSERT OR IGNORE INTO teams (id, name, district, lat, lng, available) VALUES (?, ?, ?, ?, ?, 1)",
                (team_id, f"{district} District Response", district, lat, lng),
            )
            connection.execute("UPDATE teams SET district = ? WHERE id = ?", (district, team_id))
            connection.execute(
                "INSERT OR IGNORE INTO sensors (sensor_id, district, lat, lng, rainfall_mm, soil_moisture, water_level_cm, breached, time) VALUES (?, ?, ?, ?, 0, 0, 0, '', ?)",
                (f"UK-{team_id:02d}", district, lat, lng, now()),
            )
        if connection.execute("SELECT COUNT(*) FROM incidents").fetchone()[0] == 0:
            created = now()
            cursor = connection.execute(
                "INSERT INTO incidents (type, description, lat, lng, contact, severity, source, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                ("Landslide", "Road blocked near Thal bridge, vehicle stuck.", 29.82, 80.18, "demo", "High", "demo", created),
            )
            connection.execute(
                "INSERT INTO incident_log (incident_id, time, status) VALUES (?, ?, ?)",
                (cursor.lastrowid, created, "Reported"),
            )
        seed_demo_accounts(connection)


class IncidentIn(BaseModel):
    type: str
    description: str = ""
    lat: float
    lng: float
    contact: str = ""
    severity: str = "Medium"
    source: str = "citizen"


class StatusIn(BaseModel):
    status: str


class AssignIn(BaseModel):
    team_id: int


class SensorIn(BaseModel):
    sensor_id: str
    lat: float
    lng: float
    rainfall_mm: float = 0
    soil_moisture: float = 0
    water_level_cm: float = 0


class SignupIn(BaseModel):
    name: str
    email: str
    password: str


class LoginIn(BaseModel):
    email: str
    password: str


def password_hash(password: str, salt: Optional[bytes] = None):
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return f"{salt.hex()}${digest.hex()}"


def password_matches(password: str, stored: str):
    salt_hex, digest_hex = stored.split("$", 1)
    candidate = password_hash(password, bytes.fromhex(salt_hex)).split("$", 1)[1]
    return hmac.compare_digest(candidate, digest_hex)


def token_hash(token: str):
    return hashlib.sha256(token.encode()).hexdigest()


def staff_user(authorization: Optional[str] = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Staff login required")
    with connect() as connection:
        user = connection.execute(
            "SELECT users.id, users.name, users.email, users.role FROM users JOIN sessions ON sessions.user_id = users.id WHERE sessions.token_hash = ? AND sessions.expires_at > strftime('%s', 'now')",
            (token_hash(authorization[7:].strip()),),
        ).fetchone()
    if not user:
        raise HTTPException(401, "Invalid or expired staff session")
    return dict(user)


def admin_user(user=Depends(staff_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Administrator access required")
    return user


def seed_demo_accounts(connection):
    if os.getenv("PUBLIC_RESCUE_ENV", "development").lower() == "production":
        return
    for name, email, password, role in DEMO_ACCOUNTS:
        connection.execute(
            "INSERT OR IGNORE INTO users (name, email, password_hash, role, created) VALUES (?, ?, ?, ?, ?)",
            (name, email, password_hash(password), role, now()),
        )


def incident_json(row, connection):
    incident = dict(row)
    incident["log"] = [
        dict(item)
        for item in connection.execute(
            "SELECT time, status FROM incident_log WHERE incident_id = ? ORDER BY id",
            (row["id"],),
        ).fetchall()
    ]
    return incident


@app.on_event("startup")
def startup():
    init_db()


@app.post("/auth/signup", status_code=201)
def signup(body: SignupIn, user=Depends(admin_user)):
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    email = body.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(400, "Enter a valid email address")
    with connect() as connection:
        try:
            cursor = connection.execute(
                "INSERT INTO users (name, email, password_hash, role, created) VALUES (?, ?, ?, 'staff', ?)",
                (body.name.strip(), email, password_hash(body.password), now()),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(409, "An account with this email already exists")
        return {"id": cursor.lastrowid, "name": body.name.strip(), "email": email, "role": "staff"}


@app.post("/auth/login")
def login(body: LoginIn):
    with connect() as connection:
        user = connection.execute("SELECT * FROM users WHERE email = ?", (body.email.strip().lower(),)).fetchone()
        if not user or not password_matches(body.password, user["password_hash"]):
            raise HTTPException(401, "Incorrect email or password")
        token = secrets.token_urlsafe(32)
        connection.execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, strftime('%s', 'now') + ?)",
            (token_hash(token), user["id"], TOKEN_TTL_SECONDS),
        )
        return {"token": token, "user": {"id": user["id"], "name": user["name"], "email": user["email"], "role": user["role"]}}


@app.get("/auth/me")
def current_user(user=Depends(staff_user)):
    return user


@app.get("/incidents")
def list_incidents():
    with connect() as connection:
        return [
            incident_json(row, connection)
            for row in connection.execute("SELECT * FROM incidents ORDER BY id DESC")
        ]


@app.post("/incidents", status_code=201)
def report_incident(body: IncidentIn):
    created = now()
    with connect() as connection:
        cursor = connection.execute(
            "INSERT INTO incidents (type, description, lat, lng, contact, severity, source, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (body.type, body.description, body.lat, body.lng, body.contact, body.severity, body.source, created),
        )
        incident_id = cursor.lastrowid
        connection.execute(
            "INSERT INTO incident_log VALUES (NULL, ?, ?, ?)",
            (incident_id, created, "Reported"),
        )
        return incident_json(
            connection.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone(),
            connection,
        )


@app.patch("/incidents/{incident_id}/assign")
def assign(incident_id: int, body: AssignIn, user=Depends(staff_user)):
    with connect() as connection:
        incident = connection.execute(
            "SELECT * FROM incidents WHERE id = ?", (incident_id,)
        ).fetchone()
        team = connection.execute(
            "SELECT * FROM teams WHERE id = ? AND available = 1", (body.team_id,)
        ).fetchone()
        if not incident:
            raise HTTPException(404, "Incident not found")
        if not team:
            raise HTTPException(400, "Team not available")
        timestamp = now()
        connection.execute("UPDATE teams SET available = 0 WHERE id = ?", (body.team_id,))
        connection.execute(
            "UPDATE incidents SET team_id = ?, status = 'Assigned' WHERE id = ?",
            (body.team_id, incident_id),
        )
        connection.execute(
            "INSERT INTO incident_log VALUES (NULL, ?, ?, ?)",
            (incident_id, timestamp, "Assigned"),
        )
        return incident_json(
            connection.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone(),
            connection,
        )


@app.patch("/incidents/{incident_id}/status")
def set_status(incident_id: int, body: StatusIn, user=Depends(staff_user)):
    if body.status not in STATUSES:
        raise HTTPException(400, f"Status must be one of {STATUSES}")
    with connect() as connection:
        incident = connection.execute(
            "SELECT * FROM incidents WHERE id = ?", (incident_id,)
        ).fetchone()
        if not incident:
            raise HTTPException(404, "Incident not found")
        timestamp = now()
        connection.execute(
            "UPDATE incidents SET status = ? WHERE id = ?",
            (body.status, incident_id),
        )
        connection.execute(
            "INSERT INTO incident_log VALUES (NULL, ?, ?, ?)",
            (incident_id, timestamp, body.status),
        )
        if body.status in ("Resolved", "Closed") and incident["team_id"]:
            connection.execute(
                "UPDATE teams SET available = 1 WHERE id = ?", (incident["team_id"],)
            )
        return incident_json(
            connection.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone(),
            connection,
        )


@app.get("/teams")
def list_teams():
    with connect() as connection:
        return [
            {**dict(row), "available": bool(row["available"])}
            for row in connection.execute("SELECT * FROM teams")
        ]


@app.get("/sensors")
def list_sensors():
    with connect() as connection:
        return [dict(row) for row in connection.execute("SELECT * FROM sensors")]


@app.post("/sensor-data")
def sensor_data(body: SensorIn, user=Depends(staff_user)):
    reading = body.model_dump()
    breached = [key for key, threshold in THRESHOLDS.items() if reading[key] >= threshold]
    with connect() as connection:
        connection.execute(
            "INSERT OR REPLACE INTO sensors (sensor_id, district, lat, lng, rainfall_mm, soil_moisture, water_level_cm, breached, time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                body.sensor_id,
                None,
                body.lat,
                body.lng,
                body.rainfall_mm,
                body.soil_moisture,
                body.water_level_cm,
                ",".join(breached),
                now(),
            ),
        )
        if breached:
            incident_type = "Flash Flood" if "water_level_cm" in breached else "Landslide"
            created = now()
            cursor = connection.execute(
                "INSERT INTO incidents (type, description, lat, lng, contact, severity, source, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    incident_type,
                    "Sensor threshold crossed: " + ", ".join(breached),
                    body.lat,
                    body.lng,
                    body.sensor_id,
                    "High",
                    "sensor",
                    created,
                ),
            )
            connection.execute(
                "INSERT INTO incident_log VALUES (NULL, ?, ?, ?)",
                (cursor.lastrowid, created, "Reported"),
            )
    return {"breached": breached}
