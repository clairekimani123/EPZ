import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

// --------------------------------------------------------------------------
// Companies are simple - staff add them once, then create batches under
// them. No public endpoints here at all: applicants never need to see a
// raw list of companies, only the specific open batches (see batches.js).
// --------------------------------------------------------------------------

const router = Router();

router.use(requireAuth); // every route below requires staff login

router.get('/', async (req, res) => {
  const [rows] = await pool.query(`SELECT * FROM companies ORDER BY name ASC`);
  res.json({ companies: rows });
});

router.post('/', async (req, res) => {
  const { name, contactPerson, contactPhone } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Company name is required.' });
  }

  const [result] = await pool.query(
    `INSERT INTO companies (name, contact_person, contact_phone) VALUES (?, ?, ?)`,
    [name.trim(), contactPerson?.trim() || null, contactPhone?.trim() || null]
  );

  res.status(201).json({ id: result.insertId });
});

export default router;