/**
 * Test JWT Generator
 *
 * Usage: node test-jwt.js <JWT_SECRET>
 *
 * Generates a valid access_token and refresh_token for testing.
 */
import jwt from 'jsonwebtoken';

const secret = process.argv[2];
if (!secret) {
  console.error('Usage: node test-jwt.js <JWT_SECRET>');
  process.exit(1);
}

const userId = 'test-user-12345';

const accessToken = jwt.sign(
  { sub: userId, plan: 'free' },
  secret,
  { expiresIn: '1h' }
);

const refreshToken = jwt.sign(
  { sub: userId, type: 'refresh' },
  secret,
  { expiresIn: '30d' }
);

console.log('=== Test Tokens Generated ===');
console.log('');
console.log('ACCESS_TOKEN:');
console.log(accessToken);
console.log('');
console.log('REFRESH_TOKEN:');
console.log(refreshToken);
console.log('');
console.log('=== Test Commands ===');
console.log('');
console.log('# Test /user/me with Bearer:');
console.log(`curl -i -H "Authorization: Bearer ${accessToken}" "https://kiraku-account.vercel.app/user/me"`);
console.log('');
console.log('# Test /user/save:');
console.log(`curl -i -X POST -H "Authorization: Bearer ${accessToken}" -H "Content-Type: application/json" "https://kiraku-account.vercel.app/user/save" --data '{"decision":{"statement":"テスト分析"},"pros":[{"label":"メリット","importance":5,"confidence":4}],"cons":[{"label":"デメリット","importance":3,"confidence":3}]}'`);
console.log('');
console.log('# Test /user/history:');
console.log(`curl -i -H "Authorization: Bearer ${accessToken}" "https://kiraku-account.vercel.app/user/history"`);
