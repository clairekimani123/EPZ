import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

// --------------------------------------------------------------------------
// Two very different audiences hit this file:
//   - Staff (requireAuth): full batch list with fill progress, create batches
//   - The public (no auth): a stripped-down "open batches" list so the
//     application form can offer a dropdown of what to apply for
// That's why requireAuth is applied per-route below instead of with
// router.use() like in companies.js - one route in this file must stay public.
// --------------------------------------------------------------------------

const router = Router();

// GET /api/batches/open  -> PUBLIC. Used by the application form dropdown.
// Only shows batches that are still accepting people, and only the fields
// an applicant actually needs to see (not internal ids, contact info, etc).
router.get('/open', async (req, res) => {
  const [rows] = await pool.query(`
    SELECT
      batches.id,
      batches.role,
      batches.age_min,
      batches.age_max,
      companies.name AS company_name,
      batches.quantity_needed - COUNT(applicants.id) AS spots_remaining
    FROM batches
    JOIN companies ON companies.id = batches.company_id
    LEFT JOIN applicants
      ON applicants.batch_id = batches.id AND applicants.status != 'rejected'
    WHERE batches.status = 'open'
    GROUP BY batches.id
    HAVING spots_remaining > 0
    ORDER BY batches.created_at DESC
  `);
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
  const { companyId, role, quantityNeeded, ageMin, ageMax } = req.body;

  if (!companyId || !role || !quantityNeeded) {
    return res.status(400).json({ error: 'companyId, role, and quantityNeeded are required.' });
  }

  const [result] = await pool.query(
    `INSERT INTO batches (company_id, role, quantity_needed, age_min, age_max)
     VALUES (?, ?, ?, ?, ?)`,
    [companyId, role.trim(), quantityNeeded, ageMin || 18, ageMax || 30]
  );

  res.status(201).json({ id: result.insertId });
});

export default router;
