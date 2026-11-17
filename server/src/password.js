// Password hashing for the users table: md5 hex (32 chars).
//
// This was ricky's explicit choice (2026-11-17), replacing bcryptjs. Be aware
// md5 is fast enough to brute-force in bulk if the DB ever leaks — keep the
// default account's password non-trivial. Hash compares are timing-safe via
// crypto.timingSafeEqual on equal-length 16-byte digests.
//
// Storing: phpMyAdmin-friendly — MD5('<plaintext>') in the SQL editor, or the
// app's own INSERT paths, produce exactly this 32-hex-char format.
const crypto = require('crypto');

function hashPassword(plain) {
  return crypto.createHash('md5').update(String(plain), 'utf8').digest('hex');
}

// Length check first so timingSafeEqual never throws on foreign values
// (e.g. a legacy bcrypt row that survived migration).
function verifyPassword(plain, stored) {
  if (typeof stored !== 'string') return false;
  const storedHex = stored.trim().toLowerCase();
  if (storedHex.length !== 32 || !/^[0-9a-f]{32}$/.test(storedHex)) return false;
  const candidate = Buffer.from(hashPassword(plain), 'hex');
  const expected = Buffer.from(storedHex, 'hex');
  return crypto.timingSafeEqual(candidate, expected);
}

module.exports = { hashPassword, verifyPassword };
