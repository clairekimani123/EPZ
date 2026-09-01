import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { sendPaymentRequestForApplicant } from '../services/paymentRequest.js';

const router = Router();

// Staff-only manual trigger/resend.
router.post('/:id/request-payment', requireAuth, async (req, res) => {
  try {
    const result = await sendPaymentRequestForApplicant(req.params.id);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.json({ success: true, message: "Payment request sent to applicant's phone." });
  } catch (err) {
    console.error('STK push error:', err);
    return res.status(500).json({ error: err.message || 'Failed to send payment request.' });
  }
});

// PUBLIC, gated by the one-time application_token. Also accepts optional
// payer details (someone other than the applicant paying) - these are
// saved BEFORE triggering the STK push, since sendPaymentRequestForApplicant
// reads payer_phone from the database to decide who actually gets charged.
router.post('/:id/request-payment-public', async (req, res) => {
  const { id } = req.params;
  const { token, payerRelationship, payerName, payerPhone } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Missing application token.' });
  }

  const [rows] = await pool.query(
    `SELECT application_token, payment_status FROM applicants WHERE id = ?`,
    [id]
  );
  const applicant = rows[0];

  if (!applicant || applicant.application_token !== token) {
    return res.status(403).json({ error: 'Invalid request.' });
  }
  if (applicant.payment_status === 'completed') {
    return res.status(400).json({ error: 'This application has already been paid for.' });
  }

  const VALID_RELATIONSHIPS = ['self', 'parent', 'guardian', 'friend'];
  if (payerRelationship && !VALID_RELATIONSHIPS.includes(payerRelationship)) {
    return res.status(400).json({ error: 'Invalid payer relationship.' });
  }

  await pool.query(
    `UPDATE applicants SET payer_relationship = ?, payer_name = ?, payer_phone = ? WHERE id = ?`,
    [payerRelationship || 'self', payerName || null, payerPhone || null, id]
  );

  try {
    const result = await sendPaymentRequestForApplicant(id);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.json({ success: true, message: 'Payment request sent.' });
  } catch (err) {
    console.error('STK push error (public):', err);
    return res.status(500).json({ error: err.message || 'Failed to send payment request.' });
  }
});

// PUBLIC, gated by the same one-time application_token, but read-only - the
// applicant's browser polls this repeatedly after requesting payment, since
// there's no other way for it to learn that Safaricom's callback (a
// server-to-server call it can never see) has arrived and updated the
// status. This route only ever reads; it can't be used to change anything.
router.get('/:id/payment-status-public', async (req, res) => {
  const { id } = req.params;
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: 'Missing application token.' });
  }

  const [rows] = await pool.query(
    `SELECT application_token, payment_status FROM applicants WHERE id = ?`,
    [id]
  );
  const applicant = rows[0];

  if (!applicant || applicant.application_token !== token) {
    return res.status(403).json({ error: 'Invalid request.' });
  }

  return res.json({ paymentStatus: applicant.payment_status });
});

router.post('/mpesa/callback', async (req, res) => {
  const callback = req.body?.Body?.stkCallback;
  if (!callback) {
    console.error('Unexpected M-Pesa callback shape:', JSON.stringify(req.body));
    return res.status(200).json({ received: true });
  }

  const { CheckoutRequestID, ResultCode, CallbackMetadata } = callback;

  const [rows] = await pool.query(
    `SELECT id FROM applicants WHERE mpesa_checkout_request_id = ?`,
    [CheckoutRequestID]
  );
  const applicant = rows[0];
  if (!applicant) {
    console.error('M-Pesa callback for unknown CheckoutRequestID:', CheckoutRequestID);
    return res.status(200).json({ received: true });
  }

  if (ResultCode === 0) {
    const items = CallbackMetadata?.Item || [];
    const receipt = items.find((i) => i.Name === 'MpesaReceiptNumber')?.Value || null;
    await pool.query(
      `UPDATE applicants SET payment_status = 'completed', payment_date = NOW(), mpesa_receipt_number = ? WHERE id = ?`,
      [receipt, applicant.id]
    );
  } else {
    await pool.query(`UPDATE applicants SET payment_status = 'failed' WHERE id = ?`, [applicant.id]);
  }

  return res.status(200).json({ received: true });
});

export default router;