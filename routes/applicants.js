import { Router } from 'express';
import crypto from 'node:crypto';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { sendSms, statusChangeMessage } from '../services/sms.js';
import { sendPaymentRequestForApplicant } from '../services/paymentRequest.js';

const router = Router();

router.post('/', async (req, res) => {
  const { fullName, phoneNumber, age, idNumber, location, hasExperience, experienceDetails, batchId } = req.body;

  const errors = {};
  if (!fullName || !fullName.trim()) errors.fullName = 'Full name is required.';
  if (!phoneNumber || phoneNumber.trim().length < 9) errors.phoneNumber = 'Enter a valid phone number.';
  const ageNum = Number(age);
  if (!ageNum || ageNum < 18 || ageNum > 30) errors.age = 'Applicants must be between 18 and 30 years old.';
  if (!idNumber || !idNumber.trim()) errors.idNumber = 'ID number is required.';
  if (!location || !location.trim()) errors.location = 'Location is required.';
  if (!batchId) errors.batchId = 'Please select which position you are applying for.';

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ success: false, errors });
  }

  const [batchRows] = await pool.query(
    `SELECT id, status, age_min, age_max FROM batches WHERE id = ?`,
    [batchId]
  );
  const batch = batchRows[0];

  if (!batch) {
    return res.status(400).json({ success: false, errors: { batchId: 'That position no longer exists.' } });
  }
  if (batch.status !== 'open') {
    return res.status(400).json({ success: false, errors: { batchId: 'This position is no longer accepting applications.' } });
  }
  if (ageNum < batch.age_min || ageNum > batch.age_max) {
    return res.status(400).json({
      success: false,
      errors: { age: `This position requires ages ${batch.age_min}-${batch.age_max}.` },
    });
  }

  // Random one-time secret, handed back to this specific browser only.
  // This is what the public payment-trigger endpoint requires later - a
  // stranger who only knows the applicant's numeric ID can't use it.
  const applicationToken = crypto.randomBytes(20).toString('hex');

  try {
    const [result] = await pool.query(
      `INSERT INTO applicants (full_name, phone_number, age, id_number, location, batch_id, has_experience, experience_details, application_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fullName.trim(),
        phoneNumber.trim(),
        ageNum,
        idNumber.trim(),
        location.trim(),
        batchId,
        Boolean(hasExperience),
        experienceDetails?.trim() || null,
        applicationToken,
      ]
    );

    return res.status(201).json({
      success: true,
      referenceId: result.insertId,
      applicationToken,
    });
  } catch (err) {
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

// --------------------------------------------------------------------------
// Staff-only. Supports search/filter + pagination via query params:
//   ?dateFrom=2026-01-01&dateTo=2026-12-31
//   ?location=nairobi        (partial match)
//   ?phone=0712              (partial match)
//   ?jobType=Flatlock         (partial match against the batch's role)
//   ?page=1&pageSize=20       (defaults: page=1, pageSize=20)
//
// We build the WHERE clause piece by piece, only adding conditions for
// filters that were actually provided - this is the standard pattern for
// "optional filters," and it's why every condition is paired with pushing
// its value onto `params` in the same order it appears in the SQL string.
// Getting that order wrong is the single most common bug with this pattern,
// so read the two arrays (conditions, params) top to bottom together.
// --------------------------------------------------------------------------
router.get('/', requireAuth, async (req, res) => {
  try {
    const { dateFrom, dateTo, location, phone, jobType } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = [20, 40, 60, 100].includes(parseInt(req.query.pageSize, 10))
      ? parseInt(req.query.pageSize, 10)
      : 20;
    const offset = (page - 1) * pageSize;

    const conditions = [];
    const params = [];

    if (dateFrom) {
      conditions.push('a.created_at >= ?');
      params.push(`${dateFrom} 00:00:00`);
    }
    if (dateTo) {
      conditions.push('a.created_at <= ?');
      params.push(`${dateTo} 23:59:59`);
    }
    if (location) {
      conditions.push('a.location LIKE ?');
      params.push(`%${location}%`);
    }
    if (phone) {
      conditions.push('a.phone_number LIKE ?');
      params.push(`%${phone}%`);
    }
    if (jobType) {
      conditions.push('b.role LIKE ?');
      params.push(`%${jobType}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Two queries: one for the actual page of rows, one just to count the
    // total matching rows (needed so the frontend knows how many pages
    // exist). Both must use the exact same WHERE clause and params, or the
    // count won't match what's actually being paginated.
    const [rows] = await pool.query(
      `SELECT
        a.id, a.full_name, a.phone_number, a.age, a.location,
        a.has_experience, a.status, a.payment_status, a.payment_date, a.created_at,
        b.role AS batch_role,
        c.name AS company_name
      FROM applicants a
      LEFT JOIN batches b ON b.id = a.batch_id
      LEFT JOIN companies c ON c.id = b.company_id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM applicants a
       LEFT JOIN batches b ON b.id = a.batch_id
       ${whereClause}`,
      params
    );

    return res.json({
      applicants: rows,
      total: countRows[0].total,
      page,
      pageSize,
    });
  } catch (err) {
    console.error('Fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch applicants.' });
  }
});

router.patch('/:id/status', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const VALID_STATUSES = ['applied', 'shortlisted', 'contract_signed', 'in_training', 'employed', 'rejected'];
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  const [applicantRows] = await pool.query(
    `SELECT id, full_name, phone_number FROM applicants WHERE id = ?`,
    [id]
  );
  const applicant = applicantRows[0];
  if (!applicant) {
    return res.status(404).json({ error: 'Applicant not found.' });
  }

  await pool.query(`UPDATE applicants SET status = ? WHERE id = ?`, [status, id]);

  sendSms(applicant.phone_number, statusChangeMessage(applicant.full_name, status)).catch((err) =>
    console.error('SMS send failed:', err)
  );

  return res.json({ success: true });
});

// Staff-only. Manual payment status control for now (no real payment
// gateway wired up yet - see the payment feature discussion). Marking a
// payment 'completed' stamps payment_date with the current time; moving
// away from 'completed' clears it, since a pending/failed payment
// shouldn't keep a stale completion date.
router.patch('/:id/payment-status', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { paymentStatus } = req.body;

  const VALID_PAYMENT_STATUSES = ['pending', 'completed', 'failed'];
  if (!VALID_PAYMENT_STATUSES.includes(paymentStatus)) {
    return res.status(400).json({ error: `paymentStatus must be one of: ${VALID_PAYMENT_STATUSES.join(', ')}` });
  }

  const paymentDate = paymentStatus === 'completed' ? new Date() : null;

  const [result] = await pool.query(
    `UPDATE applicants SET payment_status = ?, payment_date = ? WHERE id = ?`,
    [paymentStatus, paymentDate, id]
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'Applicant not found.' });
  }

  return res.json({ success: true });
});

export default router;