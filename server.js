const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const bcrypt = require('bcryptjs');
const db = require('./db');
const mailer = require('./mailer');

const app = express();
const PORT = process.env.PORT || 3000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'loftebukk-hemmelighet-42',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 },
}));

// ── Public API ──────────────────────────────────────────
app.get('/api/bookings', (_req, res) => {
  res.json(db.getPublicBookings());
});

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
  if (db.checkConflict(date, start_time, end_time)) {
    return res.status(409).json({ error: 'Løftebukken er allerede booket i dette tidsrommet. Velg en annen tid.' });
  }

  const booking = db.createBooking({
    name: name.trim(), phone: phone.trim(), email: email.trim().toLowerCase(),
    license_plate: license_plate.trim().toUpperCase(), date, start_time, end_time, notes: notes.trim(),
  });

  mailer.notifyAdminNewBooking(booking, getAdminEmails());
  mailer.notifyVolunteerSubmitted(booking);

  res.status(201).json({ message: 'Booking-forespørsel mottatt! En admin vil behandle den snart.', id: booking.id });
});

// ── Cancel via token ────────────────────────────────────
app.get('/cancel/:token', (req, res) => {
  const booking = db.getBookingByToken(req.params.token);
  if (!booking) return res.send(cancelPage('not-found'));
  if (booking.status === 'cancelled') return res.send(cancelPage('already-cancelled', booking));

  const wasApproved = booking.status === 'approved';
  db.cancelByToken(req.params.token);
  if (wasApproved) mailer.notifyAdminBookingCancelled(booking, getAdminEmails());
  res.send(cancelPage('success', booking));
});

function cancelPage(status, booking) {
  const NO_MONTHS = ['januar','februar','mars','april','mai','juni','juli','august','september','oktober','november','desember'];
  const NO_DAYS = ['søndag','mandag','tirsdag','onsdag','torsdag','fredag','lørdag'];
  const dateStr = booking
    ? (() => { const d = new Date(booking.date + 'T12:00:00'); return `${NO_DAYS[d.getDay()]} ${d.getDate()}. ${NO_MONTHS[d.getMonth()]}`; })()
    : '';
  const states = {
    'success':           { icon: '✅', c1: '#14532d', c2: '#16a34a', title: 'Booking kansellert',    msg: `Bookingen din ${dateStr ? `for ${dateStr}` : ''} er kansellert.` },
    'already-cancelled': { icon: '✓',  c1: '#334155', c2: '#475569', title: 'Allerede kansellert',   msg: 'Denne bookingen er allerede kansellert.' },
    'not-found':         { icon: '❌', c1: '#7f1d1d', c2: '#dc2626', title: 'Lenke ikke funnet',     msg: 'Kanselleringslenken er ugyldig eller bookingen er slettet.' },
  };
  const s = states[status] || states['not-found'];
  return `<!DOCTYPE html><html lang="no"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${s.title}</title><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-slate-100 min-h-screen flex items-center justify-center p-5 font-sans">
  <div class="bg-white rounded-2xl shadow-lg w-full max-w-sm overflow-hidden text-center">
    <div style="background:linear-gradient(135deg,${s.c1},${s.c2})" class="text-white px-6 py-8">
      <div class="text-5xl mb-3">${s.icon}</div>
      <h1 class="text-xl font-extrabold">${s.title}</h1>
    </div>
    <div class="px-6 py-8">
      <p class="text-slate-600 mb-6">${s.msg}</p>
      <a href="/" class="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors text-sm">Tilbake til booking-siden →</a>
    </div>
  </div>
</body></html>`;
}

// ── Admin auth ──────────────────────────────────────────
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  const name = db.getAdminNames().find(n => n.toLowerCase() === username?.toLowerCase().trim());
  if (!name) return res.status(401).json({ error: 'Feil brukernavn eller passord.' });

  const hash = db.getAdminHash(name);
  if (!hash) {
    // First login — must set own password
    req.session.pendingSetup = name;
    return res.json({ needsSetup: true });
  }

  const valid = await bcrypt.compare(password, hash);
  if (!valid) return res.status(401).json({ error: 'Feil brukernavn eller passord.' });

  req.session.isAdmin = true;
  req.session.adminName = name;
  res.json({ ok: true, name });
});

// First-time password setup
app.post('/api/admin/setup-password', async (req, res) => {
  if (!req.session.pendingSetup) return res.status(403).json({ error: 'Ikke autorisert.' });
  const { password } = req.body;
  if (!password || password.length < 8) return res.status(400).json({ error: 'Passord må være minst 8 tegn.' });

  const hash = await bcrypt.hash(password, 10);
  db.setAdminHash(req.session.pendingSetup, hash);
  req.session.isAdmin = true;
  req.session.adminName = req.session.pendingSetup;
  delete req.session.pendingSetup;
  res.json({ ok: true, name: req.session.adminName });
});

// Update own email
app.post('/api/admin/set-email', requireAdmin, (req, res) => {
  const { email } = req.body;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Ugyldig e-postadresse.' });
  }
  db.setAdminEmail(req.session.adminName, email?.trim() || null);
  res.json({ ok: true });
});

// Change own password
app.post('/api/admin/change-password', requireAdmin, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Nytt passord må være minst 8 tegn.' });

  const hash = db.getAdminHash(req.session.adminName);
  if (!hash || !(await bcrypt.compare(currentPassword, hash))) {
    return res.status(401).json({ error: 'Feil nåværende passord.' });
  }

  db.setAdminHash(req.session.adminName, await bcrypt.hash(newPassword, 10));
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/admin/me', (req, res) => {
  const name = req.session.adminName || '';
  res.json({ loggedIn: !!req.session.isAdmin, name, email: name ? (db.getAdminEmail(name) || '') : '' });
});

function getAdminEmails() {
  const emails = db.getAllAdminEmails();
  if (emails.length === 0 && process.env.ADMIN_EMAIL) return [process.env.ADMIN_EMAIL];
  return emails;
}

function requireAdmin(req, res, next) {
  if (req.session.isAdmin) return next();
  res.status(401).json({ error: 'Ikke innlogget.' });
}

// ── Admin API ───────────────────────────────────────────
app.get('/api/admin/bookings', requireAdmin, (_req, res) => {
  res.json(db.getAllBookings());
});

app.get('/api/admin/stats', requireAdmin, (_req, res) => {
  res.json(db.getStats());
});

app.put('/api/admin/bookings/:id/approve', requireAdmin, async (req, res) => {
  const booking = db.updateBookingStatus(req.params.id, 'approved', { adminName: req.session.adminName });
  if (!booking) return res.status(404).json({ error: 'Booking ikke funnet.' });
  mailer.notifyVolunteerApproved(booking);
  res.json(booking);
});

app.put('/api/admin/bookings/:id/reject', requireAdmin, async (req, res) => {
  const reason = req.body.reason?.trim() || '';
  const booking = db.updateBookingStatus(req.params.id, 'rejected', { adminName: req.session.adminName, reason });
  if (!booking) return res.status(404).json({ error: 'Booking ikke funnet.' });
  mailer.notifyVolunteerRejected(booking);
  res.json(booking);
});

app.delete('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  db.deleteBooking(req.params.id);
  res.json({ ok: true });
});

// ── Cron: påminnelse kl. 18:00 ─────────────────────────
cron.schedule('0 18 * * *', async () => {
  const bookings = db.getTomorrowsApprovedBookings();
  console.log(`[cron] Påminnelse: sender til ${bookings.length} booking(er) for i morgen`);
  for (const booking of bookings) {
    await mailer.notifyVolunteerReminder(booking);
  }
});

// ── Cron: daglig backup kl. 02:00 ──────────────────────
cron.schedule('0 2 * * *', () => {
  try {
    const backupDir = path.join(__dirname, 'data', 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);

    const date = new Date().toISOString().slice(0, 10);
    const src  = path.join(__dirname, 'data', 'bookings.json');
    const dest = path.join(backupDir, `${date}-bookings.json`);
    fs.copyFileSync(src, dest);

    // Slett sikkerhetskopier eldre enn 30 dager
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    fs.readdirSync(backupDir)
      .filter(f => f.endsWith('-bookings.json'))
      .forEach(f => {
        const p = path.join(backupDir, f);
        if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p);
      });

    console.log(`[backup] data/backups/${date}-bookings.json lagret`);
  } catch (err) {
    console.error('[backup] Feil:', err.message);
  }
});

app.listen(PORT, () => {
  console.log(`\n  Løftebukk-booking kjører:`);
  console.log(`  Brukersiden:  http://localhost:${PORT}`);
  console.log(`  Admin-panel:  http://localhost:${PORT}/admin.html`);
  console.log(`  Admins:       ${db.getAdminNames().join(', ')}`);
  console.log(`  E-post:       ${process.env.SMTP_USER ? `✓ ${process.env.SMTP_USER}` : '✗ ikke konfigurert'}\n`);
});
