import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { sendPaymentRequestForApplicant } from '../services/paymentRequest.js';

const router = Router();

// Staff-only: admin manually triggers a payment request from the dashboard.
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

// --------------------------------------------------------------------------
// PUBLIC, but gated by a one-time token only the applicant's own browser
// received (see routes/applicants.js - the token is returned exactly once,
// in the response to their own application submission). Without the
// correct token, this rejects the request - a stranger who only knows an
// applicant's numeric ID cannot use this to spam their phone.
// --------------------------------------------------------------------------
router.post('/:id/request-payment-public', async (req, res) => {
  const { token } = req.body;
  const { id } = req.params;

  if (!token) {
    return res.status(400).json({ error: 'Missing application token.' });
  }

  const [rows] = await pool.query(
    `SELECT application_token, payment_status FROM applicants WHERE id = ?`,
    [id]
  );
  const applicant = rows[0];

  if (!applicant || applicant.application_token !== token) {
    // Same deliberately generic error whether the applicant doesn't exist
    // or the token is simply wrong - don't hand out hints either way.
    return res.status(403).json({ error: 'Invalid request.' });
  }

  if (applicant.payment_status === 'completed') {
    return res.status(400).json({ error: 'This application has already been paid for.' });
  }

  try {
    const result = await sendPaymentRequestForApplicant(id);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.json({ success: true, message: 'Payment request sent to your phone.' });
  } catch (err) {
    console.error('STK push error (public):', err);
    return res.status(500).json({ error: err.message || 'Failed to send payment request.' });
  }
});

// --------------------------------------------------------------------------
// PUBLIC on purpose - Safaricom's servers call this directly, they have no
// way to send our login token. This is safe because we're not trusting the
// caller's identity for anything sensitive - we're only ever updating a
// payment_status based on a CheckoutRequestID that WE generated and stored
// ourselves. An attacker guessing this URL could only mark an
// already-known-to-us pending payment as complete/failed - they can't
// invent a new payment or target an arbitrary applicant, since the
// CheckoutRequestID has to match one we actually issued.
// --------------------------------------------------------------------------
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