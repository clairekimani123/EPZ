// --------------------------------------------------------------------------
// Equity Bank Jenga API integration - replaces services/mpesa.js as the
// thing paymentRequest.js talks to. mpesa.js is left in place, unused, in
// case you ever need to compare or roll back.
//
// ⚠️ IMPORTANT - READ BEFORE TESTING:
// Jenga's API requires an RSA private/public key pair (NOT just a shared
// passkey string like Safaricom Daraja used). You generate this yourself:
//   openssl genpkey -algorithm RSA -out jenga_private.pem -pkeyopt rsa_keygen_bits:2048
//   openssl rsa -pubout -in jenga_private.pem -out jenga_public.pem
// Keep jenga_private.pem secret, on your server only (add to .gitignore).
// Upload the CONTENTS of jenga_public.pem to Jenga's developer dashboard
// under your app's "Keys" section - they use it to verify your signatures.
//
// TWO THINGS BELOW ARE MARKED "CONFIRM THIS" - I researched Jenga's real
// docs, but their public documentation doesn't fully specify these for the
// M-Pesa STK endpoint specifically. Verify both against your actual
// sandbox dashboard/API Explorer before relying on this in a real test:
//   1. The exact field order for the signature string (see buildSignature)
//   2. The exact request URL path for STK Push Init (see initiateStkPush)
// --------------------------------------------------------------------------

import crypto from 'node:crypto';

const BASE_URL =
  process.env.JENGA_ENV === 'production'
    ? 'https://api.finserve.africa'
    : 'https://uat.finserve.africa';

const IDENTITY_URL =
  process.env.JENGA_ENV === 'production'
    ? 'https://identity.finserve.africa/v2/token'
    : 'https://sandbox.jengahq.io/identity-test/v2/token';

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const res = await fetch(IDENTITY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // CONFIRM THIS: some Jenga integrations also require an Api-Key
      // header on the token request itself, in addition to username/
      // password in the body. Check your dashboard's Authentication API
      // page - if token requests fail with a credentials error, this is
      // the first thing to check.
      'Api-Key': process.env.JENGA_API_KEY,
    },
    body: new URLSearchParams({
      username: process.env.JENGA_MERCHANT_CODE,
      password: process.env.JENGA_CONSUMER_SECRET,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to get Jenga access token: ${res.status} ${text}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (Number(data.expires_in || 3600) - 60) * 1000;
  return cachedToken;
}

// Signs a request per Jenga's documented pattern: concatenate specific
// field values in an EXACT order (no separators), sign with your RSA
// private key using SHA256, then base64-encode the signature. The field
// order is specific to each endpoint - see the warning at the top of this
// file about confirming the M-Pesa STK order specifically.
function signFields(fieldsInOrder) {
  const privateKey = process.env.JENGA_PRIVATE_KEY.replace(/\\n/g, '\n');
  const concatenated = fieldsInOrder.join('');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(concatenated);
  signer.end();
  return signer.sign(privateKey, 'base64');
}

export function normalizePhoneForJenga(rawPhone) {
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return '254' + digits.slice(1);
  if ((digits.startsWith('7') || digits.startsWith('1')) && digits.length === 9) return '254' + digits;
  return null;
}

// Same function signature as the old mpesa.js initiateStkPush, so
// paymentRequest.js needs only its import line changed, nothing else.
export async function initiateStkPush({ phone, amount, accountReference, description }) {
  const accessToken = await getAccessToken();

  // CONFIRM THIS: field order adapted from Jenga's documented Equitel
  // STK/USSD pattern (merchant.accountNumber+payment.ref+payment.mobileNumber
  // +payment.telco+payment.amount+payment.currency), since the exact order
  // for the M-Pesa-specific endpoint wasn't in what I could find publicly.
  // Verify the real order on the M-Pesa STK Push Init page in your
  // dashboard before testing - a wrong order fails signature verification,
  // not silently.
  const signature = signFields([
    process.env.JENGA_MERCHANT_ACCOUNT_NUMBER,
    accountReference,
    phone,
    'MPESA',
    String(Math.round(amount)),
    'KES',
  ]);

  // CONFIRM THIS: exact URL path. Built from the documented endpoint
  // structure (Receive Money > M-Pesa STK Push > Wallet Based Settlement),
  // but the real path segment should be copied directly from your
  // dashboard's API Explorer for this exact endpoint.
  const url = `${BASE_URL}/v3-apis/receive-money-api/v3.0/mpesa/stkpush`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Signature: signature,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      order: {
        orderReference: accountReference,
        orderAmount: Math.round(amount),
        orderCurrency: 'KES',
        source: 'APICHECKOUT',
        countryCode: 'KE',
        description,
      },
      payment: {
        paymentReference: accountReference,
        paymentCurrency: 'KES',
        channel: 'MOBILE',
        service: 'MPESA', // Jenga's unified endpoint also supports 'EQUITEL' -
                           // defaulting to MPESA since that covers the large
                           // majority of Kenyan mobile money users.
        provider: 'JENGA',
        callbackUrl: process.env.JENGA_CALLBACK_URL,
        details: {
          msisdn: phone,
          paymentAmount: Math.round(amount),
        },
      },
    }),
  });

  const data = await res.json();

  if (!res.ok || data.status !== true) {
    throw new Error(data.message || 'Jenga STK push failed');
  }

  // Some Jenga responses embed the final M-Pesa result immediately
  // (synchronous-looking), others only give a tracking reference and
  // report the real result later via callbackUrl (asynchronous, same
  // pattern as Daraja). Handle both: if the nested stkCallback is present
  // now, use its CheckoutRequestID; otherwise fall back to Jenga's own
  // transactionReference and wait for the callback like before.
  const embeddedCallback = data.data?.Body?.stkCallback;
  const checkoutRequestId = embeddedCallback?.CheckoutRequestID || data.transactionReference;

  return { checkoutRequestId };
}