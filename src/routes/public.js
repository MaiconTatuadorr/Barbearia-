const express = require('express');
const { nanoid } = require('nanoid');
const { db, getSetting } = require('../db');
const { getAvailableSlots, isPastDate, isBlocked, getDayConfig, todayISO } = require('../availability');

const router = express.Router();

function publicInfo() {
  const services = db
    .prepare('SELECT id, name, duration_minutes, price FROM services WHERE active = 1 ORDER BY sort_order, id')
    .all();
  return {
    barberName: getSetting('barber_name', 'Studio do Cabeleireiro'),
    phone: getSetting('phone', ''),
    whatsapp: getSetting('whatsapp', ''),
    address: getSetting('address', ''),
    instagram: getSetting('instagram', ''),
    bookingHorizonDays: parseInt(getSetting('booking_horizon_days', '30'), 10),
    services
  };
}

router.get('/info', (req, res) => {
  res.json(publicInfo());
});

router.get('/availability', (req, res) => {
  const { date, serviceId } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Data inválida.' });
  }
  const service = serviceId
    ? db.prepare('SELECT * FROM services WHERE id = ? AND active = 1').get(serviceId)
    : null;
  const duration = service ? service.duration_minutes : parseInt(getSetting('slot_step_minutes', '30'), 10);

  const dayConfig = getDayConfig(date);
  const closed = isPastDate(date) || isBlocked(date) || !dayConfig || !dayConfig.enabled;

  res.json({
    date,
    closed,
    slots: closed ? [] : getAvailableSlots(date, duration)
  });
});

router.get('/calendar', (req, res) => {
  // Retorna, para os próximos N dias, se o dia está aberto ou fechado (rápido para pintar o calendário)
  const horizon = parseInt(getSetting('booking_horizon_days', '30'), 10);
  const today = new Date();
  const days = [];
  for (let i = 0; i < horizon; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayConfig = getDayConfig(dateStr);
    const closed = isBlocked(dateStr) || !dayConfig || !dayConfig.enabled;
    days.push({ date: dateStr, closed });
  }
  res.json({ days });
});

router.post('/book', (req, res) => {
  const { date, time, serviceId, name, phone, notes } = req.body || {};

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Data inválida.' });
  }
  if (!time || !/^\d{2}:\d{2}$/.test(time)) {
    return res.status(400).json({ error: 'Horário inválido.' });
  }
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Informe seu nome.' });
  }
  if (!phone || !phone.trim()) {
    return res.status(400).json({ error: 'Informe seu telefone/WhatsApp.' });
  }
  if (isPastDate(date)) {
    return res.status(400).json({ error: 'Não é possível agendar em uma data passada.' });
  }
  if (isBlocked(date)) {
    return res.status(409).json({ error: 'Esta data não está disponível.' });
  }

  const service = serviceId
    ? db.prepare('SELECT * FROM services WHERE id = ? AND active = 1').get(serviceId)
    : null;
  const duration = service ? service.duration_minutes : parseInt(getSetting('slot_step_minutes', '30'), 10);

  const available = getAvailableSlots(date, duration);
  if (!available.includes(time)) {
    return res.status(409).json({ error: 'Este horário acabou de ficar indisponível. Escolha outro.' });
  }

  const cancelToken = nanoid(24);
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
      name.trim(),
      phone.trim(),
      (notes || '').trim(),
      cancelToken
    );

  res.status(201).json({
    id: info.lastInsertRowid,
    date,
    time,
    service: service ? service.name : 'Atendimento',
    cancelToken
  });
});

router.get('/appointment/:token', (req, res) => {
  const appt = db
    .prepare(
      "SELECT id, date, time, service_name, client_name, status FROM appointments WHERE cancel_token = ?"
    )
    .get(req.params.token);
  if (!appt) return res.status(404).json({ error: 'Agendamento não encontrado.' });
  res.json({ ...appt, barberName: getSetting('barber_name', '') });
});

router.post('/appointment/:token/cancel', (req, res) => {
  const appt = db
    .prepare('SELECT * FROM appointments WHERE cancel_token = ?')
    .get(req.params.token);
  if (!appt) return res.status(404).json({ error: 'Agendamento não encontrado.' });
  if (appt.status === 'cancelled') return res.json({ ok: true, alreadyCancelled: true });

  db.prepare("UPDATE appointments SET status = 'cancelled' WHERE id = ?").run(appt.id);
  res.json({ ok: true });
});

module.exports = router;
