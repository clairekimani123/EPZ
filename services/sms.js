import AfricasTalking from 'africastalking';

const credentials = {
  apiKey: process.env.AT_API_KEY,
  username: process.env.AT_USERNAME,
};

const africastalking = AfricasTalking(credentials);
const sms = africastalking.SMS;

export async function sendSms(phoneNumber, message) {
  try {
    // Africa's Talking requires international format, e.g. +254712345678
    const formattedPhone = phoneNumber.startsWith('0') 
      ? `+254${phoneNumber.slice(1)}` 
      : phoneNumber;

    const result = await sms.send({
      to: [formattedPhone],
      message: message,
      from: process.env.AT_SENDER_ID, // Optional
    });
    console.log('SMS sent:', result);
    return result;
  } catch (error) {
    console.error('SMS error:', error);
    throw error;
  }
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