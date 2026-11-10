# RapidRelay: emergency response website

React website with three pages:

- `/#/`          landing website
- `/#/sos`       patient app (hold SOS, symptoms, nearest hospital, live status)
- `/#/dispatch`  dispatcher dashboard (alerts on a map, assign and update cases)

## Run it locally

1. Install Node.js 18 or newer from https://nodejs.org (this also installs npm).
2. Configure and start the backend:

       cd backend
       python3 -m venv .venv
       . .venv/bin/activate
       pip install -r requirements.txt
       cp .env.example .env

   Set `RAPIDRELAY_JWT_SECRET` and `RAPIDRELAY_DISPATCHER_PASSWORD` in `.env` to
   strong, private values, then start the API:

       uvicorn app:app --reload --port 8000

   For a separately hosted frontend, set `RAPIDRELAY_ALLOWED_ORIGINS` to its HTTPS
   origin instead of the local development origin.

   SQLite is created automatically at `backend/rapidrelay.sqlite3`. It uses WAL mode
   and indexes incident status and creation time.

   Create a consistent database backup with:

       python backup_db.py

3. Open another terminal in the `frontend` folder and install the packages:

       npm install

4. Start the dev server:

       npm run dev

5. Open http://localhost:5173 in your browser.

Try it: open `/#/sos` and hold the red button for 2 seconds, pick symptoms or you can just record the voice , press "Send alert".
Keep `/#/dispatch` open in a second tab to see the alert and change its status.
If location is blocked, allow location access or call 112.

To make a production build: `npm run build`, then `npm run preview`.

## Data and production requirements

The website does not use localStorage or fabricate incidents. Every alert is sent to the
FastAPI API and stored centrally in SQLite. If the API or database is unavailable, the user
sees an error and is told to call 112.

The backend finds nearby hospitals within 50 km using OpenStreetMap and falls back to the
configured hospital file only if that directory is unavailable. Hospital lookup does not itself
dispatch an ambulance; production deployment requires an authorized emergency-service provider,
HTTPS, backups, monitoring, rate limiting, and a reviewed privacy policy.

Dispatcher access uses the configured username/password and a short-lived JWT stored only
in the browser session. Incident status changes are recorded in the SQLite audit log.
The installed PWA shell supports offline loading, but an SOS still requires a live API
connection and will never claim success while offline.

External ambulance dispatch, SMS, WhatsApp, and hospital bed-status integrations are not
connected because no approved providers or credentials have been supplied. Set provider
configuration only after contracts, consent, privacy review, and emergency-service testing.

## Folders

- `frontend/`  React + Vite app (`src/pages`, `src/components`, `src/lib/api.js`)
- `backend/`   FastAPI API, SQLite persistence, hospital lookup, and dispatcher authentication

## Notes

- The backend finds hospitals within 50 km of the user's location through OpenStreetMap.
- This is a decision-support prototype, not a medical device. In a real emergency call 112.
