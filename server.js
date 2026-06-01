const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./db');
const mailer = require('./mailer');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'mekk2024';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'loftebukk-hemmelighet-42',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }
}));

// Public: get approved + pending bookings for calendar
app.get('/api/bookings', (req, res) => {
  res.json(db.getPublicBookings());
});

// Public: submit new booking request
app.post('/api/bookings', async (req, res) => {
  const { name, phone, email, license_plate, date, start_time, end_time, notes } = req.body;

  if (!name?.trim() || !phone?.trim() || !email?.trim() || !license_plate?.trim() || !date || !start_time || !end_time || !notes?.trim()) {
    return res.status(400).json({ error: 'Alle obligatoriske felt må fylles ut.' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Ugyldig e-postadresse.' });
  }

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

  const booking = db.createBooking({
    name: name.trim(), phone: phone.trim(), email: email.trim().toLowerCase(),
    license_plate: license_plate.trim().toUpperCase(), date, start_time, end_time, notes: notes.trim(),
  });

  // Fire-and-forget — e-postfeil stopper ikke bookingen
  mailer.notifyAdminNewBooking(booking);

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

app.get('/api/admin/bookings', requireAdmin, (_req, res) => {
  res.json(db.getAllBookings());
});

app.put('/api/admin/bookings/:id/approve', requireAdmin, async (req, res) => {
  const booking = db.updateBookingStatus(req.params.id, 'approved');
  if (!booking) return res.status(404).json({ error: 'Booking ikke funnet.' });
  mailer.notifyVolunteerApproved(booking);
  res.json(booking);
});

app.put('/api/admin/bookings/:id/reject', requireAdmin, async (req, res) => {
  const booking = db.updateBookingStatus(req.params.id, 'rejected');
  if (!booking) return res.status(404).json({ error: 'Booking ikke funnet.' });
  mailer.notifyVolunteerRejected(booking);
  res.json(booking);
});

app.delete('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  db.deleteBooking(req.params.id);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`\n  Løftebukk-booking kjører:`);
  console.log(`  Brukersiden:  http://localhost:${PORT}`);
  console.log(`  Admin-panel:  http://localhost:${PORT}/admin.html`);
  console.log(`  E-post:       ${process.env.SMTP_USER ? `✓ konfigurert (${process.env.SMTP_USER})` : '✗ ikke konfigurert (sett SMTP_USER/SMTP_PASS/ADMIN_EMAIL)'}\n`);
});
