(() => {
  'use strict';

  const HOURS_START = 7;
  const HOURS_END = 21;
  const HOURS = Array.from({ length: HOURS_END - HOURS_START }, (_, i) => HOURS_START + i);

  const NO_MONTHS = ['januar','februar','mars','april','mai','juni','juli','august','september','oktober','november','desember'];
  const NO_DAYS_SHORT = ['man','tir','ons','tor','fre','lør','søn'];

  let currentYear = new Date().getFullYear();
  let currentMonth = new Date().getMonth();
  let selectedDate = null;
  let publicBookings = []; // approved + pending

  const calGrid = document.getElementById('calendar-grid');
  const monthTitle = document.getElementById('month-title');
  const dayDetail = document.getElementById('day-detail');
  const detailTitle = document.getElementById('detail-date-title');
  const detailBookings = document.getElementById('detail-bookings');
  const bookBtnWrap = document.getElementById('book-btn-wrap');
  const modal = document.getElementById('booking-modal');
  const formView = document.getElementById('form-view');
  const successView = document.getElementById('success-view');
  const bookingForm = document.getElementById('booking-form');
  const bookingDateInfo = document.getElementById('booking-date-info');
  const formError = document.getElementById('form-error');
  const timeBarWrap = document.getElementById('time-bar-wrap');
  const timeBar = document.getElementById('time-bar');
  const timeBarTicks = document.getElementById('time-bar-ticks');
  const fStart = document.getElementById('f-start');
  const fEnd = document.getElementById('f-end');

  // ── API ──────────────────────────────────────────────
  async function loadBookings() {
    try {
      const res = await fetch('/api/bookings');
      publicBookings = await res.json();
    } catch { /* degrade gracefully */ }
    renderCalendar();
  }

  // ── Calendar ─────────────────────────────────────────
  function renderCalendar() {
    monthTitle.textContent = `${NO_MONTHS[currentMonth]} ${currentYear}`;
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);

    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    calGrid.innerHTML = '';

    for (let i = 0; i < startOffset; i++) {
      const el = document.createElement('div');
      el.className = 'cal-day empty';
      calGrid.appendChild(el);
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(currentYear, currentMonth, d);
      const dateStr = toDateStr(date);
      const dow = date.getDay();
      const isPast = date < today;
      const isToday = date.getTime() === today.getTime();
      const isThursday = dow === 4;
      const isSelected = selectedDate === dateStr;
      const status = isThursday ? 'thursday' : getDateStatus(dateStr);

      const el = document.createElement('div');
      const classes = ['cal-day', isPast ? 'past' : '', isToday ? 'today' : '', isSelected ? 'selected' : status];
      el.className = classes.filter(Boolean).join(' ');

      el.innerHTML = `<span>${d}</span>${makeDot(status, isThursday)}`;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `${d}. ${NO_MONTHS[currentMonth]}`);

      if (!isPast && !isThursday) {
        el.addEventListener('click', () => selectDay(dateStr, date));
      } else if (isThursday && !isPast) {
        el.title = 'Reservert for ungdomsklubben';
      }

      calGrid.appendChild(el);
    }
  }

  function makeDot(status, isThursday) {
    if (isThursday) return '<span class="day-dot dot-thursday"></span>';
    if (status === 'full') return '<span class="day-dot dot-full"></span>';
    if (status === 'partial') return '<span class="day-dot dot-partial"></span>';
    if (status === 'pending-only') return '<span class="day-dot dot-pending"></span>';
    return '';
  }

  function getDateStatus(dateStr) {
    const day = publicBookings.filter(b => b.date === dateStr);
    const approved = day.filter(b => b.status === 'approved');
    const bookedHours = countBookedHours(approved);
    if (bookedHours >= HOURS_END - HOURS_START) return 'full';
    if (bookedHours > 0) return 'partial';
    if (day.some(b => b.status === 'pending')) return 'pending-only';
    return 'available';
  }

  function countBookedHours(bookings) {
    const booked = new Set();
    for (const b of bookings) {
      for (let h = parseInt(b.start_time); h < parseInt(b.end_time); h++) booked.add(h);
    }
    return booked.size;
  }

  // ── Day detail ───────────────────────────────────────
  function selectDay(dateStr, dateObj) {
    selectedDate = dateStr;
    renderCalendar();

    const dowIdx = (dateObj.getDay() + 6) % 7;
    detailTitle.textContent = `${cap(NO_DAYS_SHORT[dowIdx])}. ${dateObj.getDate()}. ${NO_MONTHS[dateObj.getMonth()]} ${dateObj.getFullYear()}`;

    const dayApproved = publicBookings.filter(b => b.date === dateStr && b.status === 'approved').sort((a, b) => a.start_time.localeCompare(b.start_time));
    const dayPending  = publicBookings.filter(b => b.date === dateStr && b.status === 'pending').sort((a, b) => a.start_time.localeCompare(b.start_time));

    if (!dayApproved.length && !dayPending.length) {
      detailBookings.innerHTML = `
        <div class="flex items-center gap-3 bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-green-700 text-sm font-medium">
          <span class="text-lg">🎉</span> Løftebukken er helt ledig denne dagen!
        </div>`;
    } else {
      const approvedHtml = dayApproved.map(b => `
        <div class="flex items-center gap-3 bg-blue-50 rounded-xl px-4 py-3 mb-2">
          <span class="font-bold text-blue-700 text-sm whitespace-nowrap">${b.start_time} – ${b.end_time}</span>
          <span class="text-slate-500 text-sm">${escHtml(b.name)}</span>
        </div>`).join('');

      const pendingHtml = dayPending.map(b => `
        <div class="flex items-center gap-3 bg-amber-50 border border-dashed border-amber-300 rounded-xl px-4 py-3 mb-2">
          <span class="font-bold text-amber-700 text-sm whitespace-nowrap">${b.start_time} – ${b.end_time}</span>
          <span class="text-slate-500 text-sm">${escHtml(b.name)}</span>
          <span class="ml-auto text-xs text-amber-600 font-semibold whitespace-nowrap">⏳ Venter</span>
        </div>`).join('');

      const pendingHeader = dayPending.length ? `
        <p class="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2 mt-3">Venter på godkjenning</p>` : '';
      const approvedHeader = dayApproved.length ? `
        <p class="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">Godkjent</p>` : '';

      detailBookings.innerHTML = (dayApproved.length ? approvedHeader + approvedHtml : '') +
                                 (dayPending.length  ? pendingHeader  + pendingHtml  : '');
    }

    const bookedHours = countBookedHours(dayApproved);
    if (bookedHours >= HOURS_END - HOURS_START) {
      bookBtnWrap.innerHTML = `<p class="text-center text-red-600 text-sm font-medium mt-1">Løftebukken er fullt booket denne dagen.</p>`;
    } else {
      bookBtnWrap.innerHTML = `<button id="open-modal-btn" class="w-full mt-1 py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl transition-colors text-sm">📅 Book løftebukken denne dagen</button>`;
      document.getElementById('open-modal-btn').addEventListener('click', () => openModal(dateStr, dateObj, dayApproved, dayPending));
    }

    dayDetail.style.display = '';
    dayDetail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  document.getElementById('close-detail').addEventListener('click', () => {
    dayDetail.style.display = 'none';
    selectedDate = null;
    renderCalendar();
  });

  // ── Modal ────────────────────────────────────────────
  function openModal(dateStr, dateObj, dayApproved, dayPending) {
    const dowIdx = (dateObj.getDay() + 6) % 7;
    bookingDateInfo.textContent = `${cap(NO_DAYS_SHORT[dowIdx])}. ${dateObj.getDate()}. ${NO_MONTHS[dateObj.getMonth()]} ${dateObj.getFullYear()}`;

    if (dayApproved.length || dayPending.length) {
      buildTimeBar(dayApproved, dayPending);
      timeBarWrap.style.display = '';
    } else {
      timeBarWrap.style.display = 'none';
    }

    populateTimeSelects(dayApproved);
    hideError();
    bookingForm.reset();
    formView.classList.remove('hidden');
    successView.classList.add('hidden');
    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('f-name').focus(), 250);
  }

  function buildTimeBar(dayApproved, dayPending) {
    timeBar.innerHTML = '';
    timeBarTicks.innerHTML = '';
    const approvedSet = new Set();
    const pendingSet  = new Set();
    for (const b of dayApproved) {
      for (let h = parseInt(b.start_time); h < parseInt(b.end_time); h++) approvedSet.add(h);
    }
    for (const b of dayPending) {
      for (let h = parseInt(b.start_time); h < parseInt(b.end_time); h++) pendingSet.add(h);
    }
    for (let h = HOURS_START; h < HOURS_END; h++) {
      const cls = approvedSet.has(h) ? 'booked' : pendingSet.has(h) ? 'pending' : 'free';
      const label = approvedSet.has(h) ? 'opptatt' : pendingSet.has(h) ? 'venter godkjenning' : 'ledig';
      const slot = document.createElement('div');
      slot.className = `time-slot ${cls}`;
      slot.title = `${pad(h)}:00–${pad(h+1)}:00 (${label})`;
      timeBar.appendChild(slot);
    }
    // Tick labels every 3 hours
    for (let h = HOURS_START; h <= HOURS_END; h += 3) {
      const tick = document.createElement('span');
      tick.textContent = `${h}`;
      timeBarTicks.appendChild(tick);
    }
  }

  function populateTimeSelects(dayBookings) {
    fStart.innerHTML = HOURS.map(h => `<option value="${pad(h)}:00">${pad(h)}:00</option>`).join('');
    updateEndSelect();
    fStart.onchange = updateEndSelect;

    function updateEndSelect() {
      const startH = parseInt(fStart.value);
      fEnd.innerHTML = HOURS.filter(h => h > startH).map(h => `<option value="${pad(h)}:00">${pad(h)}:00</option>`).join('');
      if (fEnd.options.length) fEnd.value = `${pad(Math.min(startH + 2, HOURS_END))}:00`;
    }
  }

  document.getElementById('close-modal').addEventListener('click', closeModal);
  document.getElementById('close-success').addEventListener('click', () => { closeModal(); loadBookings(); });
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  function closeModal() { modal.style.display = 'none'; }

  // ── Form submit ──────────────────────────────────────
  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const name = document.getElementById('f-name').value.trim();
    const phone = document.getElementById('f-phone').value.trim();
    const plate = document.getElementById('f-plate').value.trim().toUpperCase();
    const startTime = fStart.value;
    const endTime = fEnd.value;
    const notes = document.getElementById('f-notes').value.trim();

    if (!name || !phone || !plate || !startTime || !endTime || !notes) {
      showError('Alle felt merket med * må fylles ut — inkludert hva som skal gjøres med bilen.');
      return;
    }
    if (phone.replace(/\D/g, '').length < 8) {
      showError('Skriv inn et gyldig telefonnummer (minst 8 siffer).');
      return;
    }

    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sender…';

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, license_plate: plate, date: selectedDate, start_time: startTime, end_time: endTime, notes }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error || 'Noe gikk galt. Prøv igjen.');
      } else {
        formView.classList.add('hidden');
        successView.classList.remove('hidden');
      }
    } catch {
      showError('Kunne ikke nå serveren. Sjekk tilkoblingen og prøv igjen.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send booking-forespørsel';
    }
  });

  // ── Month navigation ──────────────────────────────────
  document.getElementById('prev-month').addEventListener('click', () => {
    if (--currentMonth < 0) { currentMonth = 11; currentYear--; }
    selectedDate = null;
    dayDetail.style.display = 'none';
    renderCalendar();
  });

  document.getElementById('next-month').addEventListener('click', () => {
    if (++currentMonth > 11) { currentMonth = 0; currentYear++; }
    selectedDate = null;
    dayDetail.style.display = 'none';
    renderCalendar();
  });

  // ── Helpers ──────────────────────────────────────────
  function toDateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function escHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function showError(msg) { formError.textContent = msg; formError.classList.remove('hidden'); }
  function hideError() { formError.classList.add('hidden'); }

  loadBookings();
})();
