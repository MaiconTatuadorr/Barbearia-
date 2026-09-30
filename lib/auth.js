const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas

export async function createSession(db) {
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await db.prepare('INSERT INTO admin_sessions (token, expires_at) VALUES (?, ?)').bind(token, expiresAt).run();
  return { token, expiresAt };
}

export async function isSessionValid(db, token) {
  if (!token) return false;
  const row = await db.prepare('SELECT expires_at FROM admin_sessions WHERE token = ?').bind(token).first();
  if (!row) return false;
  if (row.expires_at < Date.now()) {
    await db.prepare('DELETE FROM admin_sessions WHERE token = ?').bind(token).run();
    return false;
  }
  return true;
}

export async function destroySession(db, token) {
  if (!token) return;
  await db.prepare('DELETE FROM admin_sessions WHERE token = ?').bind(token).run();
}
