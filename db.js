const fs = require('fs');
const path = require('path');

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

function getApprovedBookings() {
  const { bookings } = readDb();
  return bookings
    .filter(b => b.status === 'approved')
    .map(({ id, name, date, start_time, end_time }) => ({ id, name, date, start_time, end_time }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
}

function getAllBookings() {
  const { bookings } = readDb();
  return [...bookings].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function createBooking({ name, phone, license_plate, date, start_time, end_time, notes }) {
  const db = readDb();
  const booking = {
    id: db.nextId++,
    name, phone, license_plate, date, start_time, end_time,
    notes: notes || '',
    status: 'pending',
    created_at: new Date().toISOString(),
  };
  db.bookings.push(booking);
  writeDb(db);
  return booking;
}

// Returns conflicting booking or null
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

function updateBookingStatus(id, status) {
  const db = readDb();
  const booking = db.bookings.find(b => b.id === parseInt(id));
  if (!booking) return null;
  booking.status = status;
  writeDb(db);
  return booking;
}

function deleteBooking(id) {
  const db = readDb();
  db.bookings = db.bookings.filter(b => b.id !== parseInt(id));
  writeDb(db);
}

module.exports = { getApprovedBookings, getAllBookings, createBooking, checkConflict, updateBookingStatus, deleteBooking };
