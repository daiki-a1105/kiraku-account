/**
 * Shared utilities for API handlers
 */

/**
 * Safely parse KV value that may be string or object
 * @vercel/kv can return either JSON string or parsed object depending on version/config
 */
export function parseKvValue(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return raw; // Return as-is if not valid JSON
    }
  }
  // Already an object
  return raw;
}

/**
 * Read request body with compatibility for various Vercel/Node environments
 * Handles: req.json(), req.body, and stream reading
 */
export async function readRequestBody(req) {
  // Try req.json() first (Edge runtime, newer Vercel)
  if (typeof req.json === 'function') {
    try {
      return await req.json();
    } catch {
      // Fall through to other methods
    }
  }

  // Try req.body (already parsed by Vercel/Express)
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    return req.body;
  }

  // Handle x-www-form-urlencoded (OAuth token endpoint standard)
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    if (typeof req.body === 'string') {
      const params = new URLSearchParams(req.body);
      const result = {};
      for (const [key, value] of params) {
        result[key] = value;
      }
      return result;
    }
    // If req.body is already parsed object for form data
    if (req.body && typeof req.body === 'object') {
      return req.body;
    }
  }

  // Try reading from stream (Node.js runtime)
  if (req.readable || req.on) {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => {
        try {
          // Try JSON first
          resolve(JSON.parse(data));
        } catch {
          // Try URL-encoded
          if (contentType.includes('application/x-www-form-urlencoded')) {
            const params = new URLSearchParams(data);
            const result = {};
            for (const [key, value] of params) {
              result[key] = value;
            }
            resolve(result);
          } else {
            resolve(data);
          }
        }
      });
      req.on('error', reject);
    });
  }

  throw new Error('Unable to read request body');
}

/**
 * Get base URL with fallback chain
 * Priority: BASE_URL > VERCEL_PROJECT_PRODUCTION_URL > VERCEL_URL > host header
 */
export function getBaseUrl(req) {
  if (process.env.BASE_URL) {
    return process.env.BASE_URL;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  // Fallback to request host header
  const host = req.headers.host || req.headers['x-forwarded-host'];
  if (host) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    return `${proto}://${host}`;
  }
  // Last resort
  return 'https://kiraku-account.vercel.app';
}
