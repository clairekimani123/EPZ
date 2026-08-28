import { pool } from '../db/pool.js';
import { initiateStkPush, normalizePhoneForMpesa } from './mpesa.js';

// --------------------------------------------------------------------------
// Shared by BOTH payment-trigger routes (staff-initiated in routes/payments.js,
// and applicant-initiated in routes/applicants.js) so there is exactly ONE
// place that actually talks to Safaricom. Two separate copies of this logic
// would inevitably drift apart over time as one gets updated and the other
// forgotten - a bug we've already run into more than once in this project
// with duplicated header markup and duplicated doc-type lists.
// --------------------------------------------------------------------------

export async function sendPaymentRequestForApplicant(applicantId) {
  const [rows] = await pool.query(
    `SELECT a.id, a.full_name, a.phone_number, b.fee_amount
     FROM applicants a
     LEFT JOIN batches b ON b.id = a.batch_id
     WHERE a.id = ?`,
    [applicantId]
  );
  const applicant = rows[0];

  if (!applicant) {
    return { ok: false, status: 404, error: 'Applicant not found.' };
  }
  if (!applicant.fee_amount || Number(applicant.fee_amount) <= 0) {
    return { ok: false, status: 400, error: "This applicant's batch has no fee set - nothing to charge." };
  }

  const phone = normalizePhoneForMpesa(applicant.phone_number);
  if (!phone) {
    return {
      ok: false,
      status: 400,
      error: `Could not read "${applicant.phone_number}" as a valid Kenyan phone number.`,
    };
  }

  const { checkoutRequestId } = await initiateStkPush({
    phone,
    amount: applicant.fee_amount,
    accountReference: `REF${applicant.id}`,
    description: 'Training fee',
  });

  await pool.query(`UPDATE applicants SET mpesa_checkout_request_id = ? WHERE id = ?`, [
    checkoutRequestId,
    applicantId,
  ]);

  return { ok: true };
}