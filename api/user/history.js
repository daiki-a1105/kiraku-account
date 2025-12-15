import { kv } from '@vercel/kv';
import jwt from 'jsonwebtoken';

/**
 * History endpoint
 *
 * Returns a paginated list of the user's saved analyses.  The response
 * includes minimal fields necessary to display an overview.  Pagination
 * is implemented using a cursor (offset) and limit.  The cursor is a
 * numeric offset into the list of analysis IDs stored in KV.
 */
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Only GET allowed.' });
    }
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
    // Parse query params
    const limitParam = req.query.limit;
    const cursorParam = req.query.cursor;
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 50) : 20;
    const cursor = cursorParam ? parseInt(cursorParam, 10) : 0;
    if (isNaN(limit) || limit <= 0 || isNaN(cursor) || cursor < 0) {
      return res.status(400).json({ code: 'INVALID_QUERY', message: 'Invalid cursor or limit' });
    }
    const indexKey = `analysis_index:${userId}`;
    // Get the range of analysis IDs for the requested page.
    const analysisIds = await kv.lrange(indexKey, cursor, cursor + limit - 1);
    const items = [];
    for (const analysisId of analysisIds) {
      const recordRaw = await kv.get(`analysis:${userId}:${analysisId}`);
      if (!recordRaw) continue;
      const record = JSON.parse(recordRaw);
      items.push({
        analysis_id: record.analysis_id,
        title: record.title || record.decision?.statement || '',
        decision_statement: record.decision?.statement || '',
        status: record.status,
        updated_at: record.updated_at,
        diff: record.scoring?.totals?.diff || 0,
        needs_verification: record.scoring?.decision_gate?.needs_verification || false,
        fatal_overall_level: record.fatal_check?.overall_level || 'unknown',
        top1_label: record.scoring?.top_items?.[0]?.label || '',
      });
    }
    // Determine the next cursor
    let nextCursor = null;
    if (analysisIds.length === limit) {
      nextCursor = cursor + limit;
    }
    return res.status(200).json({ items, next_cursor: nextCursor });
  } catch (err) {
    console.error('history error:', err);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: err.message, stack: err.stack });
  }
}
