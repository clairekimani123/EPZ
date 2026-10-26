import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import sql from '../db.js'; // 👈 Import your database connection

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    // 1. Look for the user in the Supabase database
    const rows = await sql`SELECT * FROM staff_users WHERE email = ${email}`;
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // 2. Compare the typed password with the hash in the database
    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // 3. Generate the token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role }, 
      process.env.JWT_SECRET, 
      { expiresIn: '8h' }
    );
    
    return res.json({ token });
    
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;