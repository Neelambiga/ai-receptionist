const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true }
}, { timestamps: true });

const providerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
  active: { type: Boolean, default: true },
  workingStart: { type: String, default: '09:00' },
  workingEnd: { type: String, default: '17:00' },
  slotMinutes: { type: Number, default: 30, min: 10, max: 120 },
  workingDays: { type: [Number], default: [1, 2, 3, 4, 5, 6] } // JS: Sun=0
}, { timestamps: true });

const patientSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  phone: { type: String, required: true, trim: true },
  normalizedPhone: { type: String, required: true, unique: true, index: true },
  email: { type: String, trim: true, lowercase: true, default: '' }
}, { timestamps: true });

const appointmentSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  provider: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true, index: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  startTime: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
  endTime: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
  reason: { type: String, trim: true, maxlength: 500, default: '' },
  status: { type: String, enum: ['booked', 'cancelled'], default: 'booked' }
}, { timestamps: true });

appointmentSchema.index({ provider: 1, date: 1, startTime: 1, status: 1 });

module.exports = {
  Department: mongoose.model('Department', departmentSchema),
  Provider: mongoose.model('Provider', providerSchema),
  Patient: mongoose.model('Patient', patientSchema),
  Appointment: mongoose.model('Appointment', appointmentSchema)
};
