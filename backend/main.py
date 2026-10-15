"""Public Rescue System API (demo: in-memory store -> swap for PostgreSQL later)."""
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Public Rescue System API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

STATUSES = ["Reported", "Assigned", "In Progress", "Rescued", "Resolved", "Closed"]
THRESHOLDS = {"rainfall_mm": 100, "soil_moisture": 80, "water_level_cm": 300}
now = lambda: datetime.now(timezone.utc).isoformat(timespec="seconds")

teams = [
    {"id": 1, "name": "SDRF Pithoragarh", "lat": 29.5828, "lng": 80.2182, "available": True},
    {"id": 2, "name": "Fire Station Didihat", "lat": 29.8000, "lng": 80.2500, "available": True},
    {"id": 3, "name": "ITBP Munsiyari", "lat": 30.0667, "lng": 80.2333, "available": True},
]
incidents = [
    {"id": 1, "type": "Landslide", "description": "Road blocked near Thal bridge, vehicle stuck.",
     "lat": 29.8200, "lng": 80.1800, "contact": "9876500001", "severity": "High",
     "source": "citizen", "status": "Reported", "team_id": None, "created": now(),
     "log": [{"time": now(), "status": "Reported"}]},
]
sensors = {}
next_id = 2


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


def find(id_):
    inc = next((i for i in incidents if i["id"] == id_), None)
    if not inc:
        raise HTTPException(404, "Incident not found")
    return inc


def create_incident(data: dict):
    global next_id
    inc = {**data, "id": next_id, "status": "Reported", "team_id": None, "created": now(),
           "log": [{"time": now(), "status": "Reported"}]}
    next_id += 1
    incidents.insert(0, inc)
    return inc


@app.get("/incidents")
def list_incidents():
    return incidents


@app.post("/incidents", status_code=201)
def report_incident(body: IncidentIn):
    return create_incident(body.model_dump())


@app.patch("/incidents/{id_}/assign")
def assign(id_: int, body: AssignIn):
    inc, team = find(id_), next((t for t in teams if t["id"] == body.team_id), None)
    if not team or not team["available"]:
        raise HTTPException(400, "Team not available")
    team["available"] = False
    inc.update(team_id=team["id"], status="Assigned")
    inc["log"].append({"time": now(), "status": "Assigned"})
    return inc


@app.patch("/incidents/{id_}/status")
def set_status(id_: int, body: StatusIn):
    if body.status not in STATUSES:
        raise HTTPException(400, f"Status must be one of {STATUSES}")
    inc = find(id_)
    inc["status"] = body.status
    inc["log"].append({"time": now(), "status": body.status})
    if body.status in ("Resolved", "Closed") and inc["team_id"]:
        for t in teams:
            if t["id"] == inc["team_id"]:
                t["available"] = True
    return inc


@app.get("/teams")
def list_teams():
    return teams


@app.get("/sensors")
def list_sensors():
    return list(sensors.values())


@app.post("/sensor-data")
def sensor_data(body: SensorIn):
    """ESP32 posts readings here; crossing a threshold auto-creates an incident."""
    reading = body.model_dump()
    breached = [k for k, v in THRESHOLDS.items() if reading[k] >= v]
    sensors[body.sensor_id] = {**reading, "breached": breached, "time": now()}
    if breached:
        kind = "Flash Flood" if "water_level_cm" in breached else "Landslide"
        create_incident({"type": kind, "source": "sensor", "severity": "High", "contact": body.sensor_id,
                         "description": "Sensor threshold crossed: " + ", ".join(breached),
                         "lat": body.lat, "lng": body.lng})
    return {"breached": breached}
