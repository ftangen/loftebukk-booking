(() => {
  'use strict';

  const loginPage  = document.getElementById('login-page');
  const adminPage  = document.getElementById('admin-page');
  const loginError = document.getElementById('login-error');
  const adminError = document.getElementById('admin-error');

  let allBookings = [];
  let activeTab = 'pending';

  const NO_MONTHS = ['jan','feb','mar','apr','mai','jun','jul','aug','sep','okt','nov','des'];

  // ── Init ─────────────────────────────────────────────
  async function init() {
    const res = await fetch('/api/admin/me');
    const { loggedIn } = await res.json();
    loggedIn ? showAdminPage() : (loginPage.classList.remove('hidden'));
  }

  // ── Login ────────────────────────────────────────────
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');
    const password = document.getElementById('password').value;
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok) {
        loginPage.classList.add('hidden');
        showAdminPage();
      } else {
        loginError.textContent = data.error || 'Innlogging feilet.';
        loginError.classList.remove('hidden');
      }
    } catch {
      loginError.textContent = 'Kunne ikke nå serveren.';
      loginError.classList.remove('hidden');
    }
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    adminPage.classList.add('hidden');
    loginPage.classList.remove('hidden');
    document.getElementById('password').value = '';
  });

  // ── Admin page ───────────────────────────────────────
  async function showAdminPage() {
    adminPage.classList.remove('hidden');
    await loadBookings();
  }

  async function loadBookings() {
    adminError.classList.add('hidden');
    try {
      const res = await fetch('/api/admin/bookings');
      if (res.status === 401) { adminPage.classList.add('hidden'); loginPage.classList.remove('hidden'); return; }
      allBookings = await res.json();
      updateBadges();
      renderBookings();
    } catch {
      adminError.textContent = 'Kunne ikke laste bookinger.';
      adminError.classList.remove('hidden');
    }
  }

  function updateBadges() {
    document.getElementById('badge-pending').textContent  = allBookings.filter(b => b.status === 'pending').length;
    document.getElementById('badge-approved').textContent = allBookings.filter(b => b.status === 'approved').length;
    document.getElementById('badge-rejected').textContent = allBookings.filter(b => b.status === 'rejected').length;
  }

  function renderBookings() {
    const list = document.getElementById('bookings-list');
    const filtered = allBookings.filter(b => b.status === activeTab);

    if (!filtered.length) {
      const icons = { pending: '📭', approved: '✅', rejected: '🚫' };
      const labels = { pending: 'ventende bookinger', approved: 'godkjente bookinger', rejected: 'avviste bookinger' };
      list.innerHTML = `
        <div class="text-center py-16 text-slate-400">
          <div class="text-4xl mb-3">${icons[activeTab]}</div>
          <p class="text-sm">Ingen ${labels[activeTab]} for øyeblikket.</p>
        </div>`;
      return;
    }

    list.innerHTML = filtered.map(bookingCard).join('');
    list.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => handleAction(btn.dataset.action, parseInt(btn.dataset.id)));
    });
  }

  function bookingCard(b) {
    const d = new Date(b.date + 'T12:00:00');
    const dateStr = `${d.getDate()}. ${NO_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    const createdAt = new Date(b.created_at).toLocaleString('no-NO', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });

    const statusStyles = {
      pending:  'bg-amber-50 text-amber-700 border-amber-200',
      approved: 'bg-green-50 text-green-700 border-green-200',
      rejected: 'bg-red-50  text-red-700  border-red-200',
    };
    const statusLabels = { pending: 'Til behandling', approved: 'Godkjent', rejected: 'Avvist' };

    const actions = {
      pending:  `
        <button data-action="approve" data-id="${b.id}" class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors">✓ Godkjenn</button>
        <button data-action="reject"  data-id="${b.id}" class="px-4 py-2 bg-red-600  hover:bg-red-700  text-white text-sm font-semibold rounded-xl transition-colors">✕ Avvis</button>
        <button data-action="delete"  data-id="${b.id}" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-semibold rounded-xl transition-colors">🗑</button>`,
      approved: `
        <button data-action="reject"  data-id="${b.id}" class="px-4 py-2 bg-red-600  hover:bg-red-700  text-white text-sm font-semibold rounded-xl transition-colors">✕ Avvis</button>
        <button data-action="delete"  data-id="${b.id}" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-semibold rounded-xl transition-colors">🗑</button>`,
      rejected: `
        <button data-action="approve" data-id="${b.id}" class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors">✓ Godkjenn</button>
        <button data-action="delete"  data-id="${b.id}" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-semibold rounded-xl transition-colors">🗑</button>`,
    };

    return `
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-3">
        <div class="flex items-start justify-between gap-3 mb-3">
          <div>
            <p class="font-bold text-slate-900 text-base">${escHtml(b.name)}</p>
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusStyles[b.status]} mt-1">
              ${statusLabels[b.status]}
            </span>
          </div>
          <span class="bg-slate-100 text-slate-800 font-mono font-bold text-sm px-3 py-1.5 rounded-lg tracking-widest whitespace-nowrap">${escHtml(b.license_plate)}</span>
        </div>

        <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 mb-3">
          <span>📅 ${dateStr}</span>
          <span>🕐 ${b.start_time} – ${b.end_time}</span>
          <span>📞 ${escHtml(b.phone)}</span>
          <span>✉️ ${escHtml(b.email || '—')}</span>
          <span class="text-slate-400 text-xs self-center">Sendt ${createdAt}</span>
        </div>

        ${b.notes ? `<div class="bg-slate-50 rounded-xl px-3.5 py-2.5 text-sm text-slate-600 mb-3">💬 ${escHtml(b.notes)}</div>` : ''}

        <div class="flex gap-2 flex-wrap">${actions[b.status]}</div>
      </div>`;
  }

  async function handleAction(action, id) {
    if (action === 'delete' && !confirm('Vil du slette denne bookingen permanent?')) return;
    const method = action === 'delete' ? 'DELETE' : 'PUT';
    const url = action === 'delete' ? `/api/admin/bookings/${id}` : `/api/admin/bookings/${id}/${action}`;
    await fetch(url, { method });
    await loadBookings();
  }

  // ── Tab switching ────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => {
        const isActive = b.dataset.tab === activeTab;
        b.classList.toggle('bg-blue-600',  isActive);
        b.classList.toggle('text-white',   isActive);
        b.classList.toggle('text-slate-500', !isActive);
        b.classList.toggle('hover:bg-slate-50', !isActive);
        const badge = b.querySelector('span');
        badge.className = isActive
          ? 'bg-white/25 text-white text-xs font-bold px-2 py-0.5 rounded-full'
          : 'bg-slate-100 text-slate-500 text-xs font-bold px-2 py-0.5 rounded-full';
      });
      renderBookings();
    });
  });

  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  init();
})();
