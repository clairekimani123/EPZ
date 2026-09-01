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

export default router;