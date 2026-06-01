(() => {
  'use strict';

  const loginPage = document.getElementById('login-page');
  const adminPage = document.getElementById('admin-page');
  const loginError = document.getElementById('login-error');
  const adminError = document.getElementById('admin-error');

  let allBookings = [];
  let activeTab = 'pending';

  const NO_MONTHS = ['jan','feb','mar','apr','mai','jun','jul','aug','sep','okt','nov','des'];

  // ── Auth check on load ───────────────────────────────
  async function init() {
    const res = await fetch('/api/admin/me');
    const data = await res.json();
    if (data.loggedIn) {
      showAdminPage();
    } else {
      loginPage.style.display = '';
    }
  }

  // ── Login ────────────────────────────────────────────
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('password').value;
    loginError.classList.remove('show');

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok) {
        loginPage.style.display = 'none';
        showAdminPage();
      } else {
        loginError.textContent = data.error || 'Innlogging feilet.';
        loginError.classList.add('show');
      }
    } catch {
      loginError.textContent = 'Kunne ikke nå serveren.';
      loginError.classList.add('show');
    }
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    adminPage.style.display = 'none';
    loginPage.style.display = '';
    document.getElementById('password').value = '';
  });

  // ── Admin page ───────────────────────────────────────
  async function showAdminPage() {
    adminPage.style.display = '';
    await loadBookings();
  }

  async function loadBookings() {
    adminError.classList.remove('show');
    try {
      const res = await fetch('/api/admin/bookings');
      if (res.status === 401) { showLoginPage(); return; }
      allBookings = await res.json();
      updateBadges();
      renderBookings();
    } catch {
      adminError.textContent = 'Kunne ikke laste bookinger.';
      adminError.classList.add('show');
    }
  }

  function updateBadges() {
    document.getElementById('badge-pending').textContent = allBookings.filter(b => b.status === 'pending').length;
    document.getElementById('badge-approved').textContent = allBookings.filter(b => b.status === 'approved').length;
    document.getElementById('badge-rejected').textContent = allBookings.filter(b => b.status === 'rejected').length;
  }

  function renderBookings() {
    const list = document.getElementById('bookings-list');
    const filtered = allBookings.filter(b => b.status === activeTab);

    if (filtered.length === 0) {
      const labels = { pending: 'ventende bookinger', approved: 'godkjente bookinger', rejected: 'avviste bookinger' };
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">${activeTab === 'pending' ? '📭' : activeTab === 'approved' ? '✅' : '🚫'}</div>
          <p>Ingen ${labels[activeTab]} for øyeblikket.</p>
        </div>`;
      return;
    }

    list.innerHTML = filtered.map(b => bookingCard(b)).join('');

    // Bind actions
    list.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => handleAction(btn.dataset.action, parseInt(btn.dataset.id)));
    });
  }

  function bookingCard(b) {
    const d = new Date(b.date + 'T12:00:00');
    const dateStr = `${d.getDate()}. ${NO_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    const createdAt = new Date(b.created_at).toLocaleString('no-NO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

    const actions = {
      pending: `
        <button class="btn btn-success btn-sm" data-action="approve" data-id="${b.id}">✓ Godkjenn</button>
        <button class="btn btn-danger btn-sm" data-action="reject" data-id="${b.id}">✕ Avvis</button>
        <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${b.id}">🗑 Slett</button>
      `,
      approved: `
        <button class="btn btn-danger btn-sm" data-action="reject" data-id="${b.id}">✕ Avvis</button>
        <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${b.id}">🗑 Slett</button>
      `,
      rejected: `
        <button class="btn btn-success btn-sm" data-action="approve" data-id="${b.id}">✓ Godkjenn</button>
        <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${b.id}">🗑 Slett</button>
      `,
    };

    return `
      <div class="booking-card">
        <div class="booking-card-header">
          <div>
            <div class="booking-card-name">${escHtml(b.name)}</div>
            <span class="status-badge status-${b.status}">${statusLabel(b.status)}</span>
          </div>
          <span class="booking-card-plate">${escHtml(b.license_plate)}</span>
        </div>
        <div class="booking-card-meta">
          <span>📅 ${dateStr}</span>
          <span>🕐 ${b.start_time} – ${b.end_time}</span>
          <span>📞 ${escHtml(b.phone)}</span>
          <span style="color:var(--text-muted);font-size:.75rem">Sendt: ${createdAt}</span>
        </div>
        ${b.notes ? `<div class="booking-card-notes">💬 ${escHtml(b.notes)}</div>` : ''}
        <div class="booking-card-actions">${actions[b.status]}</div>
      </div>
    `;
  }

  async function handleAction(action, id) {
    if (action === 'delete') {
      if (!confirm('Vil du slette denne bookingen permanent?')) return;
      await fetch(`/api/admin/bookings/${id}`, { method: 'DELETE' });
    } else {
      await fetch(`/api/admin/bookings/${id}/${action}`, { method: 'PUT' });
    }
    await loadBookings();
  }

  // ── Tab switching ────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.tab;
      renderBookings();
    });
  });

  // ── Helpers ──────────────────────────────────────────
  function statusLabel(s) {
    return { pending: 'Til behandling', approved: 'Godkjent', rejected: 'Avvist' }[s] || s;
  }
  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function showLoginPage() {
    adminPage.style.display = 'none';
    loginPage.style.display = '';
  }

  init();
})();
