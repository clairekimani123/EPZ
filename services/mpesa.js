// --------------------------------------------------------------------------
// M-Pesa / Daraja integration. Two Safaricom endpoints are involved:
//   1. OAuth  - exchange Consumer Key + Secret for a short-lived access
//      token (like logging in to get a session token before doing anything
//      else - every other call needs this token attached).
//   2. STK Push - the actual "send a PIN prompt to this phone" request.
//
// Sandbox vs production differ ONLY in the base URL and which
// shortcode/passkey you use - the request shape is identical. That's why
// MPESA_ENV controls which base URL we hit, rather than duplicating logic.
// --------------------------------------------------------------------------

const BASE_URL =
  process.env.MPESA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

// Cache the access token in memory rather than fetching a new one on every
// single request - Safaricom's tokens are valid for ~1 hour, so
// re-requesting one per STK push would be wasteful and slower.
let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const credentials = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString('base64');

  const res = await fetch(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });

  if (!res.ok) {
    throw new Error('Failed to get M-Pesa access token - check MPESA_CONSUMER_KEY/SECRET in .env');
  }

  const data = await res.json();
  cachedToken = data.access_token;
  // Refresh a minute early to avoid using a token that expires mid-request.
  tokenExpiresAt = Date.now() + (Number(data.expires_in) - 60) * 1000;
  return cachedToken;
}

// M-Pesa requires phone numbers in the format 2547XXXXXXXX (or 2541XXXXXXXX
// for newer Safaricom numbers) - no leading 0, no +. Applicants type their
// number however feels natural to them (07..., +254..., etc), so we
// normalize it here rather than forcing a strict format on the public form.
export function normalizePhoneForMpesa(rawPhone) {
  const digits = rawPhone.replace(/\D/g, ''); // strip spaces, +, dashes, etc.

  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return '254' + digits.slice(1);
  if ((digits.startsWith('7') || digits.startsWith('1')) && digits.length === 9) return '254' + digits;

  return null; // couldn't confidently normalize - caller should reject
}

// Generates the timestamp + password Safaricom requires on every STK push
// request. The "password" isn't a secret you chose - it's a hash Safaricom
// computes from your shortcode + passkey + the current timestamp, which is
// why it has to be regenerated fresh for every single request.
function buildPasswordAndTimestamp() {
  const timestamp = new Date()
    .toISOString()
    .replace(/[^0-9]/g, '')
    .slice(0, 14); // YYYYMMDDHHmmss

  const password = Buffer.from(
    `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
  ).toString('base64');

  return { timestamp, password };
}

// Kicks off the actual STK push - this is what makes the PIN prompt appear
// on the trainee's phone. Returns Safaricom's CheckoutRequestID, which we
// must save so the callback (arriving later, asynchronously) can be matched
// back to the right applicant.
export async function initiateStkPush({ phone, amount, accountReference, description }) {
  const accessToken = await getAccessToken();
  const { timestamp, password } = buildPasswordAndTimestamp();

  const res = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(amount), // M-Pesa doesn't accept decimals
      PartyA: phone,
      PartyB: process.env.MPESA_SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: process.env.MPESA_CALLBACK_URL,
      AccountReference: accountReference.slice(0, 12), // Safaricom limits this field's length
      TransactionDesc: description.slice(0, 13),
    }),
  });

  const data = await res.json();

  if (!res.ok || data.ResponseCode !== '0') {
    throw new Error(data.errorMessage || data.ResponseDescription || 'STK push failed');
  }

  return { checkoutRequestId: data.CheckoutRequestID };
}