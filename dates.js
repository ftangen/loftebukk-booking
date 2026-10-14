// Datohjelpere for bookinger som kan gå over flere døgn.
// Eldre bookinger mangler end_date — da er sluttdato lik startdato.

function endDate(b) { return b.end_date || b.date; }

function isMultiDay(b) { return endDate(b) !== b.date; }

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
}

function dayOfWeek(dateStr) { return new Date(dateStr + 'T00:00:00Z').getUTCDay(); }

function thursdaysInRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (dayOfWeek(d) === 4) out.push(d);
  return out;
}

function bookingHours(b) {
  return daysBetween(b.date, endDate(b)) * 24 + parseInt(b.end_time) - parseInt(b.start_time);
}

module.exports = { endDate, isMultiDay, addDays, daysBetween, dayOfWeek, thursdaysInRange, bookingHours };
