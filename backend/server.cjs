'use strict';
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const JWT_SECRET = 'dev-secret';

// SQLite DB setup
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'app.db');
const db = new Database(dbPath);

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    passwordHash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user','admin'))
  );
  CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    register_date TEXT NOT NULL,
    installation_area TEXT,
    domain TEXT,
    battery INTEGER NOT NULL DEFAULT 100,
    category TEXT
  );
  CREATE TABLE IF NOT EXISTS paired_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address TEXT UNIQUE,
    name TEXT
  );
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );
`);

// Seed users if table empty
const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
if (!userCount) {
  const seed = db.prepare('INSERT INTO users (phone, passwordHash, role) VALUES (?, ?, ?)');
  seed.run('9999999999', bcrypt.hashSync('admin123', 8), 'admin');
  seed.run('8888888888', bcrypt.hashSync('user123', 8), 'user');
}

// Seed devices if empty
const devCount = db.prepare('SELECT COUNT(*) as c FROM devices').get().c;
if (!devCount) {
  const seedDev = db.prepare(`INSERT INTO devices (name, active, register_date, installation_area, domain, battery, category)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  seedDev.run('BT Sensor 01', 1, '2025-08-10', 'Line A', 'Factory', 92, 'Sensor');
  seedDev.run('Gateway 001', 1, '2025-07-22', 'Panel 3', 'Factory', 100, 'Gateway');
  seedDev.run('Tilt 02', 0, '2025-06-11', 'Shed B', 'Yard', 75, 'Sensor');
}

// Seed categories (idempotent)
try {
  const seedCat = db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)');
  ['Sensor', 'Gateway', 'Tiltmeter', 'Vibration'].forEach((n) => {
    try { seedCat.run(n); } catch {}
  });
} catch {}

// temp token store for OTP
const tempTokens = new Map();

// Helpers
function signJwt(payload, opts) {
  return jwt.sign(payload, JWT_SECRET, opts);
}
function verifyJwt(token) {
  return jwt.verify(token, JWT_SECRET);
}

// Routes
app.post('/api/auth/login', (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return res.status(400).json({ error: 'Missing phone or password' });
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  // Direct login without OTP - return JWT token immediately
  const token = signJwt({ sub: user.id, role: user.role }, { expiresIn: '8h' });
  res.json({ token, role: user.role });
});

app.post('/api/auth/verify-otp', (req, res) => {
  const { otp, tempToken } = req.body;
  const rec = tempTokens.get(tempToken);
  if (!rec || rec.expires < Date.now()) return res.status(401).json({ error: 'Temp token expired' });
  if (rec.otp !== otp) return res.status(401).json({ error: 'Invalid OTP' });
  const user = db.prepare('SELECT id, role FROM users WHERE phone = ?').get(rec.phone);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const token = signJwt({ sub: user.id, role: user.role }, { expiresIn: '8h' });
  res.json({ token, role: user.role });
});

app.get('/api/auth/me', (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  try {
    const decoded = verifyJwt(token);
    return res.json({ role: decoded.role });
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

// Middleware
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  try {
    req.user = verifyJwt(token);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  next();
}

// Devices CRUD (open for now)
app.get('/api/devices', (req, res) => {
  const rows = db.prepare('SELECT * FROM devices ORDER BY id').all();
  res.json(rows);
});

app.post('/api/devices', (req, res) => {
  const { name, active = 1, register_date, installation_area, domain, battery = 100, category } = req.body || {};
  if (!name || !register_date) return res.status(400).json({ error: 'Missing required fields' });
  const stmt = db.prepare(`INSERT INTO devices (name, active, register_date, installation_area, domain, battery, category)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const info = stmt.run(name, Number(active) ? 1 : 0, register_date, installation_area || null, domain || null, Number(battery) || 0, category || null);
  const row = db.prepare('SELECT * FROM devices WHERE id = ?').get(info.lastInsertRowid);
  res.json(row);
});

app.put('/api/devices/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, active, register_date, installation_area, domain, battery, category } = req.body || {};
  const current = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
  if (!current) return res.status(404).json({ error: 'Not found' });
  const stmt = db.prepare(`UPDATE devices SET
    name = ?,
    active = ?,
    register_date = ?,
    installation_area = ?,
    domain = ?,
    battery = ?,
    category = ?
    WHERE id = ?`);
  stmt.run(
    name ?? current.name,
    active !== undefined ? (Number(active) ? 1 : 0) : current.active,
    register_date ?? current.register_date,
    installation_area ?? current.installation_area,
    domain ?? current.domain,
    battery !== undefined ? Number(battery) : current.battery,
    category ?? current.category,
    id
  );
  const row = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
  res.json(row);
});

app.delete('/api/devices/:id', (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM devices WHERE id = ?').run(id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// Exports
function devicesToCSV(rows) {
  const headers = ['id','name','active','register_date','installation_area','domain','battery','category'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map(h => {
      const v = r[h] ?? '';
      const s = String(v).replaceAll('"', '""');
      return /[,\n\r]/.test(s) ? `"${s}"` : s;
    }).join(','));
  }
  return lines.join('\n');
}

app.get('/api/devices/export/csv', (req, res) => {
  const rows = db.prepare('SELECT * FROM devices ORDER BY id').all();
  const csv = devicesToCSV(rows);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="devices.csv"');
  res.send(csv);
});

app.get('/api/devices/export/txt', (req, res) => {
  const rows = db.prepare('SELECT * FROM devices ORDER BY id').all();
  const txt = rows.map(r => `${r.id}\t${r.name}\t${r.active}\t${r.register_date}\t${r.installation_area || ''}\t${r.domain || ''}\t${r.battery}\t${r.category || ''}`).join('\n');
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename="devices.txt"');
  res.send(txt);
});

app.get('/api/devices/export/xlsx', (req, res) => {
  // Simple: return CSV with .xlsx filename so Excel opens it
  const rows = db.prepare('SELECT * FROM devices ORDER BY id').all();
  const csv = devicesToCSV(rows);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="devices.xlsx"');
  res.send(csv);
});

// Categories CRUD
app.get('/api/categories', (req, res) => {
  try {
    const rows = db.prepare('SELECT id, name FROM categories ORDER BY name').all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

app.post('/api/categories', (req, res) => {
  const { name } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name required' });
  try {
    const stmt = db.prepare('INSERT INTO categories (name) VALUES (?)');
    const info = stmt.run(String(name).trim());
    const row = db.prepare('SELECT id, name FROM categories WHERE id = ?').get(info.lastInsertRowid);
    res.json(row);
  } catch (e) {
    if (e && e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: 'Category already exists' });
    res.status(500).json({ error: 'Failed to create category' });
  }
});

app.put('/api/categories/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name required' });
  const current = db.prepare('SELECT id, name FROM categories WHERE id = ?').get(id);
  if (!current) return res.status(404).json({ error: 'Not found' });
  try {
    db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(String(name).trim(), id);
    const row = db.prepare('SELECT id, name FROM categories WHERE id = ?').get(id);
    res.json(row);
  } catch (e) {
    if (e && e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: 'Category already exists' });
    res.status(500).json({ error: 'Failed to update category' });
  }
});

app.delete('/api/categories/:id', (req, res) => {
  const id = Number(req.params.id);
  try {
    const info = db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// Paired devices (from Bluetooth modal)
app.post('/api/paired-devices', (req, res) => {
  const { address, name } = req.body || {};
  if (!address) return res.status(400).json({ error: 'Missing address' });
  try {
    const stmt = db.prepare('INSERT OR IGNORE INTO paired_devices (address, name) VALUES (?, ?)');
    stmt.run(address, name || 'Unknown');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save paired device' });
  }
});

// Admin users endpoints
app.get('/api/users', requireAuth, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, phone, role FROM users ORDER BY id').all();
  res.json(users);
});

app.post('/api/users', requireAuth, requireAdmin, (req, res) => {
  const { phone, password, role } = req.body;
  if (!phone || !password || !role) return res.status(400).json({ error: 'Missing fields' });
  try {
    const stmt = db.prepare('INSERT INTO users (phone, passwordHash, role) VALUES (?, ?, ?)');
    const info = stmt.run(phone, bcrypt.hashSync(password, 8), role);
    res.json({ id: info.lastInsertRowid, phone, role });
  } catch (e) {
    if (e && e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: 'Phone already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

const port = 5174;
app.listen(port, () => console.log(`Backend listening on http://localhost:${port}`));
