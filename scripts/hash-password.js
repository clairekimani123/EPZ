import bcrypt from 'bcrypt';

// A tiny one-off script. Run it once to turn your chosen admin password
// into a hash you paste into .env — you never store the real password.
// Usage: node scripts/hash-password.js "your-chosen-password"

const password = process.argv[2];

if (!password) {
  console.error('Usage: node scripts/hash-password.js "your-password"');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 10);
console.log('\nPaste this into your .env as ADMIN_PASSWORD_HASH:\n');
console.log(hash);
console.log('');