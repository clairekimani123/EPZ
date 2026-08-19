// --------------------------------------------------------------------------
// This is deliberately built as a small, swappable interface: one function,
// sendSms(phoneNumber, message). Right now it just logs to your terminal
// instead of sending a real SMS, controlled by SMS_ENABLED in .env. When
// you're ready to wire up a real provider (Africa's Talking, Twilio), you
// only ever touch THIS file - nothing that calls sendSms() needs to change.
// That's the "build vs buy" pattern from your original project spec in
// practice: start with a stub, swap the implementation later without
// rewriting the code that depends on it.
// --------------------------------------------------------------------------

const SMS_ENABLED = process.env.SMS_ENABLED === 'true';

export async function sendSms(phoneNumber, message) {
  if (!SMS_ENABLED) {
    console.log(`[SMS - not sent, SMS_ENABLED=false] to ${phoneNumber}: "${message}"`);
    return { success: true, simulated: true };
  }

  // --- Real integration goes here once you're ready, e.g. Africa's Talking:
  //
  // import AfricasTalking from 'africastalking';
  // const at = AfricasTalking({ apiKey: process.env.AT_API_KEY, username: process.env.AT_USERNAME });
  // const result = await at.SMS.send({ to: [phoneNumber], message });
  // return { success: true, result };

  console.warn('SMS_ENABLED is true but no real provider is wired up yet in services/sms.js');
  return { success: false, error: 'SMS provider not configured' };
}

// Small helper so status-change messages stay consistent and easy to edit
// in one place, rather than being written inline wherever status changes.
export function statusChangeMessage(fullName, newStatus) {
  const messages = {
    shortlisted: `Hi ${fullName}, you've been shortlisted! Our team will contact you about next steps.`,
    contract_signed: `Hi ${fullName}, thanks for signing your contract. Training details will follow soon.`,
    in_training: `Hi ${fullName}, your training has begun. Good luck!`,
    employed: `Hi ${fullName}, congratulations - you're now employed! Welcome aboard.`,
    rejected: `Hi ${fullName}, thank you for applying. Unfortunately we won't be moving forward this time.`,
  };
  return messages[newStatus] || `Hi ${fullName}, your application status has been updated to ${newStatus}.`;
}
