const express = require('express');
const bcrypt = require('bcryptjs');
const { db, getSetting, setSetting } = require('../db');

const router = express.Router();

function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Não autenticado.' });
}

// --- Setup / autenticação ---

router.get('/status', (req, res) => {
  res.json({
    setupComplete: getSetting('setup_complete', 'false') === 'true',
    isAuthenticated: !!(req.session && req.session.isAdmin)
  });
});

router.post('/setup', (req, res) => {
  const already = getSetting('setup_complete', 'false') === 'true';
  if (already) return res.status(409).json({ error: 'Configuração já concluída.' });

  const { barberName, password } = req.body || {};
  if (!barberName || !barberName.trim()) {
    return res.status(400).json({ error: 'Informe o nome do cabeleireiro/barbearia.' });
  }
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'A senha deve ter pelo menos 4 caracteres.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  setSetting('barber_name', barberName.trim());
  setSetting('admin_password_hash', hash);
  setSetting('setup_complete', 'true');

  req.session.isAdmin = true;
  res.json({ ok: true });
});

router.post('/login', (req, res) => {
  const { password } = req.body || {};
  const hash = getSetting('admin_password_hash');
  if (!hash) return res.status(400).json({ error: 'Configuração inicial ainda não concluída.' });
  if (!password || !bcrypt.compareSync(password, hash)) {
    return res.status(401).json({ error: 'Senha incorreta.' });
  }
  req.session.isAdmin = true;
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.use(requireAuth);

router.post('/password', (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const hash = getSetting('admin_password_hash');
  if (!currentPassword || !bcrypt.compareSync(currentPassword, hash)) {
    return res.status(401).json({ error: 'Senha atual incorreta.' });
  }
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'A nova senha deve ter pelo menos 4 caracteres.' });
  }
  setSetting('admin_password_hash', bcrypt.hashSync(newPassword, 10));
  res.json({ ok: true });
});

// --- Configurações gerais ---

router.get('/settings', (req, res) => {
  res.json({
    barberName: getSetting('barber_name', ''),
    phone: getSetting('phone', ''),
    whatsapp: getSetting('whatsapp', ''),
    address: getSetting('address', ''),
    instagram: getSetting('instagram', ''),
    slotStepMinutes: parseInt(getSetting('slot_step_minutes', '30'), 10),
    minNoticeMinutes: parseInt(getSetting('min_notice_minutes', '60'), 10),
    bookingHorizonDays: parseInt(getSetting('booking_horizon_days', '30'), 10)
  });
});

router.put('/settings', (req, res) => {
  const allowed = [
    'barberName',
    'phone',
    'whatsapp',
    'address',
    'instagram',
    'slotStepMinutes',
    'minNoticeMinutes',
    'bookingHorizonDays'
  ];
  const map = {
    barberName: 'barber_name',
    phone: 'phone',
    whatsapp: 'whatsapp',
    address: 'address',
    instagram: 'instagram',
    slotStepMinutes: 'slot_step_minutes',
    minNoticeMinutes: 'min_notice_minutes',
    bookingHorizonDays: 'booking_horizon_days'
  };
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      setSetting(map[key], req.body[key]);
    }
  }
  res.json({ ok: true });
});

// --- Horários de funcionamento ---

router.get('/working-hours', (req, res) => {
  const rows = db.prepare('SELECT * FROM working_hours ORDER BY weekday').all();
  res.json(rows);
});

router.put('/working-hours', (req, res) => {
  const days = req.body.days;
  if (!Array.isArray(days)) return res.status(400).json({ error: 'Formato inválido.' });
  const stmt = db.prepare(
    `UPDATE working_hours SET enabled=?, start_time=?, end_time=?, break_start=?, break_end=? WHERE weekday=?`
  );
  const tx = db.transaction((list) => {
    for (const d of list) {
      stmt.run(
        d.enabled ? 1 : 0,
        d.start_time || '09:00',
        d.end_time || '19:00',
        d.break_start || null,
        d.break_end || null,
        d.weekday
      );
    }
  });
  tx(days);
  res.json({ ok: true });
});

// --- Dias bloqueados (folgas/feriados) ---

router.get('/blocked-dates', (req, res) => {
  const rows = db.prepare('SELECT * FROM blocked_dates ORDER BY date').all();
  res.json(rows);
});

router.post('/blocked-dates', (req, res) => {
  const { date, reason } = req.body || {};
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Data inválida.' });
  }
  db.prepare(
    'INSERT INTO blocked_dates (date, reason) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET reason = excluded.reason'
  ).run(date, reason || '');
  res.json({ ok: true });
});

router.delete('/blocked-dates/:date', (req, res) => {
  db.prepare('DELETE FROM blocked_dates WHERE date = ?').run(req.params.date);
  res.json({ ok: true });
});

// --- Serviços ---

router.get('/services', (req, res) => {
  res.json(db.prepare('SELECT * FROM services ORDER BY sort_order, id').all());
});

router.post('/services', (req, res) => {
  const { name, durationMinutes, price } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Informe o nome do serviço.' });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM services').get().m;
  const info = db
    .prepare('INSERT INTO services (name, duration_minutes, price, active, sort_order) VALUES (?,?,?,1,?)')
    .run(name.trim(), parseInt(durationMinutes, 10) || 30, price === '' || price == null ? null : Number(price), maxOrder + 1);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/services/:id', (req, res) => {
  const { name, durationMinutes, price, active } = req.body || {};
  const existing = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Serviço não encontrado.' });
  db.prepare('UPDATE services SET name=?, duration_minutes=?, price=?, active=? WHERE id=?').run(
    name !== undefined ? name.trim() : existing.name,
    durationMinutes !== undefined ? parseInt(durationMinutes, 10) : existing.duration_minutes,
    price !== undefined ? (price === '' || price == null ? null : Number(price)) : existing.price,
    active !== undefined ? (active ? 1 : 0) : existing.active,
    req.params.id
  );
  res.json({ ok: true });
});

router.delete('/services/:id', (req, res) => {
  db.prepare('DELETE FROM services WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- Agendamentos ---

router.get('/appointments', (req, res) => {
  const { from, to, status } = req.query;
  let query = 'SELECT * FROM appointments WHERE 1=1';
  const params = [];
  if (from) {
    query += ' AND date >= ?';
    params.push(from);
  }
  if (to) {
    query += ' AND date <= ?';
    params.push(to);
  }
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  query += ' ORDER BY date, time';
  res.json(db.prepare(query).all(...params));
});

router.post('/appointments/:id/cancel', (req, res) => {
  db.prepare("UPDATE appointments SET status = 'cancelled' WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

router.delete('/appointments/:id', (req, res) => {
  db.prepare('DELETE FROM appointments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/appointments', (req, res) => {
  // Permite o barbeiro criar um agendamento manual (ex: cliente que ligou)
  const { date, time, serviceId, clientName, clientPhone, notes, durationMinutes } = req.body || {};
  if (!date || !time || !clientName) {
    return res.status(400).json({ error: 'Preencha data, horário e nome do cliente.' });
  }
  const service = serviceId ? db.prepare('SELECT * FROM services WHERE id = ?').get(serviceId) : null;
  const duration = durationMinutes || (service ? service.duration_minutes : 30);
  const { nanoid } = require('nanoid');
  const info = db
    .prepare(
      `INSERT INTO appointments (date, time, duration_minutes, service_id, service_name, client_name, client_phone, notes, status, cancel_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)`
    )
    .run(
      date,
      time,
      duration,
      service ? service.id : null,
      service ? service.name : 'Atendimento',
      clientName.trim(),
      (clientPhone || '').trim(),
      (notes || '').trim(),
      nanoid(24)
    );
  res.status(201).json({ id: info.lastInsertRowid });
});

module.exports = router;
