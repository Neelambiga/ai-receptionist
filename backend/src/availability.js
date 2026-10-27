const { Appointment } = require('./models');
const { isValidDateString, timeToMinutes, minutesToTime } = require('./utils');

async function getAvailableSlots(provider, date) {
  if (!isValidDateString(date)) {
    const error = new Error('Date must be a valid YYYY-MM-DD date.');
    error.status = 400;
    throw error;
  }

  const requestedDate = new Date(`${date}T00:00:00.000Z`);
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  if (requestedDate < todayUtc) {
    const error = new Error('Appointments cannot be booked in the past.');
    error.status = 400;
    throw error;
  }

  if (!provider.workingDays.includes(requestedDate.getUTCDay())) return [];

  const start = timeToMinutes(provider.workingStart);
  const end = timeToMinutes(provider.workingEnd);
  const duration = provider.slotMinutes;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || duration <= 0) {
    throw new Error('Provider schedule configuration is invalid.');
  }

  const existing = await Appointment.find({ provider: provider._id, date, status: 'booked' }).select('startTime endTime').lean();
  const slots = [];
  for (let minute = start; minute + duration <= end; minute += duration) {
    const slotStart = minutesToTime(minute);
    const slotEnd = minutesToTime(minute + duration);
    const conflict = existing.some(a => timeToMinutes(a.startTime) < minute + duration && minute < timeToMinutes(a.endTime));
    // For same-day requests, do not offer a slot that has already started.
    const now = new Date();
    const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const nowMinute = now.getHours() * 60 + now.getMinutes();
    if (date === localToday && minute <= nowMinute) continue;
    if (!conflict) slots.push({ startTime: slotStart, endTime: slotEnd });
  }
  return slots;
}

module.exports = { getAvailableSlots };
