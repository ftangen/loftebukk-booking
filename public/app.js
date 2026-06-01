(() => {
  'use strict';

  const HOURS_START = 7;
  const HOURS_END = 21;
  const HOURS = Array.from({ length: HOURS_END - HOURS_START }, (_, i) => HOURS_START + i);

  const NO_MONTHS = ['januar','februar','mars','april','mai','juni','juli','august','september','oktober','november','desember'];
  const NO_DAYS_SHORT = ['man','tir','ons','tor','fre','lør','søn'];

  // State
  let currentYear = new Date().getFullYear();
  let currentMonth = new Date().getMonth();
  let selectedDate = null;
  let approvedBookings = []; // [{id, name, date, start_time, end_time}]

  // DOM refs
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
      approvedBookings = await res.json();
      renderCalendar();
    } catch {
      // silently degrade — calendar still shows but without booking data
      renderCalendar();
    }
  }

  // ── Calendar ─────────────────────────────────────────
  function renderCalendar() {
    monthTitle.textContent = `${NO_MONTHS[currentMonth]} ${currentYear}`;

    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);

    // Monday-based week offset (0=Mon … 6=Sun)
    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    calGrid.innerHTML = '';

    // Empty cells before first day
    for (let i = 0; i < startOffset; i++) {
      const el = document.createElement('div');
      el.className = 'calendar-day empty';
      calGrid.appendChild(el);
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(currentYear, currentMonth, d);
      const dateStr = toDateStr(date);
      const dow = date.getDay(); // 0=Sun, 4=Thu
      const isPast = date < today;
      const isToday = date.getTime() === today.getTime();
      const isThursday = dow === 4;
      const isSelected = selectedDate === dateStr;

      const status = getDateStatus(dateStr, isThursday);

      const el = document.createElement('div');
      el.className = [
        'calendar-day',
        isPast ? 'past' : '',
        isToday ? 'today' : '',
        isThursday ? 'thursday' : status,
        isSelected && !isThursday ? 'selected' : '',
      ].filter(Boolean).join(' ');

      el.innerHTML = `<span>${d}</span>${makeDot(status, isThursday)}`;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `${d}. ${NO_MONTHS[currentMonth]}`);

      if (!isPast && !isThursday) {
        el.addEventListener('click', () => selectDay(dateStr, date));
      } else if (isThursday && !isPast) {
        el.title = 'Ungdomsklubb-dag – kan ikke bookes';
      }

      calGrid.appendChild(el);
    }
  }

  function makeDot(status, isThursday) {
    if (isThursday) return '<span class="day-dot dot-thursday"></span>';
    if (status === 'full') return '<span class="day-dot dot-full"></span>';
    if (status === 'partial') return '<span class="day-dot dot-partial"></span>';
    return '';
  }

  function getDateStatus(dateStr, isThursday) {
    if (isThursday) return 'thursday';
    const dayBookings = approvedBookings.filter(b => b.date === dateStr);
    if (dayBookings.length === 0) return 'available';

    const bookedHours = countBookedHours(dayBookings);
    const totalHours = HOURS_END - HOURS_START;
    if (bookedHours >= totalHours) return 'full';
    return 'partial';
  }

  function countBookedHours(bookings) {
    // Count unique booked hours across all bookings for a day
    const booked = new Set();
    for (const b of bookings) {
      const start = parseInt(b.start_time);
      const end = parseInt(b.end_time);
      for (let h = start; h < end; h++) booked.add(h);
    }
    return booked.size;
  }

  // ── Day detail ───────────────────────────────────────
  function selectDay(dateStr, dateObj) {
    selectedDate = dateStr;
    renderCalendar();

    const dayNum = dateObj.getDate();
    const dowIdx = (dateObj.getDay() + 6) % 7; // 0=Mon
    detailTitle.textContent = `${NO_DAYS_SHORT[dowIdx]}. ${dayNum}. ${NO_MONTHS[dateObj.getMonth()]} ${dateObj.getFullYear()}`;

    const dayBookings = approvedBookings.filter(b => b.date === dateStr);

    if (dayBookings.length === 0) {
      detailBookings.innerHTML = '<div class="empty-day">Ingen bookinger denne dagen – løftebukken er ledig! 🎉</div>';
    } else {
      dayBookings.sort((a, b) => a.start_time.localeCompare(b.start_time));
      detailBookings.innerHTML = dayBookings.map(b => `
        <div class="booking-pill">
          <span class="time">${b.start_time} – ${b.end_time}</span>
          <span class="who">${escHtml(b.name)}</span>
        </div>
      `).join('');
    }

    // Check if still any hours free
    const bookedHours = countBookedHours(dayBookings);
    const totalHours = HOURS_END - HOURS_START;
    if (bookedHours >= totalHours) {
      bookBtnWrap.innerHTML = '<p style="text-align:center;color:var(--danger);font-size:.875rem;margin-top:10px">Løftebukken er fullt booket denne dagen.</p>';
    } else {
      bookBtnWrap.innerHTML = `<button class="btn btn-primary btn-full" id="open-modal-btn">📅 Book løftebukken denne dagen</button>`;
      document.getElementById('open-modal-btn').addEventListener('click', () => openModal(dateStr, dateObj, dayBookings));
    }

    dayDetail.style.display = '';
    dayDetail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  document.getElementById('close-detail').addEventListener('click', () => {
    dayDetail.style.display = 'none';
    selectedDate = null;
    renderCalendar();
  });

  // ── Booking modal ────────────────────────────────────
  function openModal(dateStr, dateObj, dayBookings) {
    const dowIdx = (dateObj.getDay() + 6) % 7;
    bookingDateInfo.textContent = `${NO_DAYS_SHORT[dowIdx]}. ${dateObj.getDate()}. ${NO_MONTHS[dateObj.getMonth()]} ${dateObj.getFullYear()}`;

    // Time bar showing booked hours
    if (dayBookings.length > 0) {
      buildTimeBar(dayBookings);
      timeBarWrap.style.display = '';
    } else {
      timeBarWrap.style.display = 'none';
    }

    populateTimeSelects(dayBookings);
    hideError();
    formView.style.display = '';
    successView.style.display = 'none';
    bookingForm.reset();
    modal.style.display = 'flex';
    document.getElementById('f-name').focus();
  }

  function buildTimeBar(dayBookings) {
    timeBar.innerHTML = '';
    timeBarTicks.innerHTML = '';
    const totalHours = HOURS_END - HOURS_START;

    const bookedSet = new Set();
    for (const b of dayBookings) {
      const s = parseInt(b.start_time);
      const e = parseInt(b.end_time);
      for (let h = s; h < e; h++) bookedSet.add(h);
    }

    for (let h = HOURS_START; h < HOURS_END; h++) {
      const slot = document.createElement('div');
      slot.className = `time-slot ${bookedSet.has(h) ? 'booked' : 'free'}`;
      slot.title = `${pad(h)}:00–${pad(h+1)}:00 ${bookedSet.has(h) ? '(opptatt)' : '(ledig)'}`;
      timeBar.appendChild(slot);
    }

    // Tick marks: show every 3 hours
    for (let h = HOURS_START; h <= HOURS_END; h++) {
      if (h === HOURS_START || h === HOURS_END || (h - HOURS_START) % 3 === 0) {
        const tick = document.createElement('span');
        tick.textContent = `${h}`;
        tick.style.flex = h === HOURS_END ? '0' : `${3 / totalHours * 100}%`;
        timeBarTicks.appendChild(tick);
      }
    }
  }

  function populateTimeSelects(dayBookings) {
    const bookedSet = new Set();
    for (const b of dayBookings) {
      const s = parseInt(b.start_time);
      const e = parseInt(b.end_time);
      for (let h = s; h < e; h++) bookedSet.add(h);
    }

    fStart.innerHTML = HOURS.map(h =>
      `<option value="${pad(h)}:00">${pad(h)}:00</option>`
    ).join('');

    updateEndSelect();

    fStart.addEventListener('change', updateEndSelect);

    function updateEndSelect() {
      const startH = parseInt(fStart.value);
      fEnd.innerHTML = HOURS
        .filter(h => h > startH)
        .map(h => `<option value="${pad(h)}:00">${pad(h)}:00</option>`)
        .join('');
      // Default to 1 hour later
      if (fEnd.options.length) fEnd.value = `${pad(startH + 1)}:00`;
    }
  }

  document.getElementById('close-modal').addEventListener('click', closeModal);
  document.getElementById('close-success').addEventListener('click', () => {
    closeModal();
    loadBookings();
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  function closeModal() {
    modal.style.display = 'none';
  }

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

    if (!name || !phone || !plate || !startTime || !endTime) {
      showError('Alle obligatoriske felt (*) må fylles ut.');
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
        formView.style.display = 'none';
        successView.style.display = '';
      }
    } catch {
      showError('Kunne ikke nå serveren. Sjekk tilkoblingen og prøv igjen.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send booking-forespørsel';
    }
  });

  // ── Navigation ───────────────────────────────────────
  document.getElementById('prev-month').addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    selectedDate = null;
    dayDetail.style.display = 'none';
    renderCalendar();
  });

  document.getElementById('next-month').addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    selectedDate = null;
    dayDetail.style.display = 'none';
    renderCalendar();
  });

  // ── Helpers ──────────────────────────────────────────
  function toDateStr(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function escHtml(s) { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function showError(msg) { formError.textContent = msg; formError.classList.add('show'); }
  function hideError() { formError.classList.remove('show'); }

  // ── Init ─────────────────────────────────────────────
  loadBookings();
})();
