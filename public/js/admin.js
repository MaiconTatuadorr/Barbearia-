(function () {
  const el = (id) => document.getElementById(id);
  const WEEKDAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  async function api(path, opts) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erro inesperado.');
    return data;
  }

  function fmtMoney(v) {
    if (v === null || v === undefined || v === '') return '-';
    return 'R$ ' + Number(v).toFixed(2).replace('.', ',');
  }

  function fmtDate(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', weekday: 'short' });
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  // ---------- Boot / auth ----------

  async function boot() {
    const status = await api('/api/admin/status');
    if (!status.setupComplete) {
      el('setupScreen').classList.remove('hidden');
      return;
    }
    if (!status.isAuthenticated) {
      el('loginScreen').classList.remove('hidden');
      return;
    }
    showApp();
  }

  el('setupBtn').addEventListener('click', async () => {
    el('setupAlert').innerHTML = '';
    const barberName = el('setupName').value.trim();
    const password = el('setupPassword').value;
    try {
      await api('/api/admin/setup', { method: 'POST', body: JSON.stringify({ barberName, password }) });
      el('setupScreen').classList.add('hidden');
      showApp();
    } catch (err) {
      el('setupAlert').innerHTML = `<div class="alert error">${err.message}</div>`;
    }
  });

  el('loginBtn').addEventListener('click', async () => {
    el('loginAlert').innerHTML = '';
    const password = el('loginPassword').value;
    try {
      await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) });
      el('loginScreen').classList.add('hidden');
      showApp();
    } catch (err) {
      el('loginAlert').innerHTML = `<div class="alert error">${err.message}</div>`;
    }
  });

  el('logoutBtn').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' });
    location.reload();
  });

  function showApp() {
    el('adminShell').classList.remove('hidden');
    el('shareLink').textContent = location.origin + '/';
    initTabs();
    loadEverything();
  }

  el('copyLinkBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(el('shareLink').textContent).then(() => {
      const btn = el('copyLinkBtn');
      const original = btn.textContent;
      btn.textContent = 'Copiado!';
      setTimeout(() => (btn.textContent = original), 1500);
    });
  });

  // ---------- Tabs ----------

  function initTabs() {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        el('tab-' + btn.dataset.tab).classList.add('active');
      });
    });
  }

  function loadEverything() {
    loadSettingsForm();
    loadServices();
    loadWorkingHours();
    loadBlockedDates();
    el('filterFrom').value = todayISO();
    el('filterTo').value = todayISO();
    loadAppointments();
  }

  // ---------- Agenda ----------

  async function loadAppointments() {
    const wrap = el('apptTableWrap');
    wrap.innerHTML = '<div class="loading">Carregando...</div>';
    const from = el('filterFrom').value;
    const to = el('filterTo').value;
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const rows = await api('/api/admin/appointments?' + params.toString());
    if (!rows.length) {
      wrap.innerHTML = '<div class="empty-msg">Nenhum agendamento neste período.</div>';
      return;
    }
    const table = document.createElement('table');
    table.innerHTML = `
      <thead><tr><th>Data</th><th>Hora</th><th>Cliente</th><th>Telefone</th><th>Serviço</th><th>Status</th><th></th></tr></thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${fmtDate(r.date)}</td>
        <td>${r.time}</td>
        <td>${r.client_name}</td>
        <td>${r.client_phone || '-'}</td>
        <td>${r.service_name || '-'}</td>
        <td><span class="badge ${r.status}">${r.status === 'confirmed' ? 'Confirmado' : 'Cancelado'}</span></td>
        <td></td>
      `;
      if (r.status === 'confirmed') {
        const btn = document.createElement('button');
        btn.className = 'btn ghost';
        btn.textContent = 'Cancelar';
        btn.style.padding = '6px 12px';
        btn.style.fontSize = '0.78rem';
        btn.addEventListener('click', async () => {
          if (!confirm('Cancelar este agendamento?')) return;
          await api(`/api/admin/appointments/${r.id}/cancel`, { method: 'POST' });
          loadAppointments();
        });
        tr.lastElementChild.appendChild(btn);
      }
      tbody.appendChild(tr);
    });
    wrap.innerHTML = '';
    wrap.appendChild(table);
  }

  el('filterFrom').addEventListener('change', loadAppointments);
  el('filterTo').addEventListener('change', loadAppointments);
  el('filterTodayBtn').addEventListener('click', () => {
    el('filterFrom').value = todayISO();
    el('filterTo').value = todayISO();
    loadAppointments();
  });
  el('filterWeekBtn').addEventListener('click', () => {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 7);
    el('filterFrom').value = from.toISOString().slice(0, 10);
    el('filterTo').value = to.toISOString().slice(0, 10);
    loadAppointments();
  });

  el('manAddBtn').addEventListener('click', async () => {
    el('manAlert').innerHTML = '';
    const date = el('manDate').value;
    const time = el('manTime').value;
    const serviceId = el('manService').value || null;
    const clientName = el('manName').value.trim();
    const clientPhone = el('manPhone').value.trim();
    if (!date || !time || !clientName) {
      el('manAlert').innerHTML = '<div class="alert error">Preencha data, horário e nome.</div>';
      return;
    }
    try {
      await api('/api/admin/appointments', {
        method: 'POST',
        body: JSON.stringify({ date, time, serviceId, clientName, clientPhone })
      });
      el('manName').value = '';
      el('manPhone').value = '';
      loadAppointments();
    } catch (err) {
      el('manAlert').innerHTML = `<div class="alert error">${err.message}</div>`;
    }
  });

  // ---------- Horários ----------

  async function loadWorkingHours() {
    const wrap = el('weekdaysWrap');
    wrap.innerHTML = '<div class="loading">Carregando...</div>';
    const rows = await api('/api/admin/working-hours');
    wrap.innerHTML = '';
    rows.forEach((row) => {
      const div = document.createElement('div');
      div.className = 'weekday-row';
      div.dataset.weekday = row.weekday;
      div.innerHTML = `
        <span class="wd-name">${WEEKDAY_NAMES[row.weekday]}</span>
        <label class="switch"><input type="checkbox" class="wh-enabled" ${row.enabled ? 'checked' : ''}><span class="slider"></span></label>
        <input type="time" class="wh-start" value="${row.start_time}">
        <input type="time" class="wh-end" value="${row.end_time}">
        <input type="time" class="wh-break-start" value="${row.break_start || ''}" title="Início do intervalo">
        <input type="time" class="wh-break-end" value="${row.break_end || ''}" title="Fim do intervalo">
      `;
      wrap.appendChild(div);
    });
  }

  el('saveHoursBtn').addEventListener('click', async () => {
    el('whAlert').innerHTML = '';
    const days = Array.from(document.querySelectorAll('#weekdaysWrap .weekday-row')).map((row) => ({
      weekday: parseInt(row.dataset.weekday, 10),
      enabled: row.querySelector('.wh-enabled').checked,
      start_time: row.querySelector('.wh-start').value,
      end_time: row.querySelector('.wh-end').value,
      break_start: row.querySelector('.wh-break-start').value || null,
      break_end: row.querySelector('.wh-break-end').value || null
    }));
    try {
      await api('/api/admin/working-hours', { method: 'PUT', body: JSON.stringify({ days }) });
      el('whAlert').innerHTML = '<div class="alert success">Horários salvos com sucesso!</div>';
    } catch (err) {
      el('whAlert').innerHTML = `<div class="alert error">${err.message}</div>`;
    }
  });

  // ---------- Bloqueios ----------

  async function loadBlockedDates() {
    const rows = await api('/api/admin/blocked-dates');
    const tbody = document.querySelector('#blockTable tbody');
    tbody.innerHTML = '';
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty-msg">Nenhum dia bloqueado.</td></tr>';
      return;
    }
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${fmtDate(r.date)}</td><td>${r.reason || '-'}</td><td></td>`;
      const btn = document.createElement('button');
      btn.className = 'btn ghost';
      btn.textContent = 'Remover';
      btn.style.padding = '6px 12px';
      btn.style.fontSize = '0.78rem';
      btn.addEventListener('click', async () => {
        await api('/api/admin/blocked-dates/' + r.date, { method: 'DELETE' });
        loadBlockedDates();
      });
      tr.lastElementChild.appendChild(btn);
      tbody.appendChild(tr);
    });
  }

  el('addBlockBtn').addEventListener('click', async () => {
    el('blockAlert').innerHTML = '';
    const date = el('blockDate').value;
    const reason = el('blockReason').value.trim();
    if (!date) {
      el('blockAlert').innerHTML = '<div class="alert error">Escolha uma data.</div>';
      return;
    }
    try {
      await api('/api/admin/blocked-dates', { method: 'POST', body: JSON.stringify({ date, reason }) });
      el('blockDate').value = '';
      el('blockReason').value = '';
      loadBlockedDates();
    } catch (err) {
      el('blockAlert').innerHTML = `<div class="alert error">${err.message}</div>`;
    }
  });

  // ---------- Serviços ----------

  async function loadServices() {
    const rows = await api('/api/admin/services');
    const tbody = document.querySelector('#svcTable tbody');
    tbody.innerHTML = '';
    const manSelect = el('manService');
    manSelect.innerHTML = '<option value="">Sem serviço específico</option>';

    rows.forEach((svc) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${svc.name}</td>
        <td>${svc.duration_minutes} min</td>
        <td>${fmtMoney(svc.price)}</td>
        <td></td>
        <td></td>
      `;
      const toggle = document.createElement('label');
      toggle.className = 'switch';
      toggle.innerHTML = `<input type="checkbox" ${svc.active ? 'checked' : ''}><span class="slider"></span>`;
      toggle.querySelector('input').addEventListener('change', async (e) => {
        await api(`/api/admin/services/${svc.id}`, { method: 'PUT', body: JSON.stringify({ active: e.target.checked }) });
      });
      tr.children[3].appendChild(toggle);

      const delBtn = document.createElement('button');
      delBtn.className = 'btn ghost';
      delBtn.textContent = 'Excluir';
      delBtn.style.padding = '6px 12px';
      delBtn.style.fontSize = '0.78rem';
      delBtn.addEventListener('click', async () => {
        if (!confirm('Excluir este serviço?')) return;
        await api(`/api/admin/services/${svc.id}`, { method: 'DELETE' });
        loadServices();
      });
      tr.children[4].appendChild(delBtn);

      tbody.appendChild(tr);

      if (svc.active) {
        const opt = document.createElement('option');
        opt.value = svc.id;
        opt.textContent = `${svc.name} (${svc.duration_minutes} min)`;
        manSelect.appendChild(opt);
      }
    });
  }

  el('addSvcBtn').addEventListener('click', async () => {
    el('svcAlert').innerHTML = '';
    const name = el('svcName').value.trim();
    const durationMinutes = el('svcDuration').value;
    const price = el('svcPrice').value;
    if (!name) {
      el('svcAlert').innerHTML = '<div class="alert error">Informe o nome do serviço.</div>';
      return;
    }
    try {
      await api('/api/admin/services', { method: 'POST', body: JSON.stringify({ name, durationMinutes, price }) });
      el('svcName').value = '';
      el('svcPrice').value = '';
      loadServices();
    } catch (err) {
      el('svcAlert').innerHTML = `<div class="alert error">${err.message}</div>`;
    }
  });

  // ---------- Configurações ----------

  async function loadSettingsForm() {
    const s = await api('/api/admin/settings');
    el('cfgName').value = s.barberName || '';
    el('cfgAddress').value = s.address || '';
    el('cfgPhone').value = s.phone || '';
    el('cfgWhatsapp').value = s.whatsapp || '';
    el('cfgInstagram').value = s.instagram || '';
    el('cfgSlotStep').value = s.slotStepMinutes;
    el('cfgMinNotice').value = s.minNoticeMinutes;
    el('cfgHorizon').value = s.bookingHorizonDays;
    el('adminTitle').textContent = 'Painel — ' + (s.barberName || '');
  }

  el('saveCfgBtn').addEventListener('click', async () => {
    el('cfgAlert').innerHTML = '';
    try {
      await api('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          barberName: el('cfgName').value.trim(),
          address: el('cfgAddress').value.trim(),
          phone: el('cfgPhone').value.trim(),
          whatsapp: el('cfgWhatsapp').value.trim(),
          instagram: el('cfgInstagram').value.trim(),
          slotStepMinutes: el('cfgSlotStep').value,
          minNoticeMinutes: el('cfgMinNotice').value,
          bookingHorizonDays: el('cfgHorizon').value
        })
      });
      el('cfgAlert').innerHTML = '<div class="alert success">Configurações salvas!</div>';
      el('adminTitle').textContent = 'Painel — ' + el('cfgName').value.trim();
    } catch (err) {
      el('cfgAlert').innerHTML = `<div class="alert error">${err.message}</div>`;
    }
  });

  el('savePwBtn').addEventListener('click', async () => {
    el('pwAlert').innerHTML = '';
    const currentPassword = el('pwCurrent').value;
    const newPassword = el('pwNew').value;
    try {
      await api('/api/admin/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
      el('pwAlert').innerHTML = '<div class="alert success">Senha alterada com sucesso!</div>';
      el('pwCurrent').value = '';
      el('pwNew').value = '';
    } catch (err) {
      el('pwAlert').innerHTML = `<div class="alert error">${err.message}</div>`;
    }
  });

  boot();
})();
