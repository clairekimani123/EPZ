import { Router } from 'express';
import sql from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const rows = await sql`SELECT * FROM companies ORDER BY name ASC`;
  res.json({ companies: rows });
});

router.post('/', async (req, res) => {
  const { name, contactPerson, contactPhone } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Company name is required.' });
  }
  const result = await sql`
    INSERT INTO companies (name, contact_person, contact_phone) 
    VALUES (${name.trim()}, ${contactPerson?.trim() || null}, ${contactPhone?.trim() || null})
    RETURNING id
  `;
  res.status(201).json({ id: result[0].id });
});

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, contactPerson, contactPhone } = req.body;

  if (name !== undefined && !name.trim()) {
    return res.status(400).json({ error: 'Company name cannot be empty.' });
  }

  const updates = {};
  if (name !== undefined) updates.name = name.trim();
  if (contactPerson !== undefined) updates.contact_person = contactPerson?.trim() || null;
  if (contactPhone !== undefined) updates.contact_phone = contactPhone?.trim() || null;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No fields provided to update.' });
  }

  const result = await sql`
    UPDATE companies SET ${sql(updates)} WHERE id = ${id} RETURNING id
  `;
  
  if (result.length === 0) {
    return res.status(404).json({ error: 'Company not found.' });
  }
  return res.json({ success: true });
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  const batchRows = await sql`SELECT COUNT(*)::int AS count FROM batches WHERE company_id = ${id}`;
  if (batchRows[0].count > 0) {
    return res.status(400).json({
      error: `This company has ${batchRows[0].count} batch(es) and cannot be deleted. Close or remove its batches first.`,
    });
  }

  const result = await sql`DELETE FROM companies WHERE id = ${id} RETURNING id`;
  if (result.length === 0) {
    return res.status(404).json({ error: 'Company not found.' });
  }
  return res.json({ success: true });
});

export default router;