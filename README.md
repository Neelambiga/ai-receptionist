# CareConnect — AI Medical Receptionist POC

CareConnect is a proof of concept for an AI-assisted medical receptionist that helps patients register, find departments and providers, check appointment availability, and manage appointments.

## Features

- Patient registration and lookup
- Department and provider selection
- Available appointment slot lookup
- Appointment booking
- Keep, reschedule, and cancel appointment flows
- Backend API with MongoDB persistence
- Prevention of double-booking the same provider and time slot

## Tech Stack

- **Frontend:** Angular
- **Backend:** Node.js and Express
- **Database:** MongoDB
- **API:** REST

## Prerequisites

- Node.js and npm
- MongoDB running locally
- Angular CLI compatible with the frontend project

## Run Locally

### 1. Start MongoDB

Ensure your local MongoDB service is running.

### 2. Start the backend

```bash
cd backend
npm install
```

Configure your environment variables using the provided `.env.example`, if required by the project.

Start the backend using the script defined in `backend/package.json`, for example:

```bash
npm start
```

### 3. Start the frontend

Open a separate terminal:

```bash
cd frontend
npm install
npm start
```

If no `start` script exists, use the Angular CLI command configured for the project.

Open `http://localhost:4200` in your browser if that is the configured frontend port.

## Notes

- Keep credentials and environment-specific secrets out of version control.
- This project is a proof of concept, not a production-ready medical system.
- Verify the available npm scripts in each `package.json` before running the application.