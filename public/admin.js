(() => {
  'use strict';

  const loginPage  = document.getElementById('login-page');
  const adminPage  = document.getElementById('admin-page');
  const loginError = document.getElementById('login-error');
  const adminError = document.getElementById('admin-error');
  const rejectModal = document.getElementById('reject-modal');

  let allBookings = [];
  let activeTab = 'pending';
  let pendingRejectId = null;

  const NO_MONTHS = ['jan','feb','mar','apr','mai','jun','jul','aug','sep','okt','nov','des'];

  // ── Init ─────────────────────────────────────────────
  async function init() {
    const res = await fetch('/api/admin/me');
    const { loggedIn, name } = await res.json();
    if (loggedIn) {
      setAdminName(name);
      showAdminPage();
    } else {
      loginPage.classList.remove('hidden');
    }
  }

  function setAdminName(name) {
    document.getElementById('admin-name-label').textContent = `Innlogget som ${name}`;
  }

  // ── Login ────────────────────────────────────────────
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.needsSetup) {
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('setup-form').classList.remove('hidden');
        document.getElementById('setup-password').focus();
      } else if (res.ok) {
        loginPage.classList.add('hidden');
        setAdminName(data.name);
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

  // ── First-time password setup ─────────────────────────
  document.getElementById('setup-submit').addEventListener('click', async () => {
    const password = document.getElementById('setup-password').value;
    const confirm = document.getElementById('setup-confirm').value;
    const errorEl = document.getElementById('setup-error');
    errorEl.classList.add('hidden');

    if (password.length < 8) { errorEl.textContent = 'Passordet må være minst 8 tegn.'; errorEl.classList.remove('hidden'); return; }
    if (password !== confirm) { errorEl.textContent = 'Passordene stemmer ikke overens.'; errorEl.classList.remove('hidden'); return; }

    try {
      const res = await fetch('/api/admin/setup-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok) {
        loginPage.classList.add('hidden');
        setAdminName(data.name);
        showAdminPage();
      } else {
        errorEl.textContent = data.error || 'Noe gikk galt.';
        errorEl.classList.remove('hidden');
      }
    } catch {
      errorEl.textContent = 'Kunne ikke nå serveren.';
      errorEl.classList.remove('hidden');
    }
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    adminPage.classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('setup-form').classList.add('hidden');
    loginPage.classList.remove('hidden');
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
  });

  // ── Change password ───────────────────────────────────
  const changePwModal = document.getElementById('change-password-modal');

  document.getElementById('change-password-btn').addEventListener('click', () => {
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('confirm-password').value = '';
    document.getElementById('change-password-error').classList.add('hidden');
    changePwModal.classList.remove('hidden');
    document.getElementById('current-password').focus();
  });

  document.getElementById('change-password-cancel').addEventListener('click', () => {
    changePwModal.classList.add('hidden');
  });

  document.getElementById('change-password-confirm').addEventListener('click', async () => {
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const errorEl = document.getElementById('change-password-error');
    errorEl.classList.add('hidden');

    if (newPassword.length < 8) { errorEl.textContent = 'Nytt passord må være minst 8 tegn.'; errorEl.classList.remove('hidden'); return; }
    if (newPassword !== confirmPassword) { errorEl.textContent = 'Passordene stemmer ikke overens.'; errorEl.classList.remove('hidden'); return; }

    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        changePwModal.classList.add('hidden');
        alert('Passord byttet!');
      } else {
        errorEl.textContent = data.error || 'Noe gikk galt.';
        errorEl.classList.remove('hidden');
      }
    } catch {
      errorEl.textContent = 'Kunne ikke nå serveren.';
      errorEl.classList.remove('hidden');
    }
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
      if (activeTab === 'stats') renderStats();
      else renderBookings();
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

  // ── Bookings list ────────────────────────────────────
  function renderBookings() {
    document.getElementById('bookings-list').classList.remove('hidden');
    document.getElementById('stats-panel').classList.add('hidden');

    const list = document.getElementById('bookings-list');
    const filtered = allBookings.filter(b => b.status === activeTab);

    if (!filtered.length) {
      const icons = { pending: '📭', approved: '✅', rejected: '🚫' };
      const labels = { pending: 'ventende bookinger', approved: 'godkjente bookinger', rejected: 'avviste bookinger' };
      list.innerHTML = `<div class="text-center py-16 text-slate-400"><div class="text-4xl mb-3">${icons[activeTab]}</div><p class="text-sm">Ingen ${labels[activeTab]} for øyeblikket.</p></div>`;
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
    const actionAt = b.action_at ? new Date(b.action_at).toLocaleString('no-NO', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : null;

    const statusStyles = {
      pending:  'bg-amber-50 text-amber-700 border-amber-200',
      approved: 'bg-green-50 text-green-700 border-green-200',
      rejected: 'bg-red-50 text-red-700 border-red-200',
    };
    const statusLabels = { pending: 'Til behandling', approved: 'Godkjent', rejected: 'Avvist' };

    // Who acted on this booking
    let actionLine = '';
    if (b.approved_by && actionAt) {
      actionLine = `<span class="text-green-600 text-xs font-medium">✓ Godkjent av ${escHtml(b.approved_by)} · ${actionAt}</span>`;
    } else if (b.rejected_by && actionAt) {
      actionLine = `<span class="text-red-600 text-xs font-medium">✕ Avvist av ${escHtml(b.rejected_by)} · ${actionAt}</span>`;
    }

    const actions = {
      pending:  `
        <button data-action="approve" data-id="${b.id}" class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors">✓ Godkjenn</button>
        <button data-action="reject"  data-id="${b.id}" class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors">✕ Avvis</button>
        <button data-action="delete"  data-id="${b.id}" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-semibold rounded-xl transition-colors">🗑</button>`,
      approved: `
        <button data-action="reject"  data-id="${b.id}" class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors">✕ Avvis</button>
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

        ${b.notes ? `<div class="bg-slate-50 rounded-xl px-3.5 py-2.5 text-sm text-slate-600 mb-2">💬 ${escHtml(b.notes)}</div>` : ''}
        ${b.rejection_reason ? `<div class="bg-red-50 rounded-xl px-3.5 py-2.5 text-sm text-red-700 mb-2">📝 Begrunnelse: ${escHtml(b.rejection_reason)}</div>` : ''}
        ${actionLine ? `<div class="mb-3">${actionLine}</div>` : ''}

        <div class="flex gap-2 flex-wrap">${actions[b.status]}</div>
      </div>`;
  }

  // ── Reject modal ─────────────────────────────────────
  function openRejectModal(id) {
    pendingRejectId = id;
    document.getElementById('reject-reason').value = '';
    rejectModal.classList.remove('hidden');
    setTimeout(() => document.getElementById('reject-reason').focus(), 100);
  }

  document.getElementById('reject-cancel').addEventListener('click', () => {
    rejectModal.classList.add('hidden');
    pendingRejectId = null;
  });

  document.getElementById('reject-confirm').addEventListener('click', async () => {
    const reason = document.getElementById('reject-reason').value.trim();
    if (!reason) {
      document.getElementById('reject-reason').focus();
      return;
    }
    rejectModal.classList.add('hidden');
    await fetch(`/api/admin/bookings/${pendingRejectId}/reject`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    pendingRejectId = null;
    await loadBookings();
  });

  async function handleAction(action, id) {
    if (action === 'reject') { openRejectModal(id); return; }
    if (action === 'delete' && !confirm('Vil du slette denne bookingen permanent?')) return;
    const method = action === 'delete' ? 'DELETE' : 'PUT';
    const url = action === 'delete' ? `/api/admin/bookings/${id}` : `/api/admin/bookings/${id}/${action}`;
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' } });
    await loadBookings();
  }

  // ── Statistics ───────────────────────────────────────
  async function renderStats() {
    document.getElementById('bookings-list').classList.add('hidden');
    const panel = document.getElementById('stats-panel');
    panel.classList.remove('hidden');
    panel.innerHTML = '<div class="text-center py-12 text-slate-400">Laster statistikk…</div>';

    try {
      const res = await fetch('/api/admin/stats');
      const s = await res.json();
      const maxMonthly = Math.max(...s.monthly.map(m => m.count), 1);

      panel.innerHTML = `
        <!-- Nøkkeltall -->
        <div class="grid grid-cols-2 gap-3 mb-5">
          ${statCard('Denne måneden', s.thisMonthCount, 'bookinger godkjent', '#2563eb')}
          ${statCard('Denne måneden', s.thisMonthHours, 'timer booket', '#16a34a')}
          ${statCard('Totalt', s.approved, 'godkjente bookinger', '#7c3aed')}
          ${statCard('Totalt', s.totalHours, 'timer brukt', '#d97706')}
        </div>

        <!-- Status-fordeling -->
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-4">
          <h3 class="font-bold text-slate-900 mb-3 text-sm uppercase tracking-wide">Alle bookinger</h3>
          <div class="grid grid-cols-4 gap-2 text-center">
            ${miniStat(s.pending,   'Venter',      'text-amber-600')}
            ${miniStat(s.approved,  'Godkjent',    'text-green-600')}
            ${miniStat(s.rejected,  'Avvist',      'text-red-600')}
            ${miniStat(s.cancelled, 'Kansellert',  'text-slate-400')}
          </div>
        </div>

        <!-- Månedsoversikt -->
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-4">
          <h3 class="font-bold text-slate-900 mb-4 text-sm uppercase tracking-wide">Siste 6 måneder (godkjente)</h3>
          <div class="space-y-2.5">
            ${s.monthly.map(m => `
              <div class="flex items-center gap-3">
                <span class="text-xs text-slate-500 w-12 text-right flex-shrink-0 capitalize">${m.label}</span>
                <div class="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                  <div class="h-5 bg-blue-500 rounded-full flex items-center pl-2 transition-all"
                    style="width:${Math.max(m.count / maxMonthly * 100, m.count ? 4 : 0)}%">
                  </div>
                </div>
                <span class="text-xs font-semibold text-slate-700 w-16 flex-shrink-0">${m.count} stk · ${m.hours}t</span>
              </div>`).join('')}
          </div>
        </div>

        <!-- Topp bookere -->
        ${s.topBookers.length ? `
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-4">
          <h3 class="font-bold text-slate-900 mb-3 text-sm uppercase tracking-wide">Mest aktive frivillige</h3>
          <div class="space-y-2">
            ${s.topBookers.map((b, i) => `
              <div class="flex items-center justify-between py-1.5 ${i < s.topBookers.length - 1 ? 'border-b border-slate-50' : ''}">
                <span class="text-sm text-slate-700 flex items-center gap-2">
                  <span class="text-xs font-bold text-slate-400 w-4">${i + 1}.</span>
                  ${escHtml(b.name)}
                </span>
                <span class="text-sm font-semibold text-blue-600">${b.count} booking${b.count !== 1 ? 'er' : ''}</span>
              </div>`).join('')}
          </div>
        </div>` : ''}

        <!-- Admin-aktivitet -->
        ${s.adminActivity.length ? `
        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <h3 class="font-bold text-slate-900 mb-3 text-sm uppercase tracking-wide">Admin-aktivitet</h3>
          <div class="space-y-2">
            ${s.adminActivity.map((a, i) => `
              <div class="flex items-center justify-between py-1.5 ${i < s.adminActivity.length - 1 ? 'border-b border-slate-50' : ''}">
                <span class="text-sm font-semibold text-slate-700">${escHtml(a.name)}</span>
                <div class="flex gap-3 text-xs font-semibold">
                  <span class="text-green-600">✓ ${a.approved} godkjent</span>
                  <span class="text-red-500">✕ ${a.rejected} avvist</span>
                </div>
              </div>`).join('')}
          </div>
        </div>` : '<div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center text-slate-400 text-sm">Ingen admin-aktivitet registrert ennå.</div>'}
      `;
    } catch {
      panel.innerHTML = '<div class="text-center py-12 text-red-500 text-sm">Kunne ikke laste statistikk.</div>';
    }
  }

  function statCard(label, value, sub, color) {
    return `
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center">
        <p class="text-xs text-slate-400 uppercase tracking-wide mb-1">${label}</p>
        <p class="text-3xl font-extrabold" style="color:${color}">${value}</p>
        <p class="text-xs text-slate-500 mt-1">${sub}</p>
      </div>`;
  }

  function miniStat(value, label, color) {
    return `
      <div>
        <p class="text-2xl font-extrabold ${color}">${value}</p>
        <p class="text-xs text-slate-500 mt-0.5">${label}</p>
      </div>`;
  }

  // ── Tab switching ────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => {
        const isActive = b.dataset.tab === activeTab;
        b.classList.toggle('bg-blue-600', isActive);
        b.classList.toggle('text-white', isActive);
        b.classList.toggle('text-slate-500', !isActive);
        b.classList.toggle('hover:bg-slate-50', !isActive);
        const badge = b.querySelector('span');
        if (badge) badge.className = isActive
          ? 'bg-white/25 text-white text-xs font-bold px-2 py-0.5 rounded-full'
          : 'bg-slate-100 text-slate-500 text-xs font-bold px-2 py-0.5 rounded-full';
      });
      if (activeTab === 'stats') renderStats();
      else renderBookings();
    });
  });

  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  init();
})();
