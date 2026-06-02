const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataDir = path.join(__dirname, 'data');
const dbFile = path.join(dataDir, 'bookings.json');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, JSON.stringify({ nextId: 1, bookings: [] }));

function readDb() {
  return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
}

function writeDb(data) {
  fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
}

function getPublicBookings() {
  const { bookings } = readDb();
  return bookings
    .filter(b => b.status === 'approved' || b.status === 'pending')
    .map(({ id, name, date, start_time, end_time, status }) => ({ id, name, date, start_time, end_time, status }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
}

function getAllBookings() {
  const { bookings } = readDb();
  return [...bookings].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function createBooking({ name, phone, email, license_plate, date, start_time, end_time, notes }) {
  const db = readDb();
  const booking = {
    id: db.nextId++,
    name, phone, email, license_plate, date, start_time, end_time,
    notes: notes || '',
    status: 'pending',
    cancel_token: crypto.randomBytes(24).toString('hex'),
    created_at: new Date().toISOString(),
  };
  db.bookings.push(booking);
  writeDb(db);
  return booking;
}

function checkConflict(date, start_time, end_time, excludeId = null) {
  const { bookings } = readDb();
  return bookings.find(b =>
    b.status === 'approved' &&
    b.date === date &&
    b.id !== excludeId &&
    b.start_time < end_time &&
    b.end_time > start_time
  ) || null;
}

function updateBookingStatus(id, status, { adminName = '', reason = '' } = {}) {
  const db = readDb();
  const booking = db.bookings.find(b => b.id === parseInt(id));
  if (!booking) return null;
  booking.status = status;
  booking.action_at = new Date().toISOString();
  if (status === 'approved') {
    booking.approved_by = adminName;
    delete booking.rejected_by;
    delete booking.rejection_reason;
  }
  if (status === 'rejected') {
    booking.rejected_by = adminName;
    booking.rejection_reason = reason;
    delete booking.approved_by;
  }
  writeDb(db);
  return booking;
}

function getBookingByToken(token) {
  return readDb().bookings.find(b => b.cancel_token === token) || null;
}

function cancelByToken(token) {
  const db = readDb();
  const booking = db.bookings.find(b => b.cancel_token === token);
  if (!booking) return null;
  booking.status = 'cancelled';
  writeDb(db);
  return booking;
}

function getTomorrowsApprovedBookings() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().slice(0, 10);
  return readDb().bookings.filter(b => b.status === 'approved' && b.date === dateStr);
}

function deleteBooking(id) {
  const db = readDb();
  db.bookings = db.bookings.filter(b => b.id !== parseInt(id));
  writeDb(db);
}

function getStats() {
  const { bookings } = readDb();

  const byStatus = s => bookings.filter(b => b.status === s);
  const hours = list => list.reduce((sum, b) => sum + (parseInt(b.end_time) - parseInt(b.start_time)), 0);

  const approved = byStatus('approved');
  const now = new Date();
  const thisMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const thisMonthApproved = approved.filter(b => b.date.startsWith(thisMonthPrefix));

  // Top 5 bookere (by approved bookings)
  const bookerMap = {};
  approved.forEach(b => { bookerMap[b.name] = (bookerMap[b.name] || 0) + 1; });
  const topBookers = Object.entries(bookerMap)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  // Admin-aktivitet
  const adminMap = {};
  bookings.forEach(b => {
    if (b.approved_by) {
      adminMap[b.approved_by] = adminMap[b.approved_by] || { approved: 0, rejected: 0 };
      adminMap[b.approved_by].approved++;
    }
    if (b.rejected_by) {
      adminMap[b.rejected_by] = adminMap[b.rejected_by] || { approved: 0, rejected: 0 };
      adminMap[b.rejected_by].rejected++;
    }
  });
  const adminActivity = Object.entries(adminMap)
    .map(([name, counts]) => ({ name, ...counts }))
    .sort((a, b) => (b.approved + b.rejected) - (a.approved + a.rejected));

  // Siste 6 måneder
  const monthly = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('no-NO', { month: 'short', year: '2-digit' });
    const list = approved.filter(b => b.date.startsWith(prefix));
    monthly.push({ label, count: list.length, hours: hours(list) });
  }

  return {
    total: bookings.length,
    pending: byStatus('pending').length,
    approved: approved.length,
    rejected: byStatus('rejected').length,
    cancelled: byStatus('cancelled').length,
    totalHours: hours(approved),
    thisMonthCount: thisMonthApproved.length,
    thisMonthHours: hours(thisMonthApproved),
    topBookers,
    adminActivity,
    monthly,
  };
}

module.exports = {
  getPublicBookings, getAllBookings, createBooking, checkConflict,
  updateBookingStatus, getBookingByToken, cancelByToken,
  getTomorrowsApprovedBookings, deleteBooking, getStats,
};
