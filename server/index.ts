import express from 'express';
// import type { Application } from 'express-serve-static-core';
import cors from 'cors';
import bodyParser from 'body-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// In-memory data for demo; replace with DB
type Role = 'user' | 'admin';
interface User { id: number; phone: string; passwordHash: string; role: Role }
const users: User[] = [
    { id: 1, phone: '9999999999', passwordHash: bcrypt.hashSync('admin123', 8), role: 'admin' },
    { id: 2, phone: '8888888888', passwordHash: bcrypt.hashSync('user123', 8), role: 'user' },
];
const app = express();
app.use(cors());
app.use(cors());
app.use(bodyParser.json());

const JWT_SECRET =
  process.env.JWT_SECRET ||
  require('crypto').randomBytes(32).toString('hex');


// temp token store
const tempTokens = new Map<string, { phone: string; otp: string; expires: number }>();

app.post('/api/auth/login', (req, res) => {
    const { phone, password } = req.body as { phone: string; password: string };
    const user = users.find(u => u.phone === phone);
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const tempToken = jwt.sign({ phone }, JWT_SECRET, { expiresIn: '5m' });
    tempTokens.set(tempToken, { phone, otp, expires: Date.now() + 5 * 60 * 1000 });
    return res.json({ tempToken, devOtp: otp });
});

app.post('/api/auth/verify-otp', (req, res) => {
    const { otp, tempToken } = req.body as { otp: string; tempToken: string };
    const rec = tempTokens.get(tempToken);
    if (!rec || rec.expires < Date.now()) return res.status(401).json({ error: 'Temp token expired' });
    if (rec.otp !== otp) return res.status(401).json({ error: 'Invalid OTP' });
    const user = users.find(u => u.phone === rec.phone);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const token = jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
    return res.json({ token, role: user.role });
});

app.get('/api/auth/me', (req, res) => {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { role: Role };
        return res.json({ role: decoded.role });
    } catch {
        return res.status(401).json({ error: 'Invalid token' });
    }
});

const port = 5174;
app.listen(port, () => console.log(`Auth server listening on http://127.0.0.1:${port}`));
