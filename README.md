# Public Rescue System

React + FastAPI rescue dashboard with a persistent SQLite database, incident workflow, team assignment, live map markers, and sensor-triggered incident creation. The demo dataset covers all 13 districts of Uttarakhand.

## Backend (FastAPI)
    cd backend
    pip install -r requirements.txt
    uvicorn main:app --reload        # http://127.0.0.1:8000/docs

The database is created automatically as `rescue.db` on first startup.

The seed data includes one district response center and one monitoring node for each of Uttarakhand's 13 districts: Almora, Bageshwar, Chamoli, Champawat, Dehradun, Haridwar, Nainital, Pauri Garhwal, Pithoragarh, Rudraprayag, Tehri Garhwal, Udham Singh Nagar, and Uttarkashi. These are reference/demo coordinates for the prototype, not live government feeds.

Main endpoints:

- `POST /auth/signup` and `POST /auth/login`
- `GET /auth/me`
- `GET /incidents` and `POST /incidents`
- `PATCH /incidents/{id}/assign`
- `PATCH /incidents/{id}/status`
- `GET /teams` and `GET /sensors`
- `POST /sensor-data`

Public users can view incidents and submit reports without an account. Staff accounts are used for assignment, status updates, sensor ingestion, and future operational tools. Staff passwords are hashed with PBKDF2 and login sessions expire after 12 hours.

For a production deployment, replace open staff signup with an invite or administrator approval flow, use HTTPS, add rate limiting, and move the SQLite database to managed storage.

## Frontend (React + Leaflet + OpenStreetMap)
    cd frontend
    npm install
    npm run dev                      # http://localhost:5173 

The Vite development server proxies `/api/*` requests to FastAPI. The frontend uses `/api/incidents`, `/api/teams`, and the related workflow endpoints.

OpenStreetMap provides the base map tiles. For production use, verify authority contacts, hospital/shelter locations, risk boundaries, and sensor readings against official sources such as the Uttarakhand government, the State Disaster Management Authority, IMD, and OpenStreetMap contributors.

## Test the sensor flow (should auto-create an incident)
    curl -X POST http://127.0.0.1:8000/sensor-data -H "Content-Type: application/json" \
      -d '{"sensor_id":"NODE-01","lat":29.7,"lng":80.3,"rainfall_mm":120,"soil_moisture":85}'
