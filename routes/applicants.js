import { Router } from 'express';
import crypto from 'node:crypto';
import sql from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { sendSms, statusChangeMessage } from '../services/sms.js';

const router = Router();

const OPTIONAL_FIELDS = [
  'gender', 'email', 'postalAddress', 'currentResidence', 'countyOfResidence',
  'dateOfBirth', 'placeOfBirth', 'religion', 'nationality', 'referringAgent',
  'academicQualification', 'institutionName', 'yearOfCompletion', 'grade',
  'guardianFullName', 'guardianRelationship', 'guardianPhone', 'guardianResidence', 'guardianOccupation',
  'nokFullName', 'nokRelationship', 'nokIdNumber', 'nokPhone', 'nokEmail',
  'emergencyName', 'emergencyRelationship', 'emergencyPhone', 'emergencyEmail', 'emergencyResidence',
  'declarationAccepted', 'declarationName', 'declarationIdNumber', 'declarationDate',
];

function toSnakeCase(str) {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function buildApplicantFilters(query) {
  const { dateFrom, dateTo, location, phone, jobType } = query;
  const conditions = [];
  
  if (dateFrom) { conditions.push(sql`a.created_at >= ${dateFrom + ' 00:00:00'}`); }
  if (dateTo) { conditions.push(sql`a.created_at <= ${dateTo + ' 23:59:59'}`); }
  if (location) { conditions.push(sql`a.location ILIKE ${'%' + location + '%'}`); } 
  if (phone) { conditions.push(sql`a.phone_number LIKE ${'%' + phone + '%'}`); }
  if (jobType) { conditions.push(sql`b.role ILIKE ${'%' + jobType + '%'}`); }
  
  // Combine conditions dynamically
  let whereClause = sql``;
  if (conditions.length > 0) {
    whereClause = sql`WHERE ${conditions.reduce((acc, cond) => sql`${acc} AND ${cond}`)}`;
  }
  
  return { whereClause };
}

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

  const declarationIdNumber = req.body.declarationIdNumber;
  if (declarationIdNumber !== undefined) {
    if (!declarationIdNumber || !declarationIdNumber.trim()) {
      errors.declarationIdNumber = 'Declaration ID number is required.';
    } else if (idNumber && declarationIdNumber.trim() !== idNumber.trim()) {
      errors.declarationIdNumber = 'Declaration ID number must match the Bio Data ID number.';
    }
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ success: false, errors });
  }

  const batchRows = await sql`SELECT id, status, age_min, age_max FROM batches WHERE id = ${batchId}`;
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

  const applicantData = {
    full_name: fullName.trim(),
    phone_number: phoneNumber.trim(),
    age: ageNum,
    id_number: idNumber.trim(),
    location: location.trim(),
    batch_id: batchId,
    has_experience: Boolean(hasExperience),
    experience_details: experienceDetails?.trim() || null,
    application_token: applicationToken,
  };

  for (const field of OPTIONAL_FIELDS) {
    if (req.body[field] !== undefined && req.body[field] !== '') {
      applicantData[toSnakeCase(field)] = field === 'declarationAccepted' ? Boolean(req.body[field]) : req.body[field];
    }
  }

  try {
    const result = await sql`
      INSERT INTO applicants ${sql(applicantData)} 
      RETURNING id
    `;

    return res.status(201).json({ success: true, referenceId: result[0].id, applicationToken });
  } catch (err) {
    if (err.code === '23505') {
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

    const { whereClause } = buildApplicantFilters(req.query);

    const rows = await sql`
      SELECT
        a.id, a.full_name, a.phone_number, a.age, a.location,
        a.has_experience, a.status, a.payment_status, a.payment_date, a.created_at,
        b.role AS batch_role, b.application_type,
        c.name AS company_name
      FROM applicants a
      LEFT JOIN batches b ON b.id = a.batch_id
      LEFT JOIN companies c ON c.id = b.company_id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    const countRows = await sql`
      SELECT COUNT(*) AS total FROM applicants a LEFT JOIN batches b ON b.id = a.batch_id ${whereClause}
    `;

    const total = parseInt(countRows[0].total, 10);

    return res.json({ applicants: rows, total, page, pageSize });
  } catch (err) {
    console.error('Fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch applicants.' });
  }
});

router.get('/export', requireAuth, async (req, res) => {
  try {
    const { whereClause } = buildApplicantFilters(req.query);

    const rows = await sql`
      SELECT
        a.id, a.full_name, a.phone_number, a.age, a.location, a.id_number,
        a.has_experience, a.status, a.payment_status, a.payment_date, a.created_at,
        b.role AS batch_role, b.application_type,
        c.name AS company_name
      FROM applicants a
      LEFT JOIN batches b ON b.id = a.batch_id
      LEFT JOIN companies c ON c.id = b.company_id
      ${whereClause}
      ORDER BY a.created_at DESC
    `;

    const headers = [
      'Ref #', 'Full Name', 'Phone', 'Age', 'Location', 'ID Number',
      'Has Experience', 'Status', 'Payment Status', 'Payment Date',
      'Applied Date', 'Company', 'Role', 'Type',
    ];

    const lines = [headers.map(csvEscape).join(',')];
    for (const a of rows) {
      lines.push([
        a.id, a.full_name, a.phone_number, a.age, a.location, a.id_number,
        a.has_experience ? 'Yes' : 'No', a.status, a.payment_status,
        a.payment_date ? new Date(a.payment_date).toLocaleDateString() : '',
        new Date(a.created_at).toLocaleDateString(),
        a.company_name || '', a.batch_role || '', a.application_type || '',
      ].map(csvEscape).join(','));
    }
    const csv = lines.join('\n');

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

  const applicantRows = await sql`SELECT id, full_name, phone_number FROM applicants WHERE id = ${id}`;
  const applicant = applicantRows[0];
  if (!applicant) {
    return res.status(404).json({ error: 'Applicant not found.' });
  }

  await sql`UPDATE applicants SET status = ${status} WHERE id = ${id}`;
  
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
  
  const result = await sql`
    UPDATE applicants SET payment_status = ${paymentStatus}, payment_date = ${paymentDate} 
    WHERE id = ${id} RETURNING id
  `;
  
  if (result.length === 0) {
    return res.status(404).json({ error: 'Applicant not found.' });
  }
  return res.json({ success: true });
});

router.get('/:id/full', requireAuth, async (req, res) => {
  const rows = await sql`SELECT * FROM applicants WHERE id = ${req.params.id}`;
  const applicant = rows[0];
  if (!applicant) {
    return res.status(404).json({ error: 'Applicant not found.' });
  }
  return res.json({ applicant });
});

export default router;