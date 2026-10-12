import { Router } from 'express';
import jwt from 'jsonwebtoken';

const router  = Router();
const SECRET  = process.env['JWT_SECRET']      ?? 'change-me-in-production';
const PASSWORD = process.env['PANEL_PASSWORD'] ?? 'admin';

router.post('/login', (req, res) => {
  const { password } = req.body as { password?: string };
  if (!password || password !== PASSWORD) {
    res.status(401).json({ ok: false, error: 'Invalid credentials' });
    return;
  }
  const token = jwt.sign({ role: 'operator' }, SECRET, { expiresIn: '24h' });
  res.json({ ok: true, token });
});

export function verifyToken(token: string): boolean {
  try {
    jwt.verify(token, SECRET);
    return true;
  } catch {
    return false;
  }
}

export default router;
