import { pool } from '../db/pool.js';
import { initiateStkPush, normalizePhoneForMpesa } from './mpesa.js';

// --------------------------------------------------------------------------
// Shared by both payment-trigger routes so there is exactly ONE place that
// actually talks to Safaricom.
//
// Uses payer_phone if one has been recorded (someone other than the
// applicant is paying - parent/guardian/friend), otherwise falls back to
// the applicant's own phone_number. This is why the payment page collects
// payer details FIRST (see routes/payments.js request-payment-public) and
// stores them before calling this function.
// --------------------------------------------------------------------------

export async function sendPaymentRequestForApplicant(applicantId) {
  const [rows] = await pool.query(
    `SELECT a.id, a.full_name, a.phone_number, a.payer_phone, b.fee_amount
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

  const targetRawPhone = applicant.payer_phone || applicant.phone_number;
  const phone = normalizePhoneForMpesa(targetRawPhone);
  if (!phone) {
    return {
      ok: false,
      status: 400,
      error: `Could not read "${targetRawPhone}" as a valid Kenyan phone number.`,
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