# CareConnect — AI Medical Receptionist

CareConnect is an AI-assisted medical receptionist proof of concept that helps patients interact with a hospital appointment system through a conversational chat interface.

The application combines an Angular frontend, a Node.js and Express backend, MongoDB persistence, and a locally running Ollama language model to understand patient requests and guide them through appointment-related workflows.

## Features

### Conversational AI Receptionist
- Accepts patient requests in natural language.
- Uses Ollama to interpret patient intent and assist with department selection.
- Supports conversational appointment booking instead of requiring patients to navigate multiple forms.
- Guides patients through the booking process step by step.

### Patient Management
- Supports new and existing patient workflows.
- Registers new patients using their name and phone number.
- Generates a patient reference ID after successful registration.
- Retrieves existing patient information to continue appointment-related conversations.

### Department and Doctor Selection
- Supports General Medicine, Dermatology, and Cardiology.
- Helps patients identify the appropriate department based on their request.
- Retrieves active doctors associated with the selected department.
- Allows patients to select a doctor by name or by choosing a numbered option.

### Appointment Booking
- Checks available appointment dates and time slots.
- Presents available slots for the selected doctor.
- Books an appointment after the patient selects an available slot.
- Generates an appointment reference number.
- Stores appointment details and booking status in MongoDB.
- Prevents duplicate bookings for the same provider and time slot, subject to the application's booking validation and database constraints.

### Existing Appointment Detection
- Checks whether a patient already has a booked appointment.
- Displays the existing appointment details, including the doctor, department, date, time, and booking reference.
- Avoids creating a duplicate appointment when the patient confirms an existing booking.

### Appointment Management
- Supports keeping an existing appointment.
- Supports rescheduling an appointment.
- Supports cancellation of an appointment.
- Maintains appointment status throughout the management workflow.

## Technology Stack

| Component | Technology |
|---|---|
| Frontend | Angular |
| Backend | Node.js, Express.js |
| Database | MongoDB, Mongoose |
| AI / Language Model | Ollama with Llama 3.2 1B |
| API Communication | REST APIs |
| Development Environment | Local development setup |

## Application Architecture

```text
Patient
   |
   v
Angular Chat Interface
   |
   | HTTP REST API
   v
Node.js / Express Backend
   |
   +---- Conversation and workflow handling
   |
   +---- Ollama language model
   |       |
   |       +---- Natural-language intent understanding
   |
   +---- Patient management
   |
   +---- Department and doctor lookup
   |
   +---- Appointment availability and booking
   |
   v
MongoDB
   |
   +---- Patients
   +---- Departments
   +---- Providers
   +---- Appointments
   +---- Conversation state
```

## Conversational Workflow

1. The patient opens the CareConnect application.
2. The receptionist asks whether the patient is new or already registered.
3. A new patient provides the required registration details, while an existing patient is identified using the application's patient lookup workflow.
4. The patient describes their medical appointment requirement in natural language.
5. The system identifies the requested department and retrieves relevant doctors.
6. The patient selects a doctor and an available appointment date.
7. The system presents available time slots.
8. The patient selects a slot, and the backend validates and saves the booking.
9. The receptionist returns the appointment confirmation and reference number.
10. If an existing appointment is detected, the receptionist presents its details and supports the available appointment-management actions.

## Project Structure

```text
ai-receptionist-poc/
├── frontend/
│   └── src/
│       └── app/
│           ├── app.component.ts
│           └── app.component.html
│
├── backend/
│   ├── src/
│   │   └── server.js
│   ├── package.json
│   └── .env.example
│
└── README.md
```

*The structure above highlights the main application files. Additional configuration, service, component, and model files may exist in the project.*

## Prerequisites

- Node.js and npm
- MongoDB running locally or an accessible MongoDB instance
- Ollama installed and running locally
- The Llama 3.2 1B model downloaded in Ollama
- Angular CLI, if required by the frontend project

## Run Locally

### 1. Start MongoDB

Start your MongoDB service and ensure the application can connect to the configured database.

### 2. Start Ollama

Ensure Ollama is installed and running. Download the model if it is not already available:

```bash
ollama pull llama3.2:1b
```

Verify that the model is available:

```bash
ollama list
```

### 3. Start the Backend

Open a terminal in the project root:

```bash
cd backend
npm install
```

Configure the required environment variables using the project's environment configuration or `.env.example`, if provided.

Start the backend using the script configured in `backend/package.json`:

```bash
npm start
```

Ensure the backend is listening on the configured port, expected to be `3000` in the current local setup.

### 4. Start the Frontend

Open a separate terminal:

```bash
cd frontend
npm install
npm start
```

If the project does not define a `start` script, use the development command configured in `frontend/package.json`, such as:

```bash
npx ng serve
```

### 5. Open the Application

Open the Angular application in your browser:

[http://localhost:4200](http://localhost:4200)

The frontend should be able to communicate with the backend API at:

`http://localhost:3000/api/agent/reception`

Use the actual port and API configuration defined in your local environment if they differ.

## Example Patient Interactions

**New patient**

> Hi, I need to book a doctor appointment.

The receptionist asks whether the patient is new or already registered and guides them through registration if needed.

**Department selection**

> I need a heart specialist.

The system identifies Cardiology and presents the available doctors.

**Appointment booking**

> I want to book an appointment with Dr. Priya Shah.

The receptionist guides the patient through date selection, slot availability, and booking confirmation.

**Existing appointment**

> I already have an appointment.

The system checks for an existing booking and can display the appointment details instead of creating a duplicate.

## Important Notes

- This project is a proof of concept intended for learning and demonstrating AI-assisted conversational workflows.
- Ollama provides local language-model inference; the backend remains responsible for database operations, appointment validation, and booking state.
- AI-generated intent interpretations should not independently authorize database changes or appointment bookings.
- Appointment availability and booking outcomes depend on backend validation and the current database state.
- Keep database credentials, API keys, and other secrets out of version control.
- Do not use real patient information in demonstrations or development testing.
- This application is not a substitute for professional medical advice, emergency services, or a production-grade hospital information system.
- Production deployment would require additional security controls, access management, audit logging, privacy safeguards, monitoring, and comprehensive testing.
