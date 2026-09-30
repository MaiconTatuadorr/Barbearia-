import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import bcrypt from 'bcryptjs';
import { getSetting, setSetting } from './settings.js';
import { getAvailableSlots, isPastDate, isBlocked, getDayConfig, todayISO } from './availability.js';
import { createSession, isSessionValid, destroySession } from './auth.js';

const app = new Hono();
const COOKIE_NAME = 'barbearia_session';

// ---------------------------------------------------------------------------
// API pública (cliente)
// ---------------------------------------------------------------------------

app.get('/api/public/info', async (c) => {
  const db = c.env.DB;
  const { results: services } = await db
    .prepare('SELECT id, name, duration_minutes, price FROM services WHERE active = 1 ORDER BY sort_order, id')
    .all();
  return c.json({
    barberName: await getSetting(db, 'barber_name', 'Studio do Cabeleireiro'),
    phone: await getSetting(db, 'phone', ''),
    whatsapp: await getSetting(db, 'whatsapp', ''),
    address: await getSetting(db, 'address', ''),
    instagram: await getSetting(db, 'instagram', ''),
    bookingHorizonDays: parseInt(await getSetting(db, 'booking_horizon_days', '30'), 10),
    services
  });
});

app.get('/api/public/availability', async (c) => {
  const db = c.env.DB;
  const date = c.req.query('date');
  const serviceId = c.req.query('serviceId');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ error: 'Data inválida.' }, 400);
  }
  const service = serviceId
    ? await db.prepare('SELECT * FROM services WHERE id = ? AND active = 1').bind(serviceId).first()
    : null;
  const duration = service ? service.duration_minutes : parseInt(await getSetting(db, 'slot_step_minutes', '30'), 10);

  const dayConfig = await getDayConfig(db, date);
  const closed = isPastDate(date) || (await isBlocked(db, date)) || !dayConfig || !dayConfig.enabled;

  return c.json({
    date,
    closed,
    slots: closed ? [] : await getAvailableSlots(db, date, duration)
  });
});

app.get('/api/public/calendar', async (c) => {
  const db = c.env.DB;
  const horizon = parseInt(await getSetting(db, 'booking_horizon_days', '30'), 10);
  const today = new Date();
  const days = [];
  for (let i = 0; i < horizon; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayConfig = await getDayConfig(db, dateStr);
    const closed = (await isBlocked(db, dateStr)) || !dayConfig || !dayConfig.enabled;
    days.push({ date: dateStr, closed });
  }
  return c.json({ days });
});

app.post('/api/public/book', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  const { date, time, serviceId, name, phone, notes } = body;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: 'Data inválida.' }, 400);
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return c.json({ error: 'Horário inválido.' }, 400);
  if (!name || !name.trim()) return c.json({ error: 'Informe seu nome.' }, 400);
  if (!phone || !phone.trim()) return c.json({ error: 'Informe seu telefone/WhatsApp.' }, 400);
  if (isPastDate(date)) return c.json({ error: 'Não é possível agendar em uma data passada.' }, 400);
  if (await isBlocked(db, date)) return c.json({ error: 'Esta data não está disponível.' }, 409);

  const service = serviceId
    ? await db.prepare('SELECT * FROM services WHERE id = ? AND active = 1').bind(serviceId).first()
    : null;
  const duration = service ? service.duration_minutes : parseInt(await getSetting(db, 'slot_step_minutes', '30'), 10);

  const available = await getAvailableSlots(db, date, duration);
  if (!available.includes(time)) {
    return c.json({ error: 'Este horário acabou de ficar indisponível. Escolha outro.' }, 409);
  }

  const cancelToken = crypto.randomUUID();
  const result = await db
    .prepare(
      `INSERT INTO appointments (date, time, duration_minutes, service_id, service_name, client_name, client_phone, notes, status, cancel_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)`
    )
    .bind(
      date,
      time,
      duration,
      service ? service.id : null,
      service ? service.name : 'Atendimento',
      name.trim(),
      phone.trim(),
      (notes || '').trim(),
      cancelToken
    )
    .run();

  return c.json(
    {
      id: result.meta.last_row_id,
      date,
      time,
      service: service ? service.name : 'Atendimento',
      cancelToken
    },
    201
  );
});

app.get('/api/public/appointment/:token', async (c) => {
  const db = c.env.DB;
  const appt = await db
    .prepare('SELECT id, date, time, service_name, client_name, status FROM appointments WHERE cancel_token = ?')
    .bind(c.req.param('token'))
    .first();
  if (!appt) return c.json({ error: 'Agendamento não encontrado.' }, 404);
  return c.json({ ...appt, barberName: await getSetting(db, 'barber_name', '') });
});

app.post('/api/public/appointment/:token/cancel', async (c) => {
  const db = c.env.DB;
  const appt = await db.prepare('SELECT * FROM appointments WHERE cancel_token = ?').bind(c.req.param('token')).first();
  if (!appt) return c.json({ error: 'Agendamento não encontrado.' }, 404);
  if (appt.status === 'cancelled') return c.json({ ok: true, alreadyCancelled: true });

  await db.prepare("UPDATE appointments SET status = 'cancelled' WHERE id = ?").bind(appt.id).run();
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// API do painel (admin)
// ---------------------------------------------------------------------------

async function requireAuth(c, next) {
  const token = getCookie(c, COOKIE_NAME);
  const ok = await isSessionValid(c.env.DB, token);
  if (!ok) return c.json({ error: 'Não autenticado.' }, 401);
  await next();
}

app.get('/api/admin/status', async (c) => {
  const db = c.env.DB;
  const token = getCookie(c, COOKIE_NAME);
  return c.json({
    setupComplete: (await getSetting(db, 'setup_complete', 'false')) === 'true',
    isAuthenticated: await isSessionValid(db, token)
  });
});

app.post('/api/admin/setup', async (c) => {
  const db = c.env.DB;
  const already = (await getSetting(db, 'setup_complete', 'false')) === 'true';
  if (already) return c.json({ error: 'Configuração já concluída.' }, 409);

  const body = await c.req.json().catch(() => ({}));
  const { barberName, password } = body;
  if (!barberName || !barberName.trim()) return c.json({ error: 'Informe o nome do cabeleireiro/barbearia.' }, 400);
  if (!password || password.length < 4) return c.json({ error: 'A senha deve ter pelo menos 4 caracteres.' }, 400);

  const hash = bcrypt.hashSync(password, 10);
  await setSetting(db, 'barber_name', barberName.trim());
  await setSetting(db, 'admin_password_hash', hash);
  await setSetting(db, 'setup_complete', 'true');

  const { token, expiresAt } = await createSession(db);
  setCookie(c, COOKIE_NAME, token, cookieOpts(expiresAt));
  return c.json({ ok: true });
});

app.post('/api/admin/login', async (c) => {
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  const { password } = body;
  const hash = await getSetting(db, 'admin_password_hash');
  if (!hash) return c.json({ error: 'Configuração inicial ainda não concluída.' }, 400);
  if (!password || !bcrypt.compareSync(password, hash)) return c.json({ error: 'Senha incorreta.' }, 401);

  const { token, expiresAt } = await createSession(db);
  setCookie(c, COOKIE_NAME, token, cookieOpts(expiresAt));
  return c.json({ ok: true });
});

app.post('/api/admin/logout', async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  await destroySession(c.env.DB, token);
  deleteCookie(c, COOKIE_NAME, { path: '/' });
  return c.json({ ok: true });
});

function cookieOpts(expiresAtMs) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    expires: new Date(expiresAtMs)
  };
}

app.post('/api/admin/password', requireAuth, async (c) => {
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  const { currentPassword, newPassword } = body;
  const hash = await getSetting(db, 'admin_password_hash');
  if (!currentPassword || !bcrypt.compareSync(currentPassword, hash)) {
    return c.json({ error: 'Senha atual incorreta.' }, 401);
  }
  if (!newPassword || newPassword.length < 4) return c.json({ error: 'A nova senha deve ter pelo menos 4 caracteres.' }, 400);
  await setSetting(db, 'admin_password_hash', bcrypt.hashSync(newPassword, 10));
  return c.json({ ok: true });
});

app.get('/api/admin/settings', requireAuth, async (c) => {
  const db = c.env.DB;
  return c.json({
    barberName: await getSetting(db, 'barber_name', ''),
    phone: await getSetting(db, 'phone', ''),
    whatsapp: await getSetting(db, 'whatsapp', ''),
    address: await getSetting(db, 'address', ''),
    instagram: await getSetting(db, 'instagram', ''),
    slotStepMinutes: parseInt(await getSetting(db, 'slot_step_minutes', '30'), 10),
    minNoticeMinutes: parseInt(await getSetting(db, 'min_notice_minutes', '60'), 10),
    bookingHorizonDays: parseInt(await getSetting(db, 'booking_horizon_days', '30'), 10)
  });
});

app.put('/api/admin/settings', requireAuth, async (c) => {
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
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
  for (const [key, column] of Object.entries(map)) {
    if (body[key] !== undefined) await setSetting(db, column, body[key]);
  }
  return c.json({ ok: true });
});

app.get('/api/admin/working-hours', requireAuth, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM working_hours ORDER BY weekday').all();
  return c.json(results);
});

app.put('/api/admin/working-hours', requireAuth, async (c) => {
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  const days = body.days;
  if (!Array.isArray(days)) return c.json({ error: 'Formato inválido.' }, 400);

  const stmt = db.prepare(
    'UPDATE working_hours SET enabled=?, start_time=?, end_time=?, break_start=?, break_end=? WHERE weekday=?'
  );
  const batch = days.map((d) =>
    stmt.bind(d.enabled ? 1 : 0, d.start_time || '09:00', d.end_time || '19:00', d.break_start || null, d.break_end || null, d.weekday)
  );
  await db.batch(batch);
  return c.json({ ok: true });
});

app.get('/api/admin/blocked-dates', requireAuth, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM blocked_dates ORDER BY date').all();
  return c.json(results);
});

app.post('/api/admin/blocked-dates', requireAuth, async (c) => {
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  const { date, reason } = body;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: 'Data inválida.' }, 400);
  await db
    .prepare('INSERT INTO blocked_dates (date, reason) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET reason = excluded.reason')
    .bind(date, reason || '')
    .run();
  return c.json({ ok: true });
});

app.delete('/api/admin/blocked-dates/:date', requireAuth, async (c) => {
  await c.env.DB.prepare('DELETE FROM blocked_dates WHERE date = ?').bind(c.req.param('date')).run();
  return c.json({ ok: true });
});

app.get('/api/admin/services', requireAuth, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM services ORDER BY sort_order, id').all();
  return c.json(results);
});

app.post('/api/admin/services', requireAuth, async (c) => {
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  const { name, durationMinutes, price } = body;
  if (!name || !name.trim()) return c.json({ error: 'Informe o nome do serviço.' }, 400);
  const maxRow = await db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM services').first();
  const result = await db
    .prepare('INSERT INTO services (name, duration_minutes, price, active, sort_order) VALUES (?,?,?,1,?)')
    .bind(name.trim(), parseInt(durationMinutes, 10) || 30, price === '' || price == null ? null : Number(price), maxRow.m + 1)
    .run();
  return c.json({ id: result.meta.last_row_id }, 201);
});

app.put('/api/admin/services/:id', requireAuth, async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const existing = await db.prepare('SELECT * FROM services WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ error: 'Serviço não encontrado.' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const { name, durationMinutes, price, active } = body;
  await db
    .prepare('UPDATE services SET name=?, duration_minutes=?, price=?, active=? WHERE id=?')
    .bind(
      name !== undefined ? name.trim() : existing.name,
      durationMinutes !== undefined ? parseInt(durationMinutes, 10) : existing.duration_minutes,
      price !== undefined ? (price === '' || price == null ? null : Number(price)) : existing.price,
      active !== undefined ? (active ? 1 : 0) : existing.active,
      id
    )
    .run();
  return c.json({ ok: true });
});

app.delete('/api/admin/services/:id', requireAuth, async (c) => {
  await c.env.DB.prepare('DELETE FROM services WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

app.get('/api/admin/appointments', requireAuth, async (c) => {
  const db = c.env.DB;
  const from = c.req.query('from');
  const to = c.req.query('to');
  const status = c.req.query('status');
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
  const { results } = await db.prepare(query).bind(...params).all();
  return c.json(results);
});

app.post('/api/admin/appointments/:id/cancel', requireAuth, async (c) => {
  await c.env.DB.prepare("UPDATE appointments SET status = 'cancelled' WHERE id = ?").bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

app.delete('/api/admin/appointments/:id', requireAuth, async (c) => {
  await c.env.DB.prepare('DELETE FROM appointments WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

app.post('/api/admin/appointments', requireAuth, async (c) => {
  const db = c.env.DB;
  const body = await c.req.json().catch(() => ({}));
  const { date, time, serviceId, clientName, clientPhone, notes, durationMinutes } = body;
  if (!date || !time || !clientName) return c.json({ error: 'Preencha data, horário e nome do cliente.' }, 400);

  const service = serviceId ? await db.prepare('SELECT * FROM services WHERE id = ?').bind(serviceId).first() : null;
  const duration = durationMinutes || (service ? service.duration_minutes : 30);

  const result = await db
    .prepare(
      `INSERT INTO appointments (date, time, duration_minutes, service_id, service_name, client_name, client_phone, notes, status, cancel_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)`
    )
    .bind(
      date,
      time,
      duration,
      service ? service.id : null,
      service ? service.name : 'Atendimento',
      clientName.trim(),
      (clientPhone || '').trim(),
      (notes || '').trim(),
      crypto.randomUUID()
    )
    .run();

  return c.json({ id: result.meta.last_row_id }, 201);
});

app.notFound((c) => c.json({ error: 'Rota não encontrada.' }, 404));

export default app;
