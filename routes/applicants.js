import { Router } from 'express';
import crypto from 'node:crypto';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { sendSms, statusChangeMessage } from '../services/sms.js';

const router = Router();

// Extra admission-form fields (trainee flow only - job applicants simply
// won't send these, and they'll be stored as NULL, which is fine since
// every one of these columns is nullable).
const OPTIONAL_FIELDS = [
  'gender', 'email', 'postalAddress', 'currentResidence', 'countyOfResidence',
  'dateOfBirth', 'placeOfBirth', 'religion', 'nationality', 'referringAgent',
  'academicQualification', 'institutionName', 'yearOfCompletion', 'grade',
  'guardianFullName', 'guardianRelationship', 'guardianPhone', 'guardianResidence', 'guardianOccupation',
  'nokFullName', 'nokRelationship', 'nokIdNumber', 'nokPhone', 'nokEmail',
  'emergencyName', 'emergencyRelationship', 'emergencyPhone', 'emergencyEmail', 'emergencyResidence',
  'declarationAccepted', 'declarationName', 'declarationIdNumber', 'declarationDate',
];

// camelCase (JS convention) -> snake_case (DB column names)
function toSnakeCase(str) {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

// Shared by BOTH the paginated list (GET /) and the CSV export (GET
// /export) - same lesson as elsewhere in this project: one place builds
// the WHERE clause, so the two routes can never silently drift apart and
// show different results for "the same" filters.
function buildApplicantFilters(query) {
  const { dateFrom, dateTo, location, phone, jobType } = query;
  const conditions = [];
  const params = [];
  if (dateFrom) { conditions.push('a.created_at >= ?'); params.push(`${dateFrom} 00:00:00`); }
  if (dateTo) { conditions.push('a.created_at <= ?'); params.push(`${dateTo} 23:59:59`); }
  if (location) { conditions.push('a.location LIKE ?'); params.push(`%${location}%`); }
  if (phone) { conditions.push('a.phone_number LIKE ?'); params.push(`%${phone}%`); }
  if (jobType) { conditions.push('b.role LIKE ?'); params.push(`%${jobType}%`); }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, params };
}

// CSV requires escaping any field that itself contains a comma, quote, or
// newline - otherwise a location like "Nairobi, Kenya" would be
// misinterpreted as TWO columns by Excel. The rule: if a value contains
// any of those characters, wrap it in double quotes, and double up any
// quote characters already inside it.
function csvEscape(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

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

  const applicationToken = crypto.randomBytes(20).toString('hex');

  // Build the optional-fields part of the INSERT dynamically, so this
  // route works for both the short Job form and the long Trainee admission
  // form without needing two separate INSERT statements.
  const optionalColumns = [];
  const optionalPlaceholders = [];
  const optionalValues = [];
  for (const field of OPTIONAL_FIELDS) {
    if (req.body[field] !== undefined && req.body[field] !== '') {
      optionalColumns.push(toSnakeCase(field));
      optionalPlaceholders.push('?');
      optionalValues.push(field === 'declarationAccepted' ? Boolean(req.body[field]) : req.body[field]);
    }
  }

  const baseColumns = ['full_name', 'phone_number', 'age', 'id_number', 'location', 'batch_id', 'has_experience', 'experience_details', 'application_token'];
  const baseValues = [
    fullName.trim(),
    phoneNumber.trim(),
    ageNum,
    idNumber.trim(),
    location.trim(),
    batchId,
    Boolean(hasExperience),
    experienceDetails?.trim() || null,
    applicationToken,
  ];

  const allColumns = [...baseColumns, ...optionalColumns];
  const allPlaceholders = [...baseColumns.map(() => '?'), ...optionalPlaceholders];
  const allValues = [...baseValues, ...optionalValues];

  try {
    const [result] = await pool.query(
      `INSERT INTO applicants (${allColumns.join(', ')}) VALUES (${allPlaceholders.join(', ')})`,
      allValues
    );

    return res.status(201).json({ success: true, referenceId: result.insertId, applicationToken });
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

router.get('/', requireAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = [20, 40, 60, 100].includes(parseInt(req.query.pageSize, 10))
      ? parseInt(req.query.pageSize, 10)
      : 20;
    const offset = (page - 1) * pageSize;

    const { whereClause, params } = buildApplicantFilters(req.query);

    const [rows] = await pool.query(
      `SELECT
        a.id, a.full_name, a.phone_number, a.age, a.location,
        a.has_experience, a.status, a.payment_status, a.payment_date, a.created_at,
        b.role AS batch_role, b.application_type,
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
      `SELECT COUNT(*) AS total FROM applicants a LEFT JOIN batches b ON b.id = a.batch_id ${whereClause}`,
      params
    );

    return res.json({ applicants: rows, total: countRows[0].total, page, pageSize });
  } catch (err) {
    console.error('Fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch applicants.' });
  }
});

// Staff-only. Exports EVERY applicant matching the current filters as a
// downloadable CSV - deliberately no pagination limit here, since the
// whole point is "give me the full list to work with in Excel," not a
// page of it. Uses the exact same filters as the list view, so "export
// what I'm looking at" behaves the way an admin would expect.
router.get('/export', requireAuth, async (req, res) => {
  try {
    const { whereClause, params } = buildApplicantFilters(req.query);

    const [rows] = await pool.query(
      `SELECT
        a.id, a.full_name, a.phone_number, a.age, a.location, a.id_number,
        a.has_experience, a.status, a.payment_status, a.payment_date, a.created_at,
        b.role AS batch_role, b.application_type,
        c.name AS company_name
      FROM applicants a
      LEFT JOIN batches b ON b.id = a.batch_id
      LEFT JOIN companies c ON c.id = b.company_id
      ${whereClause}
      ORDER BY a.created_at DESC`,
      params
    );

    const headers = [
      'Ref #', 'Full Name', 'Phone', 'Age', 'Location', 'ID Number',
      'Has Experience', 'Status', 'Payment Status', 'Payment Date',
      'Applied Date', 'Company', 'Role', 'Type',
    ];

    // Build the CSV text line by line: header row, then one row per
    // applicant, joining fields with commas and rows with newlines - that
    // IS the entire CSV format, nothing more sophisticated than this.
    const lines = [headers.map(csvEscape).join(',')];
    for (const a of rows) {
      lines.push([
        a.id,
        a.full_name,
        a.phone_number,
        a.age,
        a.location,
        a.id_number,
        a.has_experience ? 'Yes' : 'No',
        a.status,
        a.payment_status,
        a.payment_date ? new Date(a.payment_date).toLocaleDateString() : '',
        new Date(a.created_at).toLocaleDateString(),
        a.company_name || '',
        a.batch_role || '',
        a.application_type || '',
      ].map(csvEscape).join(','));
    }
    const csv = lines.join('\n');

    // These two headers are what make the browser treat this as a file
    // download named applicants.csv, rather than trying to display raw
    // text in the tab.
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="applicants.csv"');
    return res.send(csv);
  } catch (err) {
    console.error('Export error:', err);
    return res.status(500).json({ error: 'Failed to export applicants.' });
  }
});

router.patch('/:id/status', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const VALID_STATUSES = ['applied', 'shortlisted', 'contract_signed', 'in_training', 'employed', 'rejected'];
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  const [applicantRows] = await pool.query(`SELECT id, full_name, phone_number FROM applicants WHERE id = ?`, [id]);
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

// Staff-only. Returns EVERY column for one applicant - the full admission
// form (bio data, academic, guardian, next of kin, emergency contact,
// declaration, payer info). Fetched lazily when an admin expands a row in
// the dashboard, not included in the main list query, since the list
// already returns many rows at once and most of these ~35 columns aren't
// needed until someone actually wants to review one specific application.
router.get('/:id/full', requireAuth, async (req, res) => {
  const [rows] = await pool.query(`SELECT * FROM applicants WHERE id = ?`, [req.params.id]);
  const applicant = rows[0];
  if (!applicant) {
    return res.status(404).json({ error: 'Applicant not found.' });
  }
  return res.json({ applicant });
});

export default router;