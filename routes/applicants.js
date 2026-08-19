import { Router } from 'express';
import { pool } from '../db/pool.js';

// --------------------------------------------------------------------------
// Same two endpoints as before. The SQL and error handling are adjusted for
// MySQL's driver, which has a slightly different shape than Postgres's:
//   - mysql2 returns [rows, fields] or [result, fields] from pool.query()
//   - new IDs come back as result.insertId (no "RETURNING" clause in MySQL)
//   - duplicate-key errors use err.code === 'ER_DUP_ENTRY' instead of '23505'
// --------------------------------------------------------------------------

const router = Router();

router.post('/', async (req, res) => {
  const { fullName, phoneNumber, age, idNumber, hasExperience, experienceDetails } = req.body;

  const errors = {};
  if (!fullName || !fullName.trim()) errors.fullName = 'Full name is required.';
  if (!phoneNumber || phoneNumber.trim().length < 9) errors.phoneNumber = 'Enter a valid phone number.';
  const ageNum = Number(age);
  if (!ageNum || ageNum < 18 || ageNum > 30) errors.age = 'Applicants must be between 18 and 30 years old.';
  if (!idNumber || !idNumber.trim()) errors.idNumber = 'ID number is required.';

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ success: false, errors });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO applicants (full_name, phone_number, age, id_number, has_experience, experience_details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        fullName.trim(),
        phoneNumber.trim(),
        ageNum,
        idNumber.trim(),
        Boolean(hasExperience),
        experienceDetails?.trim() || null,
      ]
    );

    // MySQL gives back the new row's auto-increment id as insertId,
    // instead of Postgres's "RETURNING id" clause.
    return res.status(201).json({ success: true, referenceId: result.insertId });
  } catch (err) {
    // MySQL's duplicate-key error code (equivalent to Postgres's 23505).
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        errors: { idNumber: 'An application with this ID number already exists.' },
      });
    }

    console.error('Insert error:', err);
    return res.status(500).json({
      success: false,
      errors: { general: 'Something went wrong saving your application. Please try again.' },
    });
  }
});

router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, full_name, phone_number, age, has_experience, status, created_at
       FROM applicants
       ORDER BY created_at DESC`
    );
    return res.json({ applicants: rows });
  } catch (err) {
    console.error('Fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch applicants.' });
  }
});

export default router;
