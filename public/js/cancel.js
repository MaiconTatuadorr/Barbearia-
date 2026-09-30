(function () {
  const card = document.getElementById('card');
  const params = new URLSearchParams(location.search);
  const token = params.get('token');

  function fmtDateLabel(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  }

  async function api(path, opts) {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erro inesperado.');
    return data;
  }

  async function load() {
    if (!token) {
      card.innerHTML = '<div class="alert error">Link inválido.</div>';
      return;
    }
    try {
      const appt = await api('/api/public/appointment/' + token);
      if (appt.status === 'cancelled') {
        card.innerHTML = `
          <h2>Agendamento já cancelado</h2>
          <p class="footer-note">Este agendamento já havia sido cancelado anteriormente.</p>
        `;
        return;
      }
      card.innerHTML = `
        <h2>Confirmar cancelamento</h2>
        <div class="summary-row"><span class="label">Cliente</span><span>${appt.client_name}</span></div>
        <div class="summary-row"><span class="label">Serviço</span><span>${appt.service_name || '-'}</span></div>
        <div class="summary-row"><span class="label">Data</span><span>${fmtDateLabel(appt.date)}</span></div>
        <div class="summary-row"><span class="label">Horário</span><span>${appt.time}</span></div>
        <div id="alertArea"></div>
        <div class="actions">
          <button class="btn danger" id="cancelBtn">Cancelar meu horário</button>
        </div>
      `;
      document.getElementById('cancelBtn').addEventListener('click', doCancel);
    } catch (err) {
      card.innerHTML = `<div class="alert error">${err.message}</div>`;
    }
  }

  async function doCancel() {
    const btn = document.getElementById('cancelBtn');
    btn.disabled = true;
    btn.textContent = 'Cancelando...';
    try {
      await api('/api/public/appointment/' + token + '/cancel', { method: 'POST' });
      card.innerHTML = `
        <div class="success-icon">✅</div>
        <h2 style="text-align:center;">Agendamento cancelado</h2>
        <p class="footer-note" style="text-align:center;">Seu horário foi liberado. Você pode agendar novamente quando quiser.</p>
        <div class="actions" style="justify-content:center;">
          <a class="btn" href="/">Fazer novo agendamento</a>
        </div>
      `;
    } catch (err) {
      document.getElementById('alertArea').innerHTML = `<div class="alert error">${err.message}</div>`;
      btn.disabled = false;
      btn.textContent = 'Cancelar meu horário';
    }
  }

  load();
})();
