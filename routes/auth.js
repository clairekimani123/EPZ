import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// --------------------------------------------------------------------------
// Back to a single shared admin credential, defined via .env. Whoever knows
// the email + password gets into the dashboard - no per-person accounts,
// no registration endpoint. Simpler, and the right call for a small team
// where you don't need to know WHO made a change, just that a logged-in
// staff member did.
// --------------------------------------------------------------------------

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  if (email !== process.env.ADMIN_EMAIL) {
    // Deliberately vague - don't reveal whether the email or password was
    // the wrong part.
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const passwordMatches = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
  if (!passwordMatches) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const token = jwt.sign(
    { email, role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  return res.json({ token });
});

export default router;