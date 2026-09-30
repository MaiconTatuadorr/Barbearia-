const { db, getSetting } = require('./db');

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function toHHMM(mins) {
  const h = Math.floor(mins / 60)
    .toString()
    .padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function isPastDate(dateStr) {
  return dateStr < todayISO();
}

function getWeekday(dateStr) {
  // dateStr = YYYY-MM-DD, tratado como data local (meio-dia p/ evitar fuso)
  const d = new Date(dateStr + 'T12:00:00');
  return d.getDay();
}

function isBlocked(dateStr) {
  const row = db.prepare('SELECT 1 FROM blocked_dates WHERE date = ?').get(dateStr);
  return !!row;
}

function getDayConfig(dateStr) {
  const weekday = getWeekday(dateStr);
  return db.prepare('SELECT * FROM working_hours WHERE weekday = ?').get(weekday);
}

function getBookedRanges(dateStr) {
  const rows = db
    .prepare(
      "SELECT time, duration_minutes FROM appointments WHERE date = ? AND status = 'confirmed'"
    )
    .all(dateStr);
  return rows.map((r) => {
    const start = toMinutes(r.time);
    return { start, end: start + r.duration_minutes };
  });
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Retorna lista de horários (HH:MM) disponíveis para a data e duração do serviço.
 */
function getAvailableSlots(dateStr, durationMinutes) {
  if (isPastDate(dateStr)) return [];
  if (isBlocked(dateStr)) return [];

  const dayConfig = getDayConfig(dateStr);
  if (!dayConfig || !dayConfig.enabled) return [];

  const step = parseInt(getSetting('slot_step_minutes', '30'), 10);
  const minNotice = parseInt(getSetting('min_notice_minutes', '60'), 10);

  const windowStart = toMinutes(dayConfig.start_time);
  const windowEnd = toMinutes(dayConfig.end_time);
  const breakStart = dayConfig.break_start ? toMinutes(dayConfig.break_start) : null;
  const breakEnd = dayConfig.break_end ? toMinutes(dayConfig.break_end) : null;

  const booked = getBookedRanges(dateStr);

  const now = new Date();
  const isToday = dateStr === todayISO();
  const nowMinutesWithNotice = now.getHours() * 60 + now.getMinutes() + minNotice;

  const slots = [];
  for (let start = windowStart; start + durationMinutes <= windowEnd; start += step) {
    const end = start + durationMinutes;

    if (isToday && start < nowMinutesWithNotice) continue;

    if (breakStart !== null && breakEnd !== null && overlaps(start, end, breakStart, breakEnd)) {
      continue;
    }

    const conflict = booked.some((b) => overlaps(start, end, b.start, b.end));
    if (conflict) continue;

    slots.push(toHHMM(start));
  }

  return slots;
}

module.exports = {
  getAvailableSlots,
  isPastDate,
  isBlocked,
  getDayConfig,
  todayISO,
  getWeekday
};
