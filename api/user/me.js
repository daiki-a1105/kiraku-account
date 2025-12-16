import jwt from 'jsonwebtoken';

/**
 * Get current user info endpoint
 *
 * Returns the authenticated user's profile including plan info and usage.
 * Requires Authorization: Bearer <token> header.
 */
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Only GET allowed.' });
    }

    // Require authentication
    const auth = req.headers.authorization || '';
    const token = auth.split(' ')[1];
    if (!token) {
      return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Missing bearer token' });
    }

    let claims;
    try {
      claims = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid token' });
    }

    const userId = claims.sub;
    const plan = claims.plan || 'free';

    // Get current month usage from KV
    const { kv } = await import('@vercel/kv');
    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const usageKey = `usage:${userId}:${period}`;
    const usageRaw = await kv.get(usageKey);
    const savesUsed = typeof usageRaw === 'number' ? usageRaw : (parseInt(usageRaw, 10) || 0);

    return res.status(200).json({
      user_id: userId,
      plan,
      limits: {
        monthly_saves: plan === 'free' ? 10 : 1000,
        retention_days: plan === 'free' ? 30 : 365,
      },
      usage: {
        period,
        saves_used: savesUsed,
      },
    });
  } catch (err) {
    console.error('me error:', err);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: err.message });
  }
}
