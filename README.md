# Public Rescue System (software part)

## Backend (FastAPI)
    cd backend
    pip install -r requirements.txt
    uvicorn main:app --reload        # http://127.0.0.1:8000/docs

## Frontend (React + Leaflet + OpenStreetMap)
    cd frontend
    npm install
    npm run dev                      # http://localhost:5173 

## Test the sensor flow (should auto-create an incident)
    curl -X POST http://127.0.0.1:8000/sensor-data -H "Content-Type: application/json" \
      -d '{"sensor_id":"NODE-01","lat":29.7,"lng":80.3,"rainfall_mm":120,"soil_moisture":85}'
