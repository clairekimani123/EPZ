const BASE_URL =
  process.env.MPESA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

    //the getAccessToken is an authorization token that is used to authenticate requests to the M-Pesa API.
    //  It is obtained by sending a request to the M-Pesa OAuth endpoint with the consumer key and secret, and it expires after a certain period of time. 
    // The function caches the token and its expiration time to avoid unnecessary requests for a new token.
let cachedToken = null; 
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }
  // The credentials are created by concatenating the consumer key and secret, separated by a colon, and then encoding the resulting string in base64.
  //it's a http Auth, safaricom's OAuth endpoint requires the credentials to be sent in the Authorization header of the request, using the Basic authentication scheme. And base64 it's just the encoding of  both cosumer key and secret, note it is not encrypted since base64 is not a secure encoding method, but it is a standard way to transmit credentials over HTTp, thus this is server to server communication, so it is safe to use base64 encoding for this purpose.
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
  tokenExpiresAt = Date.now() + (Number(data.expires_in) - 60) * 1000;
  return cachedToken;
}
//the shape of the phone number is important because M-Pesa requires phone numbers to be in a specific format for transactions. The function ensures that the phone number is in the correct format before initiating an STK push request, which is a type of mobile payment request that allows users to pay for goods and services using their mobile phones.
export function normalizePhoneForMpesa(rawPhone) {
  if (!rawPhone) return null;
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return '254' + digits.slice(1);
  if ((digits.startsWith('7') || digits.startsWith('1')) && digits.length === 9) return '254' + digits;
  return null;
}

//const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);new Date().toISOString(): Generates the current system time in UTC ISO 8601 format string (e.g., "2026-08-31T13:05:58.123Z")
// .replace(/[^0-9]/g, ''): Uses a regex pattern to strip out every non-digit character (-, :, T, ., Z), leaving only raw numbers: "20260831130558123"
// .slice(0, 14): Truncates the string to keep only the first 14 digits, corresponding to YYYYMMDDHHmmss format: "20260831130558".
// Why? Safaricom Daraja requires the timestamp strictly in the 14-character YYYYMMDDHHmmss format.
// const password = Buffer.from(${SHORTCODE}${PASSKEY}${timestamp}).toString('base64');${SHORTCODE}${PASSKEY}${timestamp}: Concatenates your Business ShortCode, Passkey, and the 14-digit timestamp into a single raw string (e.g., "174379bfb27...20260831130558")
// .Buffer.from(...): Converts that combined raw string into a Node.js binary Buffer object.
// .toString('base64'): Encodes that binary buffer into a Base64 string format.
// Why? Safaricom authenticates Lipa Na M-Pesa (STK Push) requests by requiring a Base64-encoded hash of the concatenated shortcode, passkey, and timestamp.
//this partis woth my attention cause am going to replace it with equity fucntion
function buildPasswordAndTimestamp() {
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const password = Buffer.from(
    `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
  ).toString('base64');
  return { timestamp, password };
}

export async function initiateStkPush({ phone, amount, accountReference, description }) {
  const accessToken = await getAccessToken();
  const { timestamp, password } = buildPasswordAndTimestamp();

  const res = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(amount),
      PartyA: phone,
      PartyB: process.env.MPESA_SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: process.env.MPESA_CALLBACK_URL,
      AccountReference: accountReference.slice(0, 12),
      TransactionDesc: description.slice(0, 13),
    }),
  });

  const data = await res.json();
  if (!res.ok || data.ResponseCode !== '0') {
    throw new Error(data.errorMessage || data.ResponseDescription || 'STK push failed');
  }
  return { checkoutRequestId: data.CheckoutRequestID };
}