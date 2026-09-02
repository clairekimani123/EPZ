import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// PUBLIC - used by the application forms. Only shows batches still open,
// with spots remaining, filtered by type (trainee vs job).
router.get('/open', async (req, res) => {
  const { type } = req.query;
  const conditions = ["batches.status = 'open'"];
  const params = [];
  if (type) {
    conditions.push('batches.application_type = ?');
    params.push(type);
  }

  const [rows] = await pool.query(
    `SELECT
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
    WHERE ${conditions.join(' AND ')}
    GROUP BY batches.id
    HAVING spots_remaining > 0
    ORDER BY batches.created_at DESC`,
    params
  );
  res.json({ batches: rows });
});

router.get('/', requireAuth, async (req, res) => {
  const [rows] = await pool.query(`
    SELECT
      batches.*,
      companies.name AS company_name,
      COUNT(applicants.id) AS filled_count
    FROM batches
    JOIN companies ON companies.id = batches.company_id
    LEFT JOIN applicants
      ON applicants.batch_id = batches.id AND applicants.status != 'rejected'
    GROUP BY batches.id
    ORDER BY batches.created_at DESC
  `);
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

  const [result] = await pool.query(
    `INSERT INTO batches (company_id, role, quantity_needed, age_min, age_max, application_type, fee_amount)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [companyId, role.trim(), quantityNeeded, ageMin || 18, ageMax || 30, applicationType, feeAmount || 0]
  );
  res.status(201).json({ id: result.insertId });
});

// Staff-only. Edits an existing batch - covers both correcting details
// (wrong fee, wrong age range) and closing it (status: 'closed' or
// 'filled') so it stops appearing on the public application form. Only
// updates fields actually provided, so a request that just wants to
// change status doesn't need to also resend role/company/etc.
router.patch('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { companyId, role, quantityNeeded, ageMin, ageMax, applicationType, feeAmount, status } = req.body;

  if (applicationType && !['trainee', 'job'].includes(applicationType)) {
    return res.status(400).json({ error: 'applicationType must be "trainee" or "job".' });
  }
  if (status && !['open', 'filled', 'closed'].includes(status)) {
    return res.status(400).json({ error: 'status must be "open", "filled", or "closed".' });
  }

  const updates = [];
  const values = [];
  const maybeAdd = (column, value) => {
    if (value !== undefined) {
      updates.push(`${column} = ?`);
      values.push(value);
    }
  };
  maybeAdd('company_id', companyId);
  maybeAdd('role', role?.trim());
  maybeAdd('quantity_needed', quantityNeeded);
  maybeAdd('age_min', ageMin);
  maybeAdd('age_max', ageMax);
  maybeAdd('application_type', applicationType);
  maybeAdd('fee_amount', feeAmount);
  maybeAdd('status', status);

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields provided to update.' });
  }

  const [result] = await pool.query(
    `UPDATE batches SET ${updates.join(', ')} WHERE id = ?`,
    [...values, id]
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'Batch not found.' });
  }
  return res.json({ success: true });
});

// Staff-only. Deletes a batch OUTRIGHT - only allowed if no applicants
// have ever applied to it. This is a deliberate guard, not laziness: once
// real people's applications are linked to a batch (batch_id foreign key),
// deleting it would either fail (if the FK has no ON DELETE rule) or
// silently orphan/cascade-delete their records - neither is something you
// want to happen by accident from an admin button click. Use "closed"
// status instead for a batch that has real applicants but shouldn't
// accept new ones.
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  const [applicantRows] = await pool.query(
    `SELECT COUNT(*) AS count FROM applicants WHERE batch_id = ?`,
    [id]
  );
  if (applicantRows[0].count > 0) {
    return res.status(400).json({
      error: `This batch has ${applicantRows[0].count} applicant(s) linked to it and cannot be deleted. Set its status to "closed" instead.`,
    });
  }

  const [result] = await pool.query(`DELETE FROM batches WHERE id = ?`, [id]);
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'Batch not found.' });
  }
  return res.json({ success: true });
});

export default router;