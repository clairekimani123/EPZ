import bcrypt from 'bcrypt';

// Run once to turn your chosen admin password into a hash you paste into
// .env. You never store the real password anywhere, only this hash.
//
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