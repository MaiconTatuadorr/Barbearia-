-- Estrutura inicial do banco (Cloudflare D1)

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
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
CREATE INDEX IF NOT EXISTS idx_appointments_token ON appointments(cancel_token);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

-- Horários padrão: Segunda a Sábado 09:00-19:00 com almoço 12:00-13:00, Domingo fechado
INSERT OR IGNORE INTO working_hours (weekday, enabled, start_time, end_time, break_start, break_end) VALUES
  (0, 0, '09:00', '19:00', '12:00', '13:00'),
  (1, 1, '09:00', '19:00', '12:00', '13:00'),
  (2, 1, '09:00', '19:00', '12:00', '13:00'),
  (3, 1, '09:00', '19:00', '12:00', '13:00'),
  (4, 1, '09:00', '19:00', '12:00', '13:00'),
  (5, 1, '09:00', '19:00', '12:00', '13:00'),
  (6, 1, '09:00', '19:00', '12:00', '13:00');

INSERT OR IGNORE INTO services (id, name, duration_minutes, price, active, sort_order) VALUES
  (1, 'Corte de Cabelo', 30, 40, 1, 0),
  (2, 'Barba', 20, 25, 1, 1),
  (3, 'Corte + Barba', 50, 60, 1, 2);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('barber_name', 'Studio do Cabeleireiro'),
  ('phone', ''),
  ('whatsapp', ''),
  ('address', ''),
  ('instagram', ''),
  ('slot_step_minutes', '30'),
  ('min_notice_minutes', '60'),
  ('booking_horizon_days', '30'),
  ('setup_complete', 'false');
