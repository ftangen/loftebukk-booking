const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'mekk2024';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'loftebukk-hemmelighet-42',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8 hours
}));

// Public: get approved bookings for calendar
app.get('/api/bookings', (req, res) => {
  res.json(db.getApprovedBookings());
});

// Public: submit new booking request
app.post('/api/bookings', (req, res) => {
  const { name, phone, license_plate, date, start_time, end_time, notes } = req.body;

  if (!name?.trim() || !phone?.trim() || !license_plate?.trim() || !date || !start_time || !end_time) {
    return res.status(400).json({ error: 'Alle obligatoriske felt må fylles ut.' });
  }

  // Block Thursdays
  const dayOfWeek = new Date(date + 'T12:00:00').getDay();
  if (dayOfWeek === 4) {
    return res.status(400).json({ error: 'Torsdager er reservert for ungdomsklubben og kan ikke bookes.' });
  }

  if (start_time >= end_time) {
    return res.status(400).json({ error: 'Sluttid må være etter starttid.' });
  }

  const conflict = db.checkConflict(date, start_time, end_time);
  if (conflict) {
    return res.status(409).json({ error: 'Løftebukken er allerede booket i dette tidsrommet. Velg en annen tid.' });
  }

  const booking = db.createBooking({ name: name.trim(), phone: phone.trim(), license_plate: license_plate.trim().toUpperCase(), date, start_time, end_time, notes: notes?.trim() });
  res.status(201).json({ message: 'Booking-forespørsel mottatt! En admin vil behandle den snart.', id: booking.id });
});

// Admin: login
app.post('/api/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Feil passord.' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/admin/me', (req, res) => {
  res.json({ loggedIn: !!req.session.isAdmin });
});

function requireAdmin(req, res, next) {
  if (req.session.isAdmin) return next();
  res.status(401).json({ error: 'Ikke innlogget.' });
}

// Admin: all bookings
app.get('/api/admin/bookings', requireAdmin, (req, res) => {
  res.json(db.getAllBookings());
});

// Admin: approve
app.put('/api/admin/bookings/:id/approve', requireAdmin, (req, res) => {
  const booking = db.updateBookingStatus(req.params.id, 'approved');
  if (!booking) return res.status(404).json({ error: 'Booking ikke funnet.' });
  res.json(booking);
});

// Admin: reject
app.put('/api/admin/bookings/:id/reject', requireAdmin, (req, res) => {
  const booking = db.updateBookingStatus(req.params.id, 'rejected');
  if (!booking) return res.status(404).json({ error: 'Booking ikke funnet.' });
  res.json(booking);
});

// Admin: delete
app.delete('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  db.deleteBooking(req.params.id);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`\n  Løftebukk-booking kjører:`);
  console.log(`  Brukersiden:  http://localhost:${PORT}`);
  console.log(`  Admin-panel:  http://localhost:${PORT}/admin.html`);
  console.log(`  Admin-passord: ${ADMIN_PASSWORD}\n`);
  console.log(`  Tips: sett ADMIN_PASSWORD miljøvariabel for å endre passordet.\n`);
});
