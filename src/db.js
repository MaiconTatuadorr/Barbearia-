const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'barbearia.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS working_hours (
  weekday INTEGER PRIMARY KEY, -- 0=domingo ... 6=sabado
  enabled INTEGER NOT NULL DEFAULT 0,
  start_time TEXT NOT NULL DEFAULT '09:00',
  end_time TEXT NOT NULL DEFAULT '19:00',
  break_start TEXT,
  break_end TEXT
);

CREATE TABLE IF NOT EXISTS blocked_dates (
  date TEXT PRIMARY KEY,
  reason TEXT
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  price REAL,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,       -- YYYY-MM-DD
  time TEXT NOT NULL,       -- HH:MM
  duration_minutes INTEGER NOT NULL,
  service_id INTEGER,
  service_name TEXT,
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed', -- confirmed | cancelled
  cancel_token TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (service_id) REFERENCES services(id)
);

CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
`);

function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (@key, @value) ON CONFLICT(key) DO UPDATE SET value = @value'
  ).run({ key, value: String(value) });
}

// --- Seed defaults on first run ---
function seedDefaults() {
  const defaults = {
    barber_name: 'Studio do Cabeleireiro',
    phone: '',
    whatsapp: '',
    address: '',
    instagram: '',
    slot_step_minutes: '30',
    min_notice_minutes: '60',
    booking_horizon_days: '30',
    setup_complete: 'false'
  };
  for (const [k, v] of Object.entries(defaults)) {
    if (getSetting(k) === null) setSetting(k, v);
  }

  const whCount = db.prepare('SELECT COUNT(*) AS c FROM working_hours').get().c;
  if (whCount === 0) {
    const insert = db.prepare(
      'INSERT INTO working_hours (weekday, enabled, start_time, end_time, break_start, break_end) VALUES (?,?,?,?,?,?)'
    );
    // Segunda(1) a Sábado(6) habilitados por padrão, Domingo(0) fechado
    for (let wd = 0; wd <= 6; wd++) {
      const enabled = wd === 0 ? 0 : 1;
      insert.run(wd, enabled, '09:00', '19:00', '12:00', '13:00');
    }
  }

  const svcCount = db.prepare('SELECT COUNT(*) AS c FROM services').get().c;
  if (svcCount === 0) {
    const insert = db.prepare(
      'INSERT INTO services (name, duration_minutes, price, active, sort_order) VALUES (?,?,?,1,?)'
    );
    insert.run('Corte de Cabelo', 30, 40, 0);
    insert.run('Barba', 20, 25, 1);
    insert.run('Corte + Barba', 50, 60, 2);
  }
}

seedDefaults();

module.exports = { db, getSetting, setSetting };
