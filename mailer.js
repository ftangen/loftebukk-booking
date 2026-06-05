const nodemailer = require('nodemailer');

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const SITE_URL = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

const NO_MONTHS = ['januar','februar','mars','april','mai','juni','juli','august','september','oktober','november','desember'];
const NO_DAYS   = ['søndag','mandag','tirsdag','onsdag','torsdag','fredag','lørdag'];

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${NO_DAYS[d.getDay()]} ${d.getDate()}. ${NO_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function getTransporter() {
  if (!SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

async function send(to, subject, html) {
  const t = getTransporter();
  if (!t) return;
  try {
    await t.sendMail({
      from: `"Løftebukk-booking 🔧" <${SMTP_USER}>`,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error('[mailer] Feil ved sending av e-post:', err.message);
  }
}

function cancelLink(token) {
  return `${SITE_URL}/cancel/${token}`;
}

// Gjenbrukbar påminnelsesblokk
const REMINDERS_HTML = `
  <div style="margin:20px 0;padding:16px 20px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;">
    <p style="margin:0 0 10px;font-weight:700;color:#92400e;font-size:14px;">📋 Husk når du er ferdig:</p>
    <ul style="margin:0;padding-left:20px;color:#78350f;font-size:14px;line-height:2.1;">
      <li>Rydd etter deg — gjelder både område og verktøy</li>
      <li>Slå av lys og kompressor</li>
      <li>Husk å låse porten</li>
    </ul>
  </div>`;

const FOOTER_HTML = `
  <div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">
    Sendt automatisk av Løftebukk-booking
  </div>`;

// ── E-post til admin: ny booking-forespørsel ──────────
async function notifyAdminNewBooking(booking, adminEmails) {
  const to = (adminEmails || [ADMIN_EMAIL]).filter(Boolean);
  if (!to.length) return;
  const dateStr = formatDate(booking.date);

  await send(
    to.join(', '),
    `🔧 Ny booking-forespørsel fra ${booking.name}`,
    `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1);">

    <div style="background:linear-gradient(135deg,#1e3a8a,#1d4ed8);color:white;padding:24px 28px;">
      <div style="font-size:30px;margin-bottom:6px;">🔧</div>
      <h1 style="margin:0;font-size:18px;font-weight:700;">Ny booking-forespørsel</h1>
      <p style="margin:4px 0 0;opacity:.75;font-size:13px;">Løftebukk-booking — mekkeklubben</p>
    </div>

    <div style="padding:24px 28px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:7px 0;color:#64748b;width:110px;">Navn</td>        <td style="padding:7px 0;font-weight:700;">${esc(booking.name)}</td></tr>
        <tr><td style="padding:7px 0;color:#64748b;">Telefon</td>    <td style="padding:7px 0;">${esc(booking.phone)}</td></tr>
        <tr><td style="padding:7px 0;color:#64748b;">E-post</td>     <td style="padding:7px 0;">${esc(booking.email)}</td></tr>
        <tr><td style="padding:7px 0;color:#64748b;">Dato</td>       <td style="padding:7px 0;font-weight:700;">${dateStr}</td></tr>
        <tr><td style="padding:7px 0;color:#64748b;">Tid</td>        <td style="padding:7px 0;">${esc(booking.start_time)} – ${esc(booking.end_time)}</td></tr>
        <tr><td style="padding:7px 0;color:#64748b;">Skiltnummer</td><td style="padding:7px 0;font-family:monospace;font-weight:700;letter-spacing:.06em;">${esc(booking.license_plate)}</td></tr>
      </table>

      <div style="margin:16px 0 20px;padding:12px 16px;background:#f8fafc;border-radius:8px;border-left:3px solid #1d4ed8;">
        <p style="margin:0 0 4px;color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;">Hva skal gjøres</p>
        <p style="margin:0;font-size:14px;">${esc(booking.notes)}</p>
      </div>

      <a href="${SITE_URL}/admin.html" style="display:inline-block;padding:12px 22px;background:#1d4ed8;color:white;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">
        Gå til admin-panelet →
      </a>
    </div>
    ${FOOTER_HTML}
  </div>
</body></html>`
  );
}

// ── E-post til frivillig: booking mottatt (venter godkjenning) ──
async function notifyVolunteerSubmitted(booking) {
  if (!booking.email) return;
  const dateStr = formatDate(booking.date);

  await send(
    booking.email,
    `⏳ Booking mottatt — ${dateStr}`,
    `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1);">

    <div style="background:linear-gradient(135deg,#1e3a8a,#1d4ed8);color:white;padding:24px 28px;">
      <div style="font-size:30px;margin-bottom:6px;">⏳</div>
      <h1 style="margin:0;font-size:18px;font-weight:700;">Booking mottatt!</h1>
      <p style="margin:4px 0 0;opacity:.75;font-size:13px;">Løftebukk-booking — mekkeklubben</p>
    </div>

    <div style="padding:24px 28px;">
      <p style="margin:0 0 20px;font-size:15px;">Hei ${esc(booking.name)}! 👋<br>
      Vi har mottatt bookingen din. En admin vil behandle den snart og du får e-post med bekreftelse.</p>

      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 20px;margin-bottom:4px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:5px 0;color:#1e40af;width:110px;">Dato</td>  <td style="padding:5px 0;font-weight:700;">${dateStr}</td></tr>
          <tr><td style="padding:5px 0;color:#1e40af;">Tid</td>   <td style="padding:5px 0;font-weight:700;">${esc(booking.start_time)} – ${esc(booking.end_time)}</td></tr>
          <tr><td style="padding:5px 0;color:#1e40af;">Bil</td>   <td style="padding:5px 0;font-family:monospace;font-weight:700;">${esc(booking.license_plate)}</td></tr>
          <tr><td style="padding:5px 0;color:#1e40af;">Hva</td>   <td style="padding:5px 0;">${esc(booking.notes)}</td></tr>
        </table>
      </div>

      ${REMINDERS_HTML}

      <div style="margin-top:16px;padding:12px 16px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;font-size:13px;color:#64748b;">
        Ønsker du å kansellere bookingen kan du gjøre det her:<br>
        <a href="${cancelLink(booking.cancel_token)}" style="color:#dc2626;font-weight:600;">Kanseller booking →</a>
      </div>
    </div>
    ${FOOTER_HTML}
  </div>
</body></html>`
  );
}

// ── E-post til frivillig: godkjent ────────────────────
async function notifyVolunteerApproved(booking) {
  if (!booking.email) return;
  const dateStr = formatDate(booking.date);

  await send(
    booking.email,
    `✅ Booking godkjent — ${dateStr}`,
    `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1);">

    <div style="background:linear-gradient(135deg,#14532d,#16a34a);color:white;padding:24px 28px;">
      <div style="font-size:30px;margin-bottom:6px;">✅</div>
      <h1 style="margin:0;font-size:18px;font-weight:700;">Booking godkjent!</h1>
      <p style="margin:4px 0 0;opacity:.75;font-size:13px;">Løftebukk-booking — mekkeklubben</p>
    </div>

    <div style="padding:24px 28px;">
      <p style="margin:0 0 20px;font-size:15px;">Hei ${esc(booking.name)}! 👋<br>
      Bookingen din er godkjent. Vi gleder oss til å se deg!</p>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:5px 0;color:#166534;width:110px;">Dato</td>  <td style="padding:5px 0;font-weight:700;">${dateStr}</td></tr>
          <tr><td style="padding:5px 0;color:#166534;">Tid</td>   <td style="padding:5px 0;font-weight:700;">${esc(booking.start_time)} – ${esc(booking.end_time)}</td></tr>
          <tr><td style="padding:5px 0;color:#166534;">Bil</td>   <td style="padding:5px 0;font-family:monospace;font-weight:700;">${esc(booking.license_plate)}</td></tr>
          <tr><td style="padding:5px 0;color:#166534;">Hva</td>   <td style="padding:5px 0;">${esc(booking.notes)}</td></tr>
        </table>
      </div>

      ${REMINDERS_HTML}
    </div>
    ${FOOTER_HTML}
  </div>
</body></html>`
  );
}

// ── E-post til frivillig: avvist ──────────────────────
async function notifyVolunteerRejected(booking) {
  if (!booking.email) return;
  const dateStr = formatDate(booking.date);

  await send(
    booking.email,
    `❌ Booking avvist — ${dateStr}`,
    `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1);">

    <div style="background:linear-gradient(135deg,#7f1d1d,#dc2626);color:white;padding:24px 28px;">
      <div style="font-size:30px;margin-bottom:6px;">❌</div>
      <h1 style="margin:0;font-size:18px;font-weight:700;">Booking avvist</h1>
      <p style="margin:4px 0 0;opacity:.75;font-size:13px;">Løftebukk-booking — mekkeklubben</p>
    </div>

    <div style="padding:24px 28px;">
      <p style="margin:0 0 16px;font-size:15px;">Hei ${esc(booking.name)}!<br>
      Dessverre kunne ikke bookingen din godkjennes denne gangen.</p>

      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 18px;margin-bottom:16px;font-size:14px;color:#7f1d1d;">
        <strong>${dateStr}</strong>, ${esc(booking.start_time)} – ${esc(booking.end_time)}
      </div>

      ${booking.rejection_reason ? `
      <div style="margin-bottom:16px;padding:12px 16px;background:#f8fafc;border-radius:8px;border-left:3px solid #dc2626;font-size:14px;">
        <p style="margin:0 0 4px;color:#94a3b8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;">Begrunnelse</p>
        <p style="margin:0;color:#374151;">${esc(booking.rejection_reason)}</p>
      </div>` : ''}

      <p style="margin:0;font-size:14px;color:#64748b;">
        Prøv gjerne å booke en annen tid på
        <a href="${SITE_URL}" style="color:#1d4ed8;">booking-siden</a>.
      </p>
    </div>
    ${FOOTER_HTML}
  </div>
</body></html>`
  );
}

// ── E-post til frivillig: påminnelse dagen før ────────
async function notifyVolunteerReminder(booking) {
  if (!booking.email) return;
  const dateStr = formatDate(booking.date);

  await send(
    booking.email,
    `🔔 Påminnelse: booking i morgen — ${dateStr}`,
    `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1);">

    <div style="background:linear-gradient(135deg,#1e3a8a,#1d4ed8);color:white;padding:24px 28px;">
      <div style="font-size:30px;margin-bottom:6px;">🔔</div>
      <h1 style="margin:0;font-size:18px;font-weight:700;">Påminnelse — i morgen!</h1>
      <p style="margin:4px 0 0;opacity:.75;font-size:13px;">Løftebukk-booking — mekkeklubben</p>
    </div>

    <div style="padding:24px 28px;">
      <p style="margin:0 0 20px;font-size:15px;">Hei ${esc(booking.name)}! 👋<br>
      Du har en bekreftet booking i morgen. Vi gleder oss til å se deg!</p>

      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 20px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:5px 0;color:#1e40af;width:110px;">Dato</td>  <td style="padding:5px 0;font-weight:700;">${dateStr}</td></tr>
          <tr><td style="padding:5px 0;color:#1e40af;">Tid</td>   <td style="padding:5px 0;font-weight:700;">${esc(booking.start_time)} – ${esc(booking.end_time)}</td></tr>
          <tr><td style="padding:5px 0;color:#1e40af;">Bil</td>   <td style="padding:5px 0;font-family:monospace;font-weight:700;">${esc(booking.license_plate)}</td></tr>
        </table>
      </div>

      ${REMINDERS_HTML}

      <div style="margin-top:16px;padding:12px 16px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;font-size:13px;color:#64748b;">
        Kan du ikke lenger?
        <a href="${cancelLink(booking.cancel_token)}" style="color:#dc2626;font-weight:600;">Kanseller booking →</a>
      </div>
    </div>
    ${FOOTER_HTML}
  </div>
</body></html>`
  );
}

// ── E-post til admin: godkjent booking kansellert ─────
async function notifyAdminBookingCancelled(booking, adminEmails) {
  const to = (adminEmails || [ADMIN_EMAIL]).filter(Boolean);
  if (!to.length) return;
  const dateStr = formatDate(booking.date);

  await send(
    to.join(', '),
    `🚫 Booking kansellert av bruker — ${booking.name}`,
    `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1);">

    <div style="background:linear-gradient(135deg,#7f1d1d,#dc2626);color:white;padding:24px 28px;">
      <div style="font-size:30px;margin-bottom:6px;">🚫</div>
      <h1 style="margin:0;font-size:18px;font-weight:700;">Booking kansellert</h1>
      <p style="margin:4px 0 0;opacity:.75;font-size:13px;">Løftebukk-booking — mekkeklubben</p>
    </div>

    <div style="padding:24px 28px;">
      <p style="margin:0 0 16px;font-size:14px;color:#64748b;">
        En <strong>godkjent</strong> booking er kansellert av brukeren. Tidsrommet er nå ledig igjen.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:7px 0;color:#64748b;width:110px;">Navn</td>   <td style="padding:7px 0;font-weight:700;">${esc(booking.name)}</td></tr>
        <tr><td style="padding:7px 0;color:#64748b;">Dato</td>               <td style="padding:7px 0;font-weight:700;">${dateStr}</td></tr>
        <tr><td style="padding:7px 0;color:#64748b;">Tid</td>                <td style="padding:7px 0;">${esc(booking.start_time)} – ${esc(booking.end_time)}</td></tr>
        <tr><td style="padding:7px 0;color:#64748b;">Skiltnummer</td>        <td style="padding:7px 0;font-family:monospace;font-weight:700;">${esc(booking.license_plate)}</td></tr>
      </table>
    </div>
    ${FOOTER_HTML}
  </div>
</body></html>`
  );
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

module.exports = {
  notifyAdminNewBooking,
  notifyVolunteerSubmitted,
  notifyVolunteerApproved,
  notifyVolunteerRejected,
  notifyVolunteerReminder,
  notifyAdminBookingCancelled,
};
