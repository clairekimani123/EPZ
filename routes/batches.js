import { Router } from 'express';
import sql from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/open', async (req, res) => {
  const { type } = req.query;
  const typeCondition = type ? sql`AND batches.application_type = ${type}` : sql``;

  const rows = await sql`
    SELECT
      batches.id,
      batches.role,
      batches.age_min,
      batches.age_max,
      batches.application_type,
      batches.fee_amount,
      companies.name AS company_name,
      batches.quantity_needed - COUNT(applicants.id) AS spots_remaining
    FROM batches
    JOIN companies ON companies.id = batches.company_id
    LEFT JOIN applicants
      ON applicants.batch_id = batches.id AND applicants.status != 'rejected'
    WHERE batches.status = 'open' ${typeCondition}
    GROUP BY batches.id, companies.name
    HAVING batches.quantity_needed - COUNT(applicants.id) > 0
    ORDER BY batches.created_at DESC
  `;
  res.json({ batches: rows });
});

router.get('/', requireAuth, async (req, res) => {
  const rows = await sql`
    SELECT
      batches.*,
      companies.name AS company_name,
      COUNT(applicants.id)::int AS filled_count
    FROM batches
    JOIN companies ON companies.id = batches.company_id
    LEFT JOIN applicants
      ON applicants.batch_id = batches.id AND applicants.status != 'rejected'
    GROUP BY batches.id, companies.name
    ORDER BY batches.created_at DESC
  `;
  res.json({ batches: rows });
});

router.post('/', requireAuth, async (req, res) => {
  const { companyId, role, quantityNeeded, ageMin, ageMax, applicationType, feeAmount } = req.body;

  if (!companyId || !role || !quantityNeeded) {
    return res.status(400).json({ error: 'companyId, role, and quantityNeeded are required.' });
  }
  if (!['trainee', 'job'].includes(applicationType)) {
    return res.status(400).json({ error: 'applicationType must be "trainee" or "job".' });
  }

  const result = await sql`
    INSERT INTO batches (company_id, role, quantity_needed, age_min, age_max, application_type, fee_amount)
    VALUES (${companyId}, ${role.trim()}, ${quantityNeeded}, ${ageMin || 18}, ${ageMax || 30}, ${applicationType}, ${feeAmount || 0})
    RETURNING id
  `;
  res.status(201).json({ id: result[0].id });
});

router.patch('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { companyId, role, quantityNeeded, ageMin, ageMax, applicationType, feeAmount, status } = req.body;

  if (applicationType && !['trainee', 'job'].includes(applicationType)) {
    return res.status(400).json({ error: 'applicationType must be "trainee" or "job".' });
  }
  if (status && !['open', 'filled', 'closed'].includes(status)) {
    return res.status(400).json({ error: 'status must be "open", "filled", or "closed".' });
  }

  const updates = {};
  if (companyId !== undefined) updates.company_id = companyId;
  if (role !== undefined) updates.role = role.trim();
  if (quantityNeeded !== undefined) updates.quantity_needed = quantityNeeded;
  if (ageMin !== undefined) updates.age_min = ageMin;
  if (ageMax !== undefined) updates.age_max = ageMax;
  if (applicationType !== undefined) updates.application_type = applicationType;
  if (feeAmount !== undefined) updates.fee_amount = feeAmount;
  if (status !== undefined) updates.status = status;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No fields provided to update.' });
  }

  const result = await sql`
    UPDATE batches SET ${sql(updates)} WHERE id = ${id} RETURNING id
  `;

  if (result.length === 0) {
    return res.status(404).json({ error: 'Batch not found.' });
  }
  return res.json({ success: true });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  const applicantRows = await sql`SELECT COUNT(*)::int AS count FROM applicants WHERE batch_id = ${id}`;
  if (applicantRows[0].count > 0) {
    return res.status(400).json({
      error: `This batch has ${applicantRows[0].count} applicant(s) linked to it and cannot be deleted. Set its status to "closed" instead.`,
    });
  }

  const result = await sql`DELETE FROM batches WHERE id = ${id} RETURNING id`;
  if (result.length === 0) {
    return res.status(404).json({ error: 'Batch not found.' });
  }
  return res.json({ success: true });
});

router.get('/:id/applicants', requireAuth, async (req, res) => {
  try {
    const batchId = parseInt(req.params.id, 10);
    if (isNaN(batchId)) {
      return res.status(400).json({ error: 'Invalid batch ID.' });
    }

    const rows = await sql`
      SELECT id, full_name, phone_number, email, payment_status, created_at, status 
      FROM applicants 
      WHERE batch_id = ${batchId} AND status != 'rejected'
      ORDER BY created_at DESC
    `;
    res.json({ applicants: rows });
  } catch (err) {
    console.error('Fetch batch applicants error:', err);
    res.status(500).json({ error: 'Failed to fetch batch applicants.' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const rows = await sql`
      SELECT b.*, c.name AS company_name 
      FROM batches b 
      LEFT JOIN companies c ON c.id = b.company_id 
      WHERE b.id = ${req.params.id}
    `;
    if (!rows[0]) return res.status(404).json({ error: 'Batch not found.' });
    
    res.json({ batch: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch batch.' });
  }
});

export default router;