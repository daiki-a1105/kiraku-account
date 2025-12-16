import jwt from 'jsonwebtoken';
import { readRequestBody, parseKvValue } from '../_utils.js';

/**
 * Token endpoint
 *
 * ChatGPT calls this endpoint to exchange the authorization code received
 * from the github/callback for a bearer access token, or to refresh an
 * existing session using a refresh token.
 *
 * Supported grant_type:
 *   - authorization_code: Exchange code for tokens
 *   - refresh_token: Get new access token using refresh token
 */
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Only POST allowed.' });
    }

    let body;
    try {
      body = await readRequestBody(req);
    } catch (err) {
      return res.status(400).json({ code: 'INVALID_REQUEST', message: 'Unable to parse request body' });
    }

    if (!body || typeof body !== 'object') {
      return res.status(400).json({ code: 'INVALID_REQUEST', message: 'Request body required' });
    }

    const { grant_type, client_id, client_secret, code, refresh_token } = body;

    // Validate client credentials
    if (client_id !== process.env.CHATGPT_OAUTH_CLIENT_ID || client_secret !== process.env.CHATGPT_OAUTH_CLIENT_SECRET) {
      return res.status(400).json({ code: 'INVALID_CLIENT', message: 'Invalid client credentials' });
    }

    // Handle authorization_code grant
    if (grant_type === 'authorization_code') {
      if (!code) {
        return res.status(400).json({ code: 'INVALID_REQUEST', message: 'Missing code' });
      }

      const { kv } = await import('@vercel/kv');
      const codeKey = `chatgpt_code:${code}`;
      const codeRaw = await kv.get(codeKey);

      if (!codeRaw) {
        return res.status(400).json({ code: 'INVALID_CODE', message: 'Invalid or expired code' });
      }

      await kv.del(codeKey);

      // Safe parse - handle both string and object
      const codeData = parseKvValue(codeRaw);
      if (!codeData || !codeData.userId) {
        return res.status(400).json({ code: 'INVALID_CODE', message: 'Malformed code data' });
      }

      const userId = codeData.userId;

      // Build tokens
      const payload = { sub: userId, plan: 'free' };
      const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: 60 * 60 }); // 1 hour
      const newRefreshToken = jwt.sign({ sub: userId, type: 'refresh' }, process.env.JWT_SECRET, { expiresIn: 60 * 60 * 24 * 30 }); // 30 days

      return res.status(200).json({
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: newRefreshToken,
      });
    }

    // Handle refresh_token grant
    if (grant_type === 'refresh_token') {
      if (!refresh_token) {
        return res.status(400).json({ code: 'INVALID_REQUEST', message: 'Missing refresh_token' });
      }

      let claims;
      try {
        claims = jwt.verify(refresh_token, process.env.JWT_SECRET);
      } catch (err) {
        return res.status(400).json({ code: 'INVALID_GRANT', message: 'Invalid or expired refresh token' });
      }

      const userId = claims.sub;

      // Issue new tokens
      const payload = { sub: userId, plan: 'free' };
      const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: 60 * 60 }); // 1 hour
      const newRefreshToken = jwt.sign({ sub: userId, type: 'refresh' }, process.env.JWT_SECRET, { expiresIn: 60 * 60 * 24 * 30 }); // 30 days

      return res.status(200).json({
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: newRefreshToken,
      });
    }

    // Unsupported grant type
    return res.status(400).json({ code: 'UNSUPPORTED_GRANT_TYPE', message: `Unsupported grant_type: ${grant_type}` });

  } catch (err) {
    console.error('token error:', err);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: err.message });
  }
}
