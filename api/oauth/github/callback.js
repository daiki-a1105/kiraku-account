import { randomBytes } from 'crypto';

/**
 * GitHub OAuth callback
 *
 * GitHub redirects to this endpoint with a temporary code and the relay
 * state that we passed in authorize.js.  We use the relay state to look up
 * the ChatGPT-specific state and redirect URI.  Then we exchange the code
 * with GitHub for an access token, fetch the user's GitHub profile, and
 * issue a new authorization code for ChatGPT.  The code is stored in KV
 * with a short TTL.  Finally, we redirect back to ChatGPT's redirect_uri
 * with the code and the original state.
 */
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Only GET allowed.' });
    }
    const { code, state: relayState } = req.query;
    if (!code || !relayState) {
      return res.status(400).json({ code: 'INVALID_REQUEST', message: 'Missing code or state.' });
    }

    // Dynamic import to avoid top-level import errors
    const { kv } = await import('@vercel/kv');

    // Retrieve and delete the relay data.
    const relayKey = `relay:${relayState}`;
    const relayRaw = await kv.get(relayKey);
    if (!relayRaw) {
      return res.status(400).json({ code: 'INVALID_STATE', message: 'Invalid or expired state.' });
    }
    await kv.del(relayKey);
    const relayData = JSON.parse(relayRaw);
    const { chatgptState, redirectUri } = relayData;

    // Exchange the GitHub code for an access token.
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${process.env.BASE_URL}/api/oauth/github/callback`,
      }),
    });
    const tokenData = await tokenRes.json();
    const githubAccessToken = tokenData.access_token;
    if (!githubAccessToken) {
      return res.status(400).json({ code: 'TOKEN_EXCHANGE_FAILED', message: 'Failed to obtain GitHub access token.' });
    }
    // Fetch the GitHub user profile.
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${githubAccessToken}`,
        'User-Agent': 'kiraku-account-oauth',
        Accept: 'application/vnd.github+json',
      },
    });
    const userData = await userRes.json();
    if (!userData || !userData.id) {
      return res.status(400).json({ code: 'INVALID_USER', message: 'Failed to retrieve GitHub user information.' });
    }
    const userId = String(userData.id);
    // Issue a temporary code for ChatGPT to exchange later.
    const chatgptCode = randomBytes(16).toString('hex');
    const codeData = {
      userId,
      issuedAt: Date.now(),
    };
    await kv.set(`chatgpt_code:${chatgptCode}`, JSON.stringify(codeData), { ex: 600 });
    // Redirect back to ChatGPT's redirect URI with the code and original state.
    const redirectUrl = new URL(redirectUri);
    redirectUrl.searchParams.set('code', chatgptCode);
    redirectUrl.searchParams.set('state', chatgptState);
    res.setHeader('Location', redirectUrl.toString());
    return res.status(302).end();
  } catch (err) {
    console.error('callback error:', err);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: err.message, stack: err.stack });
  }
}
