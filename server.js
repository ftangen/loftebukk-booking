const express = require('express');
const session = require('express-session');
const path = require('path');
const cron = require('node-cron');
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
app.get('/api/bookings', (_req, res) => {
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
  mailer.notifyVolunteerSubmitted(booking);

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

// Public: cancel booking via token link
app.get('/cancel/:token', (req, res) => {
  const booking = db.getBookingByToken(req.params.token);

  if (!booking) {
    return res.send(cancelPage('not-found'));
  }
  if (booking.status === 'cancelled') {
    return res.send(cancelPage('already-cancelled', booking));
  }
  if (booking.status === 'rejected' || booking.status === 'approved') {
    const wasApproved = booking.status === 'approved';
    db.cancelByToken(req.params.token);
    if (wasApproved) mailer.notifyAdminBookingCancelled(booking);
    return res.send(cancelPage('success', booking));
  }
  // pending
  db.cancelByToken(req.params.token);
  return res.send(cancelPage('success', booking));
});

function cancelPage(status, booking) {
  const NO_MONTHS = ['januar','februar','mars','april','mai','juni','juli','august','september','oktober','november','desember'];
  const NO_DAYS = ['søndag','mandag','tirsdag','onsdag','torsdag','fredag','lørdag'];
  const dateStr = booking
    ? (() => { const d = new Date(booking.date + 'T12:00:00'); return `${NO_DAYS[d.getDay()]} ${d.getDate()}. ${NO_MONTHS[d.getMonth()]}` })()
    : '';

  const states = {
    'success':           { icon: '✅', color: '#14532d', grad: '#16a34a', title: 'Booking kansellert',      msg: `Bookingen din ${dateStr ? `for ${dateStr}` : ''} er kansellert.` },
    'already-cancelled': { icon: '✓',  color: '#334155', grad: '#475569', title: 'Allerede kansellert',     msg: 'Denne bookingen er allerede kansellert.' },
    'not-found':         { icon: '❌', color: '#7f1d1d', grad: '#dc2626', title: 'Lenke ikke funnet',       msg: 'Kanselleringslenken er ugyldig eller bookingen er slettet.' },
  };
  const s = states[status] || states['not-found'];

  return `<!DOCTYPE html><html lang="no"><head><meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${s.title} — Løftebukk-booking</title>
  <script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-slate-100 min-h-screen flex items-center justify-center p-5 font-sans">
  <div class="bg-white rounded-2xl shadow-lg w-full max-w-sm overflow-hidden text-center">
    <div style="background:linear-gradient(135deg,${s.color},${s.grad})" class="text-white px-6 py-8">
      <div class="text-5xl mb-3">${s.icon}</div>
      <h1 class="text-xl font-extrabold">${s.title}</h1>
    </div>
    <div class="px-6 py-8">
      <p class="text-slate-600 mb-6">${s.msg}</p>
      <a href="/" class="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors text-sm">
        Tilbake til booking-siden →
      </a>
    </div>
  </div>
</body></html>`;
}

// Cron: send påminnelse kl. 18:00 dagen før godkjente bookinger
cron.schedule('0 18 * * *', async () => {
  const bookings = db.getTomorrowsApprovedBookings();
  console.log(`[cron] Påminnelse: sender til ${bookings.length} booking(er) for i morgen`);
  for (const booking of bookings) {
    await mailer.notifyVolunteerReminder(booking);
  }
});

app.listen(PORT, () => {
  console.log(`\n  Løftebukk-booking kjører:`);
  console.log(`  Brukersiden:  http://localhost:${PORT}`);
  console.log(`  Admin-panel:  http://localhost:${PORT}/admin.html`);
  console.log(`  E-post:       ${process.env.SMTP_USER ? `✓ konfigurert (${process.env.SMTP_USER})` : '✗ ikke konfigurert (sett SMTP_USER/SMTP_PASS/ADMIN_EMAIL)'}\n`);
});
