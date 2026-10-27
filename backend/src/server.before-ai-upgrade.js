
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb://127.0.0.1:27017/ai_receptionist_poc";

app.use(cors({ origin: true }));
app.use(express.json());

/* =========================================================
   1. DATABASE SCHEMAS
========================================================= */

const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

const providerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },

    specialty: { type: String, default: "" },
    qualification: { type: String, default: "" },
    experienceYears: { type: Number, default: 0 },

    // Monday = 1, Tuesday = 2, ..., Sunday = 0
    availableDays: {
      type: [Number],
      default: [1, 2, 3, 4, 5],
    },

    startTime: { type: String, default: "09:00" },
    endTime: { type: String, default: "17:00" },
    slotMinutes: { type: Number, default: 30 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const patientSchema = new mongoose.Schema(
  {
    patientId: {
      type: String,
      required: true,
      unique: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
    },

    normalizedPhone: {
      type: String,
      required: true,
      unique: true,
    },
  },
  { timestamps: true }
);

const appointmentSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },

    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Provider",
      required: true,
    },

    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },

    date: {
      type: String,
      required: true,
    },

    startTime: {
      type: String,
      required: true,
    },

    endTime: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["BOOKED", "CANCELLED"],
      default: "BOOKED",
      required: true,
    },
  },
  { timestamps: true }
);

// A doctor cannot have two active appointments starting
// at the same time on the same date.
appointmentSchema.index(
  {
    provider: 1,
    date: 1,
    startTime: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      status: "BOOKED",
    },
  }
);

const conversationSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
    },

    step: {
      type: String,
      default: "start",
    },

    patientMongoId: String,
    patientId: String,
    patientName: String,

    departmentId: String,
    departmentName: String,

    providerOptions: {
      type: [String],
      default: [],
    },

    providerId: String,
    providerName: String,

    date: String,

    slotOptions: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    existingAppointmentId: String,

    // Keeps track of the old appointment during rescheduling.
    // The old appointment stays BOOKED until a new booking succeeds.
    reschedulingAppointmentId: String,

    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Conversation sessions expire after seven days.
conversationSchema.index(
  { updatedAt: 1 },
  { expireAfterSeconds: 604800 }
);

const Department = mongoose.model(
  "Department",
  departmentSchema
);

const Provider = mongoose.model("Provider", providerSchema);

const Patient = mongoose.model("Patient", patientSchema);

const Appointment = mongoose.model(
  "Appointment",
  appointmentSchema
);

const Conversation = mongoose.model(
  "Conversation",
  conversationSchema
);

/* =========================================================
   2. GENERAL HELPERS
========================================================= */

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.slice(-10);
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function pad(number) {
  return String(number).padStart(2, "0");
}

// Use the Indian calendar date consistently, regardless of
// the server machine's configured timezone.
function dateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return `${values.year}-${values.month}-${values.day}`;
}

function todayLocal() {
  return dateString(new Date());
}

function addDays(date, amount) {
  const [year, month, day] = date.split("-").map(Number);

  // UTC arithmetic avoids daylight-saving and local timezone
  // changes affecting the calendar date.
  const result = new Date(
    Date.UTC(year, month - 1, day + amount)
  );

  return [
    result.getUTCFullYear(),
    pad(result.getUTCMonth() + 1),
    pad(result.getUTCDate()),
  ].join("-");
}

function timeToMinutes(time) {
  const [hours, minutes] = String(time).split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes) {
  return `${pad(Math.floor(minutes / 60))}:${pad(
    minutes % 60
  )}`;
}

function friendlyDate(date) {
  const [year, month, day] = date.split("-").map(Number);

  const value = new Date(Date.UTC(year, month - 1, day));

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

function makePatientId() {
  return `CC${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function isYes(message) {
  return [
    "yes",
    "y",
    "existing",
    "old",
    "existing patient",
    "i am existing",
  ].includes(normalizeText(message));
}

function isNo(message) {
  return [
    "no",
    "n",
    "new",
    "new patient",
    "register",
    "register new",
  ].includes(normalizeText(message));
}

function parsePatientLookup(message) {
  const value = String(message || "").trim();

  if (/^\d{10}$/.test(value.replace(/\D/g, ""))) {
    return {
      type: "phone",
      value: normalizePhone(value),
    };
  }

  const patientId = value.replace(/\s/g, "").toUpperCase();

  if (/^CC[A-Z0-9]+$/.test(patientId)) {
    return {
      type: "patientId",
      value: patientId,
    };
  }

  return null;
}

function parseNameAndPhone(message) {
  const text = String(message || "").trim();
  const phoneMatch = text.match(/(?:\+?91[\s-]*)?[6-9]\d{9}/);

  if (!phoneMatch) {
    return null;
  }

  const phone = normalizePhone(phoneMatch[0]);

  const name = text
    .replace(phoneMatch[0], "")
    .replace(/[,;:-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!name || phone.length !== 10) {
    return null;
  }

  return { name, phone };
}

function parseDateInput(message) {
  const value = normalizeText(message);

  if (value === "today") {
    return todayLocal();
  }

  if (value === "tomorrow") {
    return addDays(todayLocal(), 1);
  }

  // YYYY-MM-DD
  let match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (match) {
    const [, year, month, day] = match;
    const date = `${year}-${month}-${day}`;

    const parsed = new Date(`${date}T00:00:00Z`);

    if (
      parsed.getUTCFullYear() === Number(year) &&
      parsed.getUTCMonth() + 1 === Number(month) &&
      parsed.getUTCDate() === Number(day)
    ) {
      return date;
    }

    return null;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);

  if (match) {
    const [, day, month, year] = match;

    const date = `${year}-${pad(Number(month))}-${pad(
      Number(day)
    )}`;

    const parsed = new Date(`${date}T00:00:00Z`);

    if (
      parsed.getUTCFullYear() === Number(year) &&
      parsed.getUTCMonth() + 1 === Number(month) &&
      parsed.getUTCDate() === Number(day)
    ) {
      return date;
    }
  }

  return null;
}

function askStart() {
  return "Welcome to CareConnect! Are you an existing patient or a new patient?";
}

function formatSlots(slots) {
  if (!slots.length) {
    return "No available slots were found for that date. Please select another date.";
  }

  return (
    "Available appointment slots:\n" +
    slots
      .map(
        (slot, index) =>
          `${index + 1}. ${slot.label || `${slot.startTime}–${slot.endTime}`}`
      )
      .join("\n") +
    '\n\nReply with the slot number or start time, for example "10:30".'
  );
}

function getAppointmentReference(appointment) {
  return String(appointment._id).slice(-8).toUpperCase();
}

function formatAppointmentDetails(appointment, patient) {
  const departmentName =
    appointment.department?.name || "Not specified";

  const providerName =
    appointment.provider?.name || "Not specified";

  return [
    `Patient: ${patient.name} (${patient.patientId})`,
    `Department: ${departmentName}`,
    `Doctor: ${providerName}`,
    `Date: ${friendlyDate(appointment.date)}`,
    `Time: ${appointment.startTime}–${appointment.endTime}`,
    `Status: ${appointment.status}`,
    `Appointment reference: ${getAppointmentReference(appointment)}`,
  ].join("\n");
}

function formatExistingAppointment(appointment, patient) {
  return (
    `You already have an appointment with ${appointment.provider.name}!\n\n` +
    `${formatAppointmentDetails(appointment, patient)}\n\n` +
    "What would you like to do?\n" +
    "1. Keep appointment\n" +
    "2. Reschedule appointment\n" +
    "3. Cancel appointment\n\n" +
    'Please reply "keep", "reschedule", or "cancel".'
  );
}

function isKeepAction(message) {
  return [
    "keep",
    "yes",
    "same",
    "keep appointment",
    "confirm",
    "1",
  ].includes(normalizeText(message));
}

function isRescheduleAction(message) {
  return [
    "reschedule",
    "reschedule appointment",
    "different",
    "different appointment",
    "book another",
    "another",
    "2",
  ].includes(normalizeText(message));
}

function isCancelAction(message) {
  return [
    "cancel",
    "cancel appointment",
    "3",
  ].includes(normalizeText(message));
}

/* =========================================================
   3. CONVERSATION STATE
========================================================= */

async function saveConversation(sessionId, updates = {}) {
  return Conversation.findOneAndUpdate(
    { sessionId },
    {
      $set: {
        ...updates,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        sessionId,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  ).lean();
}

async function getState(sessionId) {
  return Conversation.findOne({ sessionId }).lean();
}

/* =========================================================
   4. PATIENT AND DEPARTMENT HELPERS
========================================================= */

async function findOrCreatePatient(name, phone) {
  const normalizedPhone = normalizePhone(phone);

  let patient = await Patient.findOne({ normalizedPhone });

  if (patient) {
    return patient;
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      patient = await Patient.create({
        patientId: makePatientId(),
        name: name.trim(),
        phone: normalizedPhone,
        normalizedPhone,
      });

      return patient;
    } catch (error) {
      if (error.code !== 11000) {
        throw error;
      }

      // Another request might have created this phone number
      // between the lookup and insert.
      patient = await Patient.findOne({ normalizedPhone });

      if (patient) {
        return patient;
      }
    }
  }

  throw new Error("Could not create or retrieve patient.");
}

async function findDepartment(message) {
  const value = normalizeText(message);

  const aliases = {
    general: "General Medicine",
    "general doctor": "General Medicine",
    physician: "General Medicine",
    "general physician": "General Medicine",
    "general medicine": "General Medicine",

    skin: "Dermatology",
    dermatologist: "Dermatology",
    dermatology: "Dermatology",

    heart: "Cardiology",
    cardiologist: "Cardiology",
    cardiology: "Cardiology",
  };

  const departmentName = aliases[value];

  if (departmentName) {
    return Department.findOne({ name: departmentName });
  }

  return Department.findOne({
    name: {
      $regex: `^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      $options: "i",
    },
  });
}



/* =========================================================
   5. APPOINTMENT SLOT AVAILABILITY
========================================================= */

async function getAvailableSlots(provider, date) {
  if (!provider || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return [];
  }

  const [year, month, day] = date.split("-").map(Number);

  const parsedDate = new Date(
    Date.UTC(year, month - 1, day)
  );

  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() + 1 !== month ||
    parsedDate.getUTCDate() !== day
  ) {
    return [];
  }

  if (date < todayLocal()) {
    return [];
  }

  // UTC weekday: Sunday = 0, Monday = 1, ..., Saturday = 6.
  const weekday = parsedDate.getUTCDay();

  if (!(provider.availableDays || []).includes(weekday)) {
    return [];
  }

  // IMPORTANT:
  // Fetch all active bookings for this doctor and date,
  // not just bookings belonging to the current patient.
  const bookedAppointments = await Appointment.find({
    provider: provider._id,
    date,
    status: "BOOKED",
  })
    .select("startTime endTime")
    .lean();

  const bookedStarts = new Set(
    bookedAppointments.map((appointment) => appointment.startTime)
  );

  const slots = [];
  const slotMinutes = provider.slotMinutes || 30;

  const startMinutes = timeToMinutes(provider.startTime);
  const endMinutes = timeToMinutes(provider.endTime);

  const currentDate = todayLocal();

  const nowParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const nowValues = {};

  for (const part of nowParts) {
    if (part.type !== "literal") {
      nowValues[part.type] = part.value;
    }
  }

  const currentMinutes =
    Number(nowValues.hour) * 60 + Number(nowValues.minute);

  for (
    let minutes = startMinutes;
    minutes + slotMinutes <= endMinutes;
    minutes += slotMinutes
  ) {
    const startTime = minutesToTime(minutes);
    const endTime = minutesToTime(minutes + slotMinutes);

    // Do not display a slot already booked by any patient.
    if (bookedStarts.has(startTime)) {
      continue;
    }

    // Do not offer a slot whose start time has passed today.
    if (date === currentDate && minutes <= currentMinutes) {
      continue;
    }

    slots.push({
      startTime,
      endTime,
      label: `${startTime}–${endTime}`,
    });
  }

  return slots;
}

async function findExistingAppointment(patientMongoId, providerId) {
  return Appointment.findOne({
    patient: patientMongoId,
    provider: providerId,
    status: "BOOKED",
    date: { $gte: todayLocal() },
  })
    .populate("department", "name")
    .populate("provider", "name")
    .sort({ date: 1, startTime: 1 })
    .lean();
}

async function getAppointmentForPatient(appointmentId, patientMongoId) {
  if (
    !appointmentId ||
    !mongoose.Types.ObjectId.isValid(appointmentId)
  ) {
    return null;
  }

  return Appointment.findOne({
    _id: appointmentId,
    patient: patientMongoId,
    status: "BOOKED",
  })
    .populate("department", "name")
    .populate("provider", "name")
    .lean();
}

/* =========================================================
   6. SEED INITIAL DATA
========================================================= */

async function seedData() {
  const departments = [
    {
      name: "General Medicine",
      description: "General health consultations and primary care.",
    },
    {
      name: "Dermatology",
      description: "Skin, hair, and nail consultations.",
    },
    {
      name: "Cardiology",
      description: "Heart health consultations.",
    },
  ];

  for (const department of departments) {
    await Department.findOneAndUpdate(
      { name: department.name },
      { $set: department },
      { upsert: true, new: true }
    );
  }

  const providerSeed = [
    {
      name: "Dr. Karthik Rao",
      departmentName: "General Medicine",
      specialty: "General Medicine",
      qualification: "MBBS, MD",
      experienceYears: 10,
    },
    {
      name: "Dr. Anitha Krishnan",
      departmentName: "General Medicine",
      specialty: "General Medicine",
      qualification: "MBBS, MD",
      experienceYears: 8,
    },
    {
      name: "Dr. Rahul Verma",
      departmentName: "General Medicine",
      specialty: "General Medicine",
      qualification: "MBBS, MD",
      experienceYears: 7,
    },
    {
      name: "Dr. Meera Raman",
      departmentName: "Dermatology",
      specialty: "Dermatology",
      qualification: "MBBS, MD",
      experienceYears: 9,
    },
    {
      name: "Dr. Arjun Kumar",
      departmentName: "Dermatology",
      specialty: "Dermatology",
      qualification: "MBBS, MD",
      experienceYears: 6,
    },
    {
      name: "Dr. Divya Menon",
      departmentName: "Dermatology",
      specialty: "Dermatology",
      qualification: "MBBS, MD",
      experienceYears: 7,
    },
    {
      name: "Dr. Priya Shah",
      departmentName: "Cardiology",
      specialty: "Cardiology",
      qualification: "MBBS, DM",
      experienceYears: 12,
    },
    {
      name: "Dr. Vikram Reddy",
      departmentName: "Cardiology",
      specialty: "Cardiology",
      qualification: "MBBS, DM",
      experienceYears: 11,
    },
    {
      name: "Dr. Sanjay Iyer",
      departmentName: "Cardiology",
      specialty: "Cardiology",
      qualification: "MBBS, DM",
      experienceYears: 8,
    },
  ];

  for (const item of providerSeed) {
    const department = await Department.findOne({
      name: item.departmentName,
    });

    await Provider.findOneAndUpdate(
      {
        name: item.name,
        departmentId: department._id,
      },
      {
        $set: {
          name: item.name,
          departmentId: department._id,
          specialty: item.specialty,
          qualification: item.qualification,
          experienceYears: item.experienceYears,
          availableDays: [1, 2, 3, 4, 5],
          startTime: "09:00",
          endTime: "17:00",
          slotMinutes: 30,
          active: true,
        },
      },
      { upsert: true, new: true }
    );
  }

  console.log("Departments and providers seeded.");
}

/* =========================================================
   7. MAIN RECEPTIONIST CONVERSATION
========================================================= */



async function classifyDepartmentWithOllama(message) {
  const text = String(message || "").trim().toLowerCase();

  // 1. Handle clear requests before calling the AI.
  // This prevents the small model from misclassifying obvious phrases.
  if (
    /\b(heart specialist|heart doctor|cardiologist|cardiology)\b/i.test(text)
  ) {
    return "cardiology";
  }

  if (
    /\b(dermatologist|dermatology|skin rash|rash|acne|skin itching)\b/i.test(text)
  ) {
    return "dermatology";
  }

  if (
    /\b(general medicine|general physician|fever|cold|cough|headache)\b/i.test(text)
  ) {
    return "general_medicine";
  }

  // 2. Use Ollama for requests not covered by clear keyword rules.
  try {
    const response = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3.2:1b",
        stream: false,
        messages: [
          {
            role: "system",
            content: `Classify a routine appointment request into exactly one slug:
general_medicine
dermatology
cardiology

Fever, cold, cough, headache -> general_medicine
Skin rash, acne, itching -> dermatology
Heart specialist, heart doctor, cardiologist -> cardiology

Reply with only one slug. If unclear, reply unknown.`,
          },
          {
            role: "user",
            content: text,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama returned HTTP ${response.status}`);
    }

    const data = await response.json();

    const result = String(data.message?.content || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z_]/g, "");

    const allowedDepartments = [
      "general_medicine",
      "dermatology",
      "cardiology",
    ];

    return allowedDepartments.includes(result) ? result : null;
  } catch (error) {
    console.error(
      "Ollama department classification failed:",
      error.message
    );

    return null;
  }
}



async function handleReceptionMessage(sessionId, rawMessage) {
  const message = String(rawMessage || "").trim();

  if (!message) {
    return {
      reply: "Please enter a message so I can help you.",
      status: "waiting",
    };
  }

  const normalized = normalizeText(message);

  if (normalized === "restart" || normalized === "start over") {
    await Conversation.deleteOne({ sessionId });

    await saveConversation(sessionId, {
      step: "start",
      reschedulingAppointmentId: "",
      existingAppointmentId: "",
    });

    return {
      reply: askStart(),
      status: "started",
    };
  }

  let state = await getState(sessionId);

  if (!state) {
    state = await saveConversation(sessionId, {
      step: "start",
    });
  }

  /* -------------------------------------------------------
     STEP 1: EXISTING OR NEW PATIENT
  ------------------------------------------------------- */

  if (state.step === "start") {
    if (isYes(message)) {
      await saveConversation(sessionId, {
        step: "existing_patient_lookup",
      });

      return {
        reply:
          "Please enter your registered 10-digit phone number or patient ID, for example CC123456.",
        status: "waiting",
      };
    }

    if (isNo(message)) {
      await saveConversation(sessionId, {
        step: "new_patient_details",
      });

      return {
        reply:
          "Please provide the patient's full name and 10-digit phone number.",
        status: "waiting",
      };
    }

    return {
      reply: askStart(),
      status: "waiting",
    };
  }

  /* -------------------------------------------------------
     STEP 2: LOOK UP EXISTING PATIENT
  ------------------------------------------------------- */

  if (state.step === "existing_patient_lookup") {
    const lookup = parsePatientLookup(message);

    if (!lookup) {
      return {
        reply:
          "Please enter a valid 10-digit registered phone number or patient ID, such as CC123456.",
        status: "waiting",
      };
    }

    const query =
      lookup.type === "phone"
        ? { normalizedPhone: lookup.value }
        : { patientId: lookup.value };

    const patient = await Patient.findOne(query).lean();

    if (!patient) {
      return {
        reply:
          "I could not find a patient with those details. Please check your phone number or patient ID, or type restart to start again.",
        status: "patient_not_found",
      };
    }

    await saveConversation(sessionId, {
      step: "department",
      patientMongoId: String(patient._id),
      patientId: patient.patientId,
      patientName: patient.name,
      reschedulingAppointmentId: "",
      existingAppointmentId: "",
    });

    return {
      reply:
        `Welcome back, ${patient.name}!\n` +
        "Which department do you need? You can choose General Medicine, Dermatology, or Cardiology.",
      status: "patient_found",
      patient,
      departments: await Department.find().sort({ name: 1 }).lean(),
    };
  }

  /* -------------------------------------------------------
     STEP 3: REGISTER NEW PATIENT
  ------------------------------------------------------- */

  if (state.step === "new_patient_details") {
    const details = parseNameAndPhone(message);

    if (!details) {
      return {
        reply:
          "Please enter both the patient's name and a valid 10-digit Indian mobile number. For example: Neela, 9234592345.",
        status: "waiting",
      };
    }

    let patient;

    try {
      patient = await findOrCreatePatient(
        details.name,
        details.phone
      );
    } catch (error) {
      console.error("Patient creation error:", error);

      return {
        reply:
          "I could not register the patient right now. Please try again.",
        status: "error",
      };
    }

    await saveConversation(sessionId, {
      step: "department",
      patientMongoId: String(patient._id),
      patientId: patient.patientId,
      patientName: patient.name,
      reschedulingAppointmentId: "",
      existingAppointmentId: "",
    });

    return {
      reply:
        `Patient registered successfully!\nPatient ID: ${patient.patientId}\n\n` +
        "Which department do you need? You can choose General Medicine, Dermatology, or Cardiology.",
      status: "patient_registered",
      patient,
      departments: await Department.find().sort({ name: 1 }).lean(),
    };
  }

  /* -------------------------------------------------------
     STEP 4: SELECT DEPARTMENT
  ------------------------------------------------------- */



  /* -------------------------------------------------------
     STEP 4: SELECT DEPARTMENT
  ------------------------------------------------------- */


if (state.step === "department") {
  const aiDepartment = await classifyDepartmentWithOllama(message);

  const departmentNames = {
    general_medicine: "General Medicine",
    dermatology: "Dermatology",
    cardiology: "Cardiology",
  };

  let department = null;

  // Try the department identified by Ollama.
  if (aiDepartment && departmentNames[aiDepartment]) {
    department = await Department.findOne({
      name: {
        $regex: new RegExp(
          "^" +
            departmentNames[aiDepartment].replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&"
            ) +
            "$",
          "i"
        ),
      },
    });
  }

  // Fall back to the existing matcher.
  if (!department) {
    department = await findDepartment(message);
  }

  if (!department) {
    return {
      reply:
        "Please select General Medicine, Dermatology, or Cardiology.",
      status: "waiting",
      departments: await Department.find().sort({ name: 1 }).lean(),
    };
  }

  // Find active doctors in the selected department.
  const providers = await Provider.find({
    department: department._id,
    active: true,
  })
    .select("name specialization department")
    .sort({ name: 1 })
    .lean();

  if (!providers.length) {
    return {
      reply:
        `I identified ${department.name}, but no active doctors are currently listed for this department. Please select another department or contact reception.`,
      status: "no_providers",
      departments: await Department.find().sort({ name: 1 }).lean(),
    };
  }

  // Save the department and available doctor IDs.
  await saveConversation(sessionId, {
    step: "provider",
    departmentId: String(department._id),
    departmentName: department.name,
    providerOptions: providers.map((provider) =>
      String(provider._id)
    ),
  });

  return {
    reply:
      `I selected ${department.name} based on your request.\n\n` +
      "Please choose a doctor by entering their number or name:\n\n" +
      providers
        .map(
          (provider, index) =>
            `${index + 1}. ${provider.name}` +
            (provider.specialization
              ? ` — ${provider.specialization}`
              : "")
        )
        .join("\n"),
    status: "providers",
    department,
    providers,
  };
}



  /* -------------------------------------------------------
     STEP 5: SELECT DOCTOR
  ------------------------------------------------------- */

  if (state.step === "provider") {
    const allowedIds = state.providerOptions || [];

    let provider = null;

    if (/^\d+$/.test(message)) {
      const index = Number(message) - 1;

      if (index >= 0 && index < allowedIds.length) {
        provider = await Provider.findById(allowedIds[index]);
      }
    }

    if (!provider) {
      provider = await Provider.findOne({
        _id: { $in: allowedIds },
        active: true,
        name: {
          $regex: message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          $options: "i",
        },
      });
    }

    if (!provider) {
      return {
        reply:
          "Please select a valid doctor from the displayed list.",
        status: "waiting",
      };
    }

    const patient = await Patient.findById(state.patientMongoId);

    if (!patient) {
      return {
        reply:
          "I could not retrieve the patient record. Please type restart to start again.",
        status: "error",
      };
    }

    const existingAppointment = await findExistingAppointment(
      patient._id,
      provider._id
    );

    if (existingAppointment) {
      await saveConversation(sessionId, {
        step: "existing_appointment_found",
        providerId: String(provider._id),
        providerName: provider.name,
        existingAppointmentId: String(existingAppointment._id),
        reschedulingAppointmentId: "",
      });

      return {
        reply: formatExistingAppointment(
          existingAppointment,
          patient
        ),
        status: "already_booked",
        appointment: existingAppointment,
      };
    }

    await saveConversation(sessionId, {
      step: "appointment_date",
      providerId: String(provider._id),
      providerName: provider.name,
      date: "",
      slotOptions: [],
      existingAppointmentId: "",
      reschedulingAppointmentId: "",
    });

    return {
      reply:
        `You selected ${provider.name}.\n` +
        "Please enter your preferred appointment date in YYYY-MM-DD format, for example 2026-10-29.",
      status: "date_required",
      provider,
    };
  }

  /* -------------------------------------------------------
     STEP 6: KEEP / RESCHEDULE / CANCEL
  ------------------------------------------------------- */

  if (state.step === "existing_appointment_found") {
    const patient = await Patient.findById(state.patientMongoId);

    if (!patient) {
      return {
        reply: "Patient record not found. Please type restart.",
        status: "error",
      };
    }

    const appointment = await getAppointmentForPatient(
      state.existingAppointmentId,
      patient._id
    );

    if (!appointment) {
      await saveConversation(sessionId, {
        step: "appointment_date",
        existingAppointmentId: "",
        reschedulingAppointmentId: "",
      });

      return {
        reply:
          "Your previous booking is no longer active. Please select a new appointment date.",
        status: "appointment_not_found",
      };
    }

    // KEEP: do not create another appointment.
    if (isKeepAction(message)) {
      await saveConversation(sessionId, {
        step: "completed",
        existingAppointmentId: String(appointment._id),
        reschedulingAppointmentId: "",
      });

      return {
        reply:
          "Your existing appointment is confirmed and remains booked. No duplicate appointment was created.\n\n" +
          formatAppointmentDetails(appointment, patient),
        status: "already_booked",
        appointment,
      };
    }

    // CANCEL: release the slot by changing the status.
    if (isCancelAction(message)) {
      const cancelled = await Appointment.findOneAndUpdate(
        {
          _id: appointment._id,
          patient: patient._id,
          status: "BOOKED",
        },
        {
          $set: { status: "CANCELLED" },
        },
        { new: true }
      )
        .populate("department", "name")
        .populate("provider", "name")
        .lean();

      if (!cancelled) {
        return {
          reply:
            "I could not cancel the appointment because its status has changed. Please check your bookings.",
          status: "error",
        };
      }

      await saveConversation(sessionId, {
        step: "completed",
        existingAppointmentId: "",
        reschedulingAppointmentId: "",
      });

      return {
        reply:
          "Your appointment has been cancelled successfully.\n\n" +
          formatAppointmentDetails(
            { ...cancelled, status: "CANCELLED" },
            patient
          ) +
          "\n\nYou can type restart if you would like to book another appointment.",
        status: "cancelled",
        appointment: cancelled,
      };
    }

    // RESCHEDULE: preserve old booking until a replacement succeeds.
    if (isRescheduleAction(message)) {
      await saveConversation(sessionId, {
        step: "appointment_date",
        reschedulingAppointmentId: String(appointment._id),
        existingAppointmentId: String(appointment._id),
        providerId: String(appointment.provider._id),
        providerName: appointment.provider.name,
        departmentId: String(appointment.department._id),
        departmentName: appointment.department.name,
        date: "",
        slotOptions: [],
      });

      return {
        reply:
          "Let's reschedule your appointment.\n" +
          "Your current booking will remain active until the new appointment is successfully booked.\n\n" +
          "Please enter the new date in YYYY-MM-DD format, for example 2026-10-30.",
        status: "reschedule_started",
      };
    }

    return {
      reply:
        'Please choose one of these options: "keep", "reschedule", or "cancel".',
      status: "waiting",
    };
  }

  /* -------------------------------------------------------
     STEP 7: SELECT APPOINTMENT DATE
  ------------------------------------------------------- */

  if (state.step === "appointment_date") {
    const date = parseDateInput(message);

    if (!date) {
      return {
        reply:
          "Please enter a valid date in YYYY-MM-DD format, for example 2026-10-29. You can also type today or tomorrow.",
        status: "waiting",
      };
    }

    if (date < todayLocal()) {
      return {
        reply:
          "That date is in the past. Please select today or a future date.",
        status: "waiting",
      };
    }

    const provider = await Provider.findById(state.providerId);

    if (!provider || !provider.active) {
      return {
        reply:
          "The selected doctor is unavailable. Please type restart to select another doctor.",
        status: "error",
      };
    }

    const slots = await getAvailableSlots(provider, date);

    if (!slots.length) {
      return {
        reply:
          `No available appointments for ${provider.name} on ${friendlyDate(date)}.\nPlease enter another date.`,
        status: "no_slots",
      };
    }

    await saveConversation(sessionId, {
      step: "appointment_slot",
      date,
      slotOptions: slots,
    });

    return {
      reply:
        `Available slots for ${provider.name} on ${friendlyDate(date)}:\n\n` +
        formatSlots(slots),
      status: "slots",
      slots,
      date,
    };
  }

  /* -------------------------------------------------------
     STEP 8: SELECT SLOT AND CREATE APPOINTMENT
  ------------------------------------------------------- */

  if (state.step === "appointment_slot") {
    const patient = await Patient.findById(state.patientMongoId);
    const provider = await Provider.findById(state.providerId);
    const department = await Department.findById(state.departmentId);

    if (!patient || !provider || !department) {
      return {
        reply:
          "I could not retrieve the patient, doctor, or department. Please type restart to start again.",
        status: "error",
      };
    }

    const slots = state.slotOptions || [];
    let selectedSlot = null;

    // Accept a numbered selection.
    if (/^\d+$/.test(message)) {
      const index = Number(message) - 1;

      if (index >= 0 && index < slots.length) {
        selectedSlot = slots[index];
      }
    }

    // Also accept the slot's start time, such as 10:30.
    if (!selectedSlot) {
      const timeMatch = message.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/);

      if (timeMatch) {
        const requestedTime = timeMatch[0].padStart(5, "0");

        selectedSlot = slots.find(
          (slot) => slot.startTime === requestedTime
        );
      }
    }

    if (!selectedSlot) {
      return {
        reply:
          "Please select a valid slot number or start time from the displayed available slots.",
        status: "waiting",
      };
    }

    const date = state.date;

    if (!date || date < todayLocal()) {
      await saveConversation(sessionId, {
        step: "appointment_date",
        slotOptions: [],
      });

      return {
        reply:
          "That date is no longer valid. Please enter a new appointment date.",
        status: "date_required",
      };
    }

    // Recheck all current bookings immediately before saving.
    // This prevents a previously displayed slot from being
    // booked after another patient has taken it.
    const latestSlots = await getAvailableSlots(provider, date);

    const stillAvailable = latestSlots.some(
      (slot) => slot.startTime === selectedSlot.startTime
    );

    if (!stillAvailable) {
      await saveConversation(sessionId, {
        step: "appointment_slot",
        slotOptions: latestSlots,
      });

      return {
        reply: latestSlots.length
          ? "That slot is no longer available. Please choose another slot:\n\n" +
          formatSlots(latestSlots)
          : "That slot is no longer available. Please enter another date.",
        status: "slot_unavailable",
        slots: latestSlots,
      };
    }

    // Find any other active appointment for the same doctor.
    // When rescheduling, ignore the old appointment itself.
    const duplicateQuery = {
      patient: patient._id,
      provider: provider._id,
      status: "BOOKED",
      date: { $gte: todayLocal() },
    };

    if (state.reschedulingAppointmentId) {
      duplicateQuery._id = {
        $ne: new mongoose.Types.ObjectId(
          state.reschedulingAppointmentId
        ),
      };
    }

    const existingBooking = await Appointment.findOne(
      duplicateQuery
    )
      .populate("department", "name")
      .populate("provider", "name")
      .lean();

    if (existingBooking) {
      await saveConversation(sessionId, {
        step: "existing_appointment_found",
        existingAppointmentId: String(existingBooking._id),
        reschedulingAppointmentId: "",
      });

      return {
        reply: formatExistingAppointment(existingBooking, patient),
        status: "already_booked",
        appointment: existingBooking,
      };
    }

    // Validate the old booking before starting a reschedule.
    let oldAppointment = null;

    if (state.reschedulingAppointmentId) {
      oldAppointment = await Appointment.findOne({
        _id: state.reschedulingAppointmentId,
        patient: patient._id,
        status: "BOOKED",
      });

      if (!oldAppointment) {
        await saveConversation(sessionId, {
          step: "appointment_date",
          existingAppointmentId: "",
          reschedulingAppointmentId: "",
        });

        return {
          reply:
            "Your original appointment is no longer active. Please select a date for a new booking.",
          status: "appointment_not_found",
        };
      }
    }

    let newAppointment;

    try {
      // Create the replacement first. The old booking remains
      // active if this insert fails.
      newAppointment = await Appointment.create({
        patient: patient._id,
        provider: provider._id,
        department: department._id,
        date,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        status: "BOOKED",
      });
    } catch (error) {
      if (error.code === 11000) {
        const refreshedSlots = await getAvailableSlots(
          provider,
          date
        );

        await saveConversation(sessionId, {
          step: refreshedSlots.length
            ? "appointment_slot"
            : "appointment_date",
          slotOptions: refreshedSlots,
        });

        return {
          reply: refreshedSlots.length
            ? "Another patient has just booked that time. Please choose a different slot:\n\n" +
            formatSlots(refreshedSlots)
            : "That slot has just been booked. Please select another date.",
          status: "slot_unavailable",
          slots: refreshedSlots,
        };
      }

      throw error;
    }

    // Only after the replacement booking succeeds do we cancel
    // the old booking.
    if (oldAppointment) {
      const cancelledOldAppointment =
        await Appointment.findOneAndUpdate(
          {
            _id: oldAppointment._id,
            patient: patient._id,
            status: "BOOKED",
          },
          {
            $set: { status: "CANCELLED" },
          },
          { new: true }
        );

      if (!cancelledOldAppointment) {
        // The original booking changed unexpectedly. Cancel the
        // replacement to avoid leaving two active bookings.
        await Appointment.updateOne(
          {
            _id: newAppointment._id,
            status: "BOOKED",
          },
          {
            $set: { status: "CANCELLED" },
          }
        );

        return {
          reply:
            "Your original appointment changed while rescheduling. The replacement booking was not retained. Please check your appointments and try again.",
          status: "reschedule_failed",
        };
      }
    }

    const savedAppointment = await Appointment.findById(
      newAppointment._id
    )
      .populate("department", "name")
      .populate("provider", "name")
      .lean();

    await saveConversation(sessionId, {
      step: "completed",
      existingAppointmentId: String(newAppointment._id),
      reschedulingAppointmentId: "",
      date,
      slotOptions: [],
    });

    if (oldAppointment) {
      return {
        reply:
          "Your appointment has been rescheduled successfully!\n\n" +
          "Your previous appointment has been cancelled, and your new appointment is confirmed.\n\n" +
          formatAppointmentDetails(savedAppointment, patient),
        status: "rescheduled",
        appointment: savedAppointment,
      };
    }

    return {
      reply:
        "Your appointment has been booked successfully!\n\n" +
        formatAppointmentDetails(savedAppointment, patient) +
        "\n\nThank you for choosing CareConnect.",
      status: "completed",
      appointment: savedAppointment,
    };
  }

  /* -------------------------------------------------------
     STEP 9: COMPLETED CONVERSATION
  ------------------------------------------------------- */

  if (state.step === "completed") {
    return {
      reply:
        "This booking process is complete. To start another booking, type restart.",
      status: "completed",
    };
  }

  return {
    reply:
      "I could not identify the current step. Please type restart to begin again.",
    status: "waiting",
  };
}

/* =========================================================
   8. API ROUTES
========================================================= */

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "ai-receptionist-api",
  });
});

app.get("/api/departments", async (req, res, next) => {
  try {
    const departments = await Department.find()
      .sort({ name: 1 })
      .lean();

    res.json(departments);
  } catch (error) {
    next(error);
  }
});

app.get("/api/providers", async (req, res, next) => {
  try {
    const filter = { active: true };

    if (
      req.query.departmentId &&
      mongoose.Types.ObjectId.isValid(req.query.departmentId)
    ) {
      filter.departmentId = req.query.departmentId;
    }

    const providers = await Provider.find(filter)
      .populate("departmentId", "name")
      .sort({ name: 1 })
      .lean();

    res.json(providers);
  } catch (error) {
    next(error);
  }
});

app.get("/api/patients/:patientId", async (req, res, next) => {
  try {
    const value = req.params.patientId;

    const patient = await Patient.findOne({
      $or: [
        { patientId: value.toUpperCase() },
        ...(mongoose.Types.ObjectId.isValid(value)
          ? [{ _id: value }]
          : []),
      ],
    }).lean();

    if (!patient) {
      return res.status(404).json({
        message: "Patient not found.",
      });
    }

    res.json(patient);
  } catch (error) {
    next(error);
  }
});

app.get("/api/appointments", async (req, res, next) => {
  try {
    const filter = {};

    if (req.query.patientId) {
      const value = String(req.query.patientId);

      const patient = await Patient.findOne({
        $or: [
          { patientId: value.toUpperCase() },
          ...(mongoose.Types.ObjectId.isValid(value)
            ? [{ _id: value }]
            : []),
        ],
      }).lean();

      if (!patient) {
        return res.json([]);
      }

      filter.patient = patient._id;
    }

    if (req.query.status) {
      filter.status = String(req.query.status).toUpperCase();
    }

    const appointments = await Appointment.find(filter)
      .populate("patient", "patientId name phone")
      .populate("provider", "name specialty")
      .populate("department", "name")
      .sort({ date: 1, startTime: 1 })
      .lean();

    res.json(appointments);
  } catch (error) {
    next(error);
  }
});

app.post("/api/agent/reception", async (req, res, next) => {
  try {
    const { sessionId, message } = req.body || {};

    if (!sessionId || typeof sessionId !== "string") {
      return res.status(400).json({
        message: "sessionId is required.",
      });
    }

    if (typeof message !== "string") {
      return res.status(400).json({
        message: "message must be a string.",
      });
    }

    const result = await handleReceptionMessage(
      sessionId.trim(),
      message
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// API 404 handler
app.use((req, res) => {
  res.status(404).json({
    message: "API route not found.",
  });
});

// Central error handler
app.use((error, req, res, next) => {
  console.error("API error:", error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    message: "An internal server error occurred.",
    ...(process.env.NODE_ENV !== "production"
      ? { detail: error.message }
      : {}),
  });
});

/* =========================================================
   9. CONNECT TO MONGODB AND START SERVER
========================================================= */

async function startServer() {
  try {
    await mongoose.connect(MONGODB_URI);

    console.log("Connected to MongoDB:", MONGODB_URI);

    // Create/update indexes before accepting requests.
    await Promise.all([
      Patient.syncIndexes(),
      Appointment.syncIndexes(),
      Conversation.syncIndexes(),
      Department.syncIndexes(),
    ]);

    await seedData();

    app.listen(PORT, () => {
      console.log(`CareConnect API running on http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error("Failed to start CareConnect API:", error);
    process.exit(1);
  }
}

startServer();