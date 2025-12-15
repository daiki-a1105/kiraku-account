import { kv } from '@vercel/kv';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

/**
 * Save analysis endpoint
 *
 * This endpoint persists an analysis record for the authenticated user.  It
 * validates the incoming payload, recalculates weighted scores and the
 * decision gate, enforces plan limits (monthly save count and retention),
 * then stores the record in KV with an index for history lookups.  The
 * response returns the stored record with server‑computed fields.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Only POST allowed.' });
  }
  // Parse and verify JWT from Authorization header.
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
  // Parse body
  let payload;
  try {
    payload = await req.json();
  } catch (err) {
    return res.status(400).json({ code: 'INVALID_REQUEST', message: 'Malformed JSON' });
  }
  const { decision, pros, cons, diff_threshold = 10, top_n = 3, low_confidence_threshold = 2 } = payload;
  if (!decision || !decision.statement || !Array.isArray(pros) || !Array.isArray(cons)) {
    return res.status(400).json({ code: 'INVALID_REQUEST', message: 'decision, pros, and cons are required' });
  }
  // Enforce plan limits
  if (plan === 'free') {
    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const usageKey = `usage:${userId}:${period}`;
    const usage = (await kv.get(usageKey)) || 0;
    const monthlyLimit = 10;
    if (usage >= monthlyLimit) {
      return res.status(429).json({ code: 'PLAN_LIMIT', message: 'Monthly save limit reached' });
    }
    // Increment usage in KV
    await kv.set(usageKey, usage + 1, { ex: 60 * 60 * 24 * 31 });
  }
  // Compute weighted scores
  const scoreItems = (list, side) => list.map(item => {
    const importance = Number(item.importance);
    const confidence = Number(item.confidence);
    const weighted = importance * confidence;
    return { ...item, side, weighted };
  });
  const prosScored = scoreItems(pros, 'pro');
  const consScored = scoreItems(cons, 'con');
  const proTotal = prosScored.reduce((sum, item) => sum + item.weighted, 0);
  const conTotal = consScored.reduce((sum, item) => sum + item.weighted, 0);
  const diff = Math.abs(proTotal - conTotal);
  // Merge and sort to find top items
  const allItems = [...prosScored, ...consScored];
  allItems.sort((a, b) => b.weighted - a.weighted);
  const topItems = allItems.slice(0, top_n);
  const diffWithin = diff <= diff_threshold;
  const lowConfInTop = topItems.some(item => item.confidence <= low_confidence_threshold);
  const needsVerification = diffWithin || lowConfInTop;
  const reasons = [];
  if (diffWithin) reasons.push(`条件A:差分が${diff_threshold}点以内`);
  if (lowConfInTop) reasons.push(`条件B:上位${top_n}に確度${low_confidence_threshold}以下が含まれる`);
  const decisionGate = {
    needs_verification: needsVerification,
    reasons,
    flags: {
      diff_within_threshold: diffWithin,
      low_confidence_in_top_items: lowConfInTop,
    },
    verification_targets: topItems.filter(item => item.confidence <= low_confidence_threshold).map(item => item.item_id || item.label),
  };
  const totals = {
    pro_total: proTotal,
    con_total: conTotal,
    diff,
  };
  // Build record
  const analysisId = payload.analysis_id || randomUUID();
  const nowTs = Date.now();
  const record = {
    schema_version: '1.0',
    analysis_id: analysisId,
    status: needsVerification ? 'needs_verification' : 'ready',
    created_at: nowTs,
    updated_at: nowTs,
    decision,
    params: { diff_threshold, top_n, low_confidence_threshold },
    pros: prosScored.map(({ side, ...rest }) => rest),
    cons: consScored.map(({ side, ...rest }) => rest),
    scoring: {
      pros_scored: prosScored,
      cons_scored: consScored,
      totals,
      top_items: topItems,
      decision_gate: decisionGate,
    },
    verification: payload.verification || null,
    fatal_check: payload.fatal_check || null,
    time_axis_check: payload.time_axis_check || null,
    summary: payload.summary || null,
    meta: payload.meta || null,
  };
  // Persist to KV
  const keyMain = `analysis:${userId}:${analysisId}`;
  const keyIndex = `analysis_index:${userId}`;
  // Use JSON string for the record for simplicity
  await kv.set(keyMain, JSON.stringify(record));
  // Prepend to list for latest-first order; use ZSET or list.  We'll use list for MVP.
  await kv.lpush(keyIndex, analysisId);
  // Truncate list to a maximum number of items (plan dependent)
  const maxItems = plan === 'free' ? 50 : 1000;
  await kv.ltrim(keyIndex, 0, maxItems - 1);
  return res.status(200).json(record);
}