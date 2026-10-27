function normalizePhone(phone) {
  return String(phone || '').replace(/[^\d+]/g, '');
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function timeToMinutes(value) {
  if (!/^\d{2}:\d{2}$/.test(String(value || ''))) return NaN;
  const [h, m] = value.split(':').map(Number);
  if (h > 23 || m > 59) return NaN;
  return h * 60 + m;
}

function minutesToTime(value) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

module.exports = { normalizePhone, isValidDateString, timeToMinutes, minutesToTime, overlaps };
