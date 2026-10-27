# AI Agent Receptionist POC (Angular 17 + Node/Express + MongoDB)

This is a local-development POC, not a production clinical system. The "AI" layer is a deterministic intent extractor so the project runs without paid API keys. It is intentionally replaceable with an LLM later. Never let an LLM make the final availability or booking decision: the backend rules do that.

## Requirements
- Node.js 18.13+ (Node 20.9+ recommended for Angular 17.3)
- npm
- MongoDB local service OR MongoDB Atlas connection string
- VS Code recommended

Angular 17 is an older major version. Its official compatibility table lists Node `^18.13.0 || ^20.9.0` for Angular 17.3. Use Node 20.x for this POC rather than the newest Node release.

## 1. Install / verify
Install Node.js 20 LTS from https://nodejs.org/ and MongoDB Community Server from https://www.mongodb.com/try/download/community, or create an Atlas cluster at https://www.mongodb.com/cloud/atlas.
Open a new terminal:
```bash
node -v
npm -v
```
Start the local MongoDB service if using local MongoDB. On Windows, use the MongoDB service installed by the installer, or use Atlas.

## 2. Start backend
Open a terminal in `backend`:
```bash
npm install
```
Copy `.env.example` to `.env` and edit `MONGODB_URI` if needed. Then:
```bash
npm run seed
npm run dev
```
Backend: http://localhost:3000
Health check: http://localhost:3000/api/health
Seed data is safe to re-run; it upserts departments/providers by slug.

## 3. Create Angular 17 app
In a second terminal, go to the project root (the folder containing `backend` and `frontend-source`) and run:
```bash
npx -p @angular/cli@17 ng new frontend --standalone --routing --style=css --skip-git
```
If prompted, choose defaults. Copy the files from `frontend-source/src/app/` into the generated `frontend/src/app/`, replacing the generated app files. Copy `frontend-source/src/styles.css` to `frontend/src/styles.css`. Keep the CLI-generated `main.ts`, `index.html`, and `angular.json`.
Then:
```bash
cd frontend
npm install
ng serve
```
Open http://localhost:4200

## 4. Test the POC
1. Pick Dermatology or Cardiology.
2. Enter a patient name, phone number, and email (email optional).
3. Select a future date and a slot returned by the API.
4. Click **Book appointment**.
5. Try booking the same doctor/time again; the backend should reject the conflict.
6. Try the agent box with: `I am a new patient. I need a skin specialist tomorrow`.

The API uses local demo availability: providers work 09:00–17:00, Monday–Saturday, appointments are 30 minutes, and a slot is valid only when it fits working hours and does not overlap an existing booked appointment. Demo slots are generated at 30-minute intervals.

## API endpoints
- `GET /api/health`
- `GET /api/departments`
- `GET /api/providers?departmentId=<id>`
- `GET /api/availability?providerId=<id>&date=YYYY-MM-DD`
- `POST /api/patients` (create or reuse by normalized phone)
- `POST /api/appointments` (validates provider/department/date/time and prevents overlapping appointments)
- `POST /api/agent/reception` (simple receptionist-intent workflow)

Example appointment body:
```json
{
  "patient": {
    "name": "Asha Kumar",
    "phone": "+919876543210",
    "email": "asha@example.com"
  },
  "providerId": "PROVIDER_OBJECT_ID",
  "departmentId": "DEPARTMENT_OBJECT_ID",
  "date": "2026-11-02",
  "startTime": "10:00",
  "reason": "Dermatology consultation"
}
```

## Worst-case behavior covered
- Invalid/missing fields -> 400
- Unknown provider/department -> 404
- Provider belongs to a different department -> 400
- Past date / weekend Sunday / outside hours -> 400
- Existing overlapping booking -> 409 conflict
- Duplicate patient phone -> existing patient reused (not duplicated)
- Database/server errors -> JSON 500 response (details are not exposed)
- Emergency language -> agent advises emergency services and does not book
- No matching provider/slot -> returns a clear message; no false booking confirmation

## Important production gaps
This POC has no authentication, authorization, audit trail, consent workflow, rate limiting, SMS/email confirmation, HIPAA/DPDP compliance review, or transactional locking for concurrent bookings. It uses a unique phone index for patient deduplication and a MongoDB atomic conditional appointment insert pattern is not fully implemented here; for production, use a transaction/locking strategy and enforce overlap prevention under concurrency. Do not use real patient data in this demo. Emergency detection is basic keyword matching, not medical triage.
