import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/batches/open?type=trainee   or   ?type=job
// PUBLIC. The application form calls this twice: once when the person picks
// "Trainee" and once when they pick "Job," each time with a different type,
// so the second dropdown only shows companies relevant to that choice.
router.get('/open', async (req, res) => {
  const { type } = req.query;

  if (type && !['trainee', 'job'].includes(type)) {
    return res.status(400).json({ error: 'type must be "trainee" or "job".' });
  }

  const params = [];
  let typeFilter = '';
  if (type) {
    typeFilter = 'AND batches.application_type = ?';
    params.push(type);
  }

  const [rows] = await pool.query(
    `
    SELECT
      batches.id,
      batches.role,
      batches.age_min,
      batches.age_max,
      batches.application_type,
      companies.name AS company_name,
      batches.quantity_needed - COUNT(applicants.id) AS spots_remaining
    FROM batches
    JOIN companies ON companies.id = batches.company_id
    LEFT JOIN applicants
      ON applicants.batch_id = batches.id AND applicants.status != 'rejected'
    WHERE batches.status = 'open' ${typeFilter}
    GROUP BY batches.id
    HAVING spots_remaining > 0
    ORDER BY companies.name ASC
    `,
    params
  );
  res.json({ batches: rows });
});

// Everything below requires staff login.
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
  const { companyId, role, quantityNeeded, ageMin, ageMax, applicationType } = req.body;

  if (!companyId || !role || !quantityNeeded) {
    return res.status(400).json({ error: 'companyId, role, and quantityNeeded are required.' });
  }
  if (!['trainee', 'job'].includes(applicationType)) {
    return res.status(400).json({ error: 'applicationType must be "trainee" or "job".' });
  }

  const [result] = await pool.query(
    `INSERT INTO batches (company_id, role, quantity_needed, age_min, age_max, application_type)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [companyId, role.trim(), quantityNeeded, ageMin || 18, ageMax || 30, applicationType]
  );

  res.status(201).json({ id: result.insertId });
});

export default router;