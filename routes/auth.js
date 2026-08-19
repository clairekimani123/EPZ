import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// --------------------------------------------------------------------------
// A single hard-coded admin account, defined via .env, not a database table.
// This is intentionally minimal for now — fine for "one staff team sharing
// one login." If you later need individual staff accounts with different
// permissions, that's when you'd add a real `staff_users` table. Don't
// build that until you actually need it.
// --------------------------------------------------------------------------

const router = Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  if (username !== process.env.ADMIN_USERNAME) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const passwordMatches = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);

  if (!passwordMatches) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const token = jwt.sign(
    { username, role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '8h' } // staff has to log in again after 8 hours
  );

  return res.json({ token });
});

export default router;