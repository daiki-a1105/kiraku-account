import jwt from 'jsonwebtoken';

/**
 * Token endpoint
 *
 * ChatGPT calls this endpoint to exchange the authorization code received
 * from the github/callback for a bearer access token.  We validate the
 * client credentials, check the authorization code, and then issue a
 * JWT that includes the user ID.  A refresh token is also issued so
 * ChatGPT can refresh the session if needed.  All tokens are signed
 * using a shared secret.
 */
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Only POST allowed.' });
    }
    let body;
    try {
      body = await req.json();
    } catch (err) {
      return res.status(400).json({ code: 'INVALID_REQUEST', message: 'Malformed JSON' });
    }
    const { grant_type, client_id, client_secret, code } = body;
    if (grant_type !== 'authorization_code') {
      return res.status(400).json({ code: 'INVALID_GRANT', message: 'Unsupported grant_type' });
    }
    if (client_id !== process.env.CHATGPT_OAUTH_CLIENT_ID || client_secret !== process.env.CHATGPT_OAUTH_CLIENT_SECRET) {
      return res.status(400).json({ code: 'INVALID_CLIENT', message: 'Invalid client credentials' });
    }
    if (!code) {
      return res.status(400).json({ code: 'INVALID_REQUEST', message: 'Missing code' });
    }

    // Dynamic import to avoid top-level import errors
    const { kv } = await import('@vercel/kv');

    const codeKey = `chatgpt_code:${code}`;
    const codeRaw = await kv.get(codeKey);
    if (!codeRaw) {
      return res.status(400).json({ code: 'INVALID_CODE', message: 'Invalid or expired code' });
    }
    await kv.del(codeKey);
    const codeData = JSON.parse(codeRaw);
    const userId = codeData.userId;
    // Build the JWT payload.  Include a plan field (free by default).
    const payload = {
      sub: userId,
      plan: 'free',
    };
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: 60 * 60 }); // 1 hour
    const refreshToken = jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: 60 * 60 * 24 * 30 }); // 30 days
    return res.status(200).json({
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: refreshToken,
    });
  } catch (err) {
    console.error('token error:', err);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: err.message, stack: err.stack });
  }
}
