/**
 * Test JWT Generator
 *
 * Usage: node test-jwt.js <JWT_SECRET>
 *
 * Generates valid access_token and refresh_token for testing.
 * The tokens have proper 'type' claims for security validation.
 *
 * Token claims:
 *   - access_token: { sub, plan, type: 'access' }
 *   - refresh_token: { sub, type: 'refresh' }
 */
import jwt from 'jsonwebtoken';

const secret = process.argv[2];
if (!secret) {
  console.error('Usage: node test-jwt.js <JWT_SECRET>');
  process.exit(1);
}

const userId = 'test-user-12345';

// Access token with type: 'access'
const accessToken = jwt.sign(
  { sub: userId, plan: 'free', type: 'access' },
  secret,
  { expiresIn: '1h' }
);

// Refresh token with type: 'refresh'
const refreshToken = jwt.sign(
  { sub: userId, type: 'refresh' },
  secret,
  { expiresIn: '30d' }
);

console.log('=== Test Tokens Generated ===');
console.log('');
console.log('ACCESS_TOKEN (type: access):');
console.log(accessToken);
console.log('');
console.log('REFRESH_TOKEN (type: refresh):');
console.log(refreshToken);
console.log('');
console.log('=== Test Commands ===');
console.log('');
console.log('# 1. Test /user/me with ACCESS token (expect 200):');
console.log(`curl -i -H "Authorization: Bearer ${accessToken}" "https://kiraku-account.vercel.app/user/me"`);
console.log('');
console.log('# 2. Test /user/me with REFRESH token (expect 401 - Access token required):');
console.log(`curl -i -H "Authorization: Bearer ${refreshToken}" "https://kiraku-account.vercel.app/user/me"`);
console.log('');
console.log('# 3. Test /user/save with ACCESS token (expect 200):');
console.log(`curl -i -X POST -H "Authorization: Bearer ${accessToken}" -H "Content-Type: application/json" "https://kiraku-account.vercel.app/user/save" --data '{"decision":{"statement":"テスト分析"},"pros":[{"label":"メリット","importance":5,"confidence":4}],"cons":[{"label":"デメリット","importance":3,"confidence":3}]}'`);
console.log('');
console.log('# 4. Test /user/history with ACCESS token (expect 200):');
console.log(`curl -i -H "Authorization: Bearer ${accessToken}" "https://kiraku-account.vercel.app/user/history"`);
console.log('');
console.log('# 5. Test refresh_token grant with REFRESH token (requires client_id/secret):');
console.log('# Replace <CLIENT_ID> and <CLIENT_SECRET> with actual values from Vercel env');
console.log(`curl -i -X POST "https://kiraku-account.vercel.app/oauth/token" -H "Content-Type: application/x-www-form-urlencoded" --data "grant_type=refresh_token&client_id=<CLIENT_ID>&client_secret=<CLIENT_SECRET>&refresh_token=${refreshToken}"`);
console.log('');
console.log('# 6. Test refresh_token grant with ACCESS token (expect 400 INVALID_GRANT):');
console.log('# This should FAIL because access tokens cannot be used as refresh tokens');
console.log(`curl -i -X POST "https://kiraku-account.vercel.app/oauth/token" -H "Content-Type: application/x-www-form-urlencoded" --data "grant_type=refresh_token&client_id=<CLIENT_ID>&client_secret=<CLIENT_SECRET>&refresh_token=${accessToken}"`);
