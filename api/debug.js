export default async function handler(req, res) {
  try {
    // Test dynamic import of @vercel/kv
    const { kv } = await import('@vercel/kv');

    // Try a simple ping
    const result = await kv.ping();

    return res.status(200).json({
      ok: true,
      ping: result,
      env: {
        KV_REST_API_URL: process.env.KV_REST_API_URL ? 'set' : 'missing',
        KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN ? 'set' : 'missing',
      }
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message,
      stack: err.stack
    });
  }
}
