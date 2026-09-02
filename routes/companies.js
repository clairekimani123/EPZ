import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

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

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, contactPerson, contactPhone } = req.body;

  if (name !== undefined && !name.trim()) {
    return res.status(400).json({ error: 'Company name cannot be empty.' });
  }

  const updates = [];
  const values = [];
  if (name !== undefined) { updates.push('name = ?'); values.push(name.trim()); }
  if (contactPerson !== undefined) { updates.push('contact_person = ?'); values.push(contactPerson?.trim() || null); }
  if (contactPhone !== undefined) { updates.push('contact_phone = ?'); values.push(contactPhone?.trim() || null); }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields provided to update.' });
  }

  const [result] = await pool.query(`UPDATE companies SET ${updates.join(', ')} WHERE id = ?`, [...values, id]);
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'Company not found.' });
  }
  return res.json({ success: true });
});

// Only allowed if the company has no batches at all - same reasoning as
// batches.js not allowing deletion once applicants are linked: deleting a
// company that has active hiring requests attached would either fail on
// the foreign key or silently take those batches (and their applicants)
// down with it. Close the batches first if you really need to retire a
// company entirely.
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  const [batchRows] = await pool.query(`SELECT COUNT(*) AS count FROM batches WHERE company_id = ?`, [id]);
  if (batchRows[0].count > 0) {
    return res.status(400).json({
      error: `This company has ${batchRows[0].count} batch(es) and cannot be deleted. Close or remove its batches first.`,
    });
  }

  const [result] = await pool.query(`DELETE FROM companies WHERE id = ?`, [id]);
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'Company not found.' });
  }
  return res.json({ success: true });
});

export default router;