(function () {
  const state = {
    info: null,
    calendarDays: [],
    selectedService: null,
    selectedDate: null,
    selectedTime: null,
    step: 1
  };

  const el = (id) => document.getElementById(id);

  const WEEKDAY_ABBR = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

  function fmtMoney(v) {
    if (v === null || v === undefined || v === '') return '';
    return 'R$ ' + Number(v).toFixed(2).replace('.', ',');
  }

  function fmtDateLabel(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  }

  function setStepUI(n) {
    state.step = n;
    document.querySelectorAll('.steps .dot').forEach((dot) => {
      const s = parseInt(dot.dataset.step, 10);
      dot.classList.toggle('active', s === n);
      dot.classList.toggle('done', s < n);
    });
    [1, 2, 3, 4].forEach((s) => {
      const stepEl = el('step-' + s);
      if (stepEl) stepEl.classList.toggle('hidden', s !== n);
    });
    el('step-success').classList.add('hidden');
  }

  async function api(path, opts) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erro inesperado.');
    return data;
  }

  async function loadInfo() {
    const info = await api('/api/public/info');
    state.info = info;
    el('barberName').textContent = info.barberName;
    el('barberAddress').textContent = info.address || '';

    const contacts = el('barberContacts');
    contacts.innerHTML = '';
    if (info.whatsapp) {
      const a = document.createElement('a');
      a.href = 'https://wa.me/' + info.whatsapp.replace(/\D/g, '');
      a.target = '_blank';
      a.textContent = '💬 WhatsApp';
      contacts.appendChild(a);
    }
    if (info.phone) {
      const a = document.createElement('a');
      a.href = 'tel:' + info.phone.replace(/\D/g, '');
      a.textContent = '📞 ' + info.phone;
      contacts.appendChild(a);
    }
    if (info.instagram) {
      const a = document.createElement('a');
      const handle = info.instagram.replace('@', '');
      a.href = 'https://instagram.com/' + handle;
      a.target = '_blank';
      a.textContent = '📸 @' + handle;
      contacts.appendChild(a);
    }

    renderServices(info.services);
  }

  function renderServices(services) {
    const list = el('serviceList');
    list.innerHTML = '';
    if (!services.length) {
      list.innerHTML = '<div class="empty-msg">Nenhum serviço cadastrado ainda.</div>';
      return;
    }
    services.forEach((svc) => {
      const div = document.createElement('div');
      div.className = 'service-card';
      div.innerHTML = `
        <div>
          <div class="name">${svc.name}</div>
          <div class="meta">${svc.duration_minutes} min</div>
        </div>
        <div class="price">${fmtMoney(svc.price)}</div>
      `;
      div.addEventListener('click', () => selectService(svc, div));
      list.appendChild(div);
    });
  }

  function selectService(svc, cardEl) {
    state.selectedService = svc;
    document.querySelectorAll('#serviceList .service-card').forEach((c) => c.classList.remove('selected'));
    cardEl.classList.add('selected');
    state.selectedDate = null;
    state.selectedTime = null;
    goToStep(2);
    loadCalendar();
  }

  async function loadCalendar() {
    const scroller = el('dayScroller');
    scroller.innerHTML = '<div class="empty-msg">Carregando dias...</div>';
    const { days } = await api('/api/public/calendar');
    state.calendarDays = days;
    scroller.innerHTML = '';
    days.forEach((day) => {
      const d = new Date(day.date + 'T12:00:00');
      const pill = document.createElement('div');
      pill.className = 'day-pill' + (day.closed ? ' disabled' : '');
      pill.innerHTML = `<span class="dow">${WEEKDAY_ABBR[d.getDay()]}</span><span class="num">${d.getDate()}</span>`;
      if (!day.closed) {
        pill.addEventListener('click', () => selectDate(day.date, pill));
      }
      scroller.appendChild(pill);
    });
  }

  function selectDate(dateStr, pillEl) {
    state.selectedDate = dateStr;
    state.selectedTime = null;
    document.querySelectorAll('#dayScroller .day-pill').forEach((p) => p.classList.remove('selected'));
    pillEl.classList.add('selected');
    el('selectedDateLabel').textContent = '— ' + fmtDateLabel(dateStr);
    goToStep(3);
    loadSlots();
  }

  async function loadSlots() {
    const area = el('slotsArea');
    area.innerHTML = '<div class="loading">Buscando horários...</div>';
    const params = new URLSearchParams({ date: state.selectedDate });
    if (state.selectedService) params.set('serviceId', state.selectedService.id);
    const data = await api('/api/public/availability?' + params.toString());
    if (data.closed || !data.slots.length) {
      area.innerHTML = '<div class="empty-msg">Não há horários disponíveis neste dia. Escolha outra data.</div>';
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'slots-grid';
    data.slots.forEach((time) => {
      const btn = document.createElement('button');
      btn.className = 'slot-btn';
      btn.type = 'button';
      btn.textContent = time;
      btn.addEventListener('click', () => selectTime(time, btn));
      grid.appendChild(btn);
    });
    area.innerHTML = '';
    area.appendChild(grid);
  }

  function selectTime(time, btnEl) {
    state.selectedTime = time;
    document.querySelectorAll('#slotsArea .slot-btn').forEach((b) => b.classList.remove('selected'));
    btnEl.classList.add('selected');
    el('sumService').textContent = state.selectedService ? state.selectedService.name : 'Atendimento';
    el('sumDate').textContent = fmtDateLabel(state.selectedDate);
    el('sumTime').textContent = time;
    goToStep(4);
  }

  function goToStep(n) {
    setStepUI(n);
  }

  function showAlert(msg, type) {
    el('formAlert').innerHTML = `<div class="alert ${type}">${msg}</div>`;
  }

  async function confirmBooking() {
    const name = el('clientName').value.trim();
    const phone = el('clientPhone').value.trim();
    const notes = el('clientNotes').value.trim();
    el('formAlert').innerHTML = '';

    if (!name) return showAlert('Informe seu nome.', 'error');
    if (!phone) return showAlert('Informe seu telefone/WhatsApp.', 'error');

    const btn = el('confirmBtn');
    btn.disabled = true;
    btn.textContent = 'Confirmando...';

    try {
      const result = await api('/api/public/book', {
        method: 'POST',
        body: JSON.stringify({
          date: state.selectedDate,
          time: state.selectedTime,
          serviceId: state.selectedService ? state.selectedService.id : null,
          name,
          phone,
          notes
        })
      });

      el('okService').textContent = result.service;
      el('okDate').textContent = fmtDateLabel(result.date);
      el('okTime').textContent = result.time;
      const cancelUrl = `${location.origin}/cancelar?token=${result.cancelToken}`;
      el('cancelLink').textContent = cancelUrl;

      const waNumber = state.info.whatsapp ? state.info.whatsapp.replace(/\D/g, '') : '';
      const msg = encodeURIComponent(
        `Olá! Acabei de agendar: ${result.service} em ${fmtDateLabel(result.date)} às ${result.time}. Nome: ${name}.`
      );
      el('whatsappConfirm').href = waNumber
        ? `https://wa.me/${waNumber}?text=${msg}`
        : '#';
      if (!waNumber) el('whatsappConfirm').classList.add('hidden');

      document.querySelectorAll('.step').forEach((s) => s.classList.add('hidden'));
      el('step-success').classList.remove('hidden');
      document.querySelectorAll('.steps .dot').forEach((dot) => dot.classList.add('done'));
    } catch (err) {
      showAlert(err.message, 'error');
      if (err.message.includes('indisponível')) {
        setTimeout(() => goToStep(3), 1500);
      }
    } finally {
      btn.disabled = false;
      btn.textContent = 'Confirmar agendamento';
    }
  }

  function resetFlow() {
    state.selectedService = null;
    state.selectedDate = null;
    state.selectedTime = null;
    el('clientName').value = '';
    el('clientPhone').value = '';
    el('clientNotes').value = '';
    document.querySelectorAll('#serviceList .service-card').forEach((c) => c.classList.remove('selected'));
    document.querySelectorAll('.steps .dot').forEach((dot) => dot.classList.remove('done', 'active'));
    document.querySelectorAll('.step').forEach((s) => s.classList.remove('hidden'));
    goToStep(1);
  }

  el('confirmBtn').addEventListener('click', confirmBooking);
  el('backBtn').addEventListener('click', () => goToStep(3));
  el('newBookingBtn').addEventListener('click', resetFlow);

  loadInfo()
    .then(() => {
      el('loadingInfo').classList.add('hidden');
      el('flow').classList.remove('hidden');
      setStepUI(1);
    })
    .catch((err) => {
      el('loadingInfo').textContent = 'Erro ao carregar: ' + err.message;
    });
})();
