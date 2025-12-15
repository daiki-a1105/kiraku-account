import { kv } from '@vercel/kv';
import { randomBytes } from 'crypto';

/**
 * OAuth authorize endpoint
 *
 * This endpoint is called by ChatGPT during the OAuth flow.  It validates the
 * client_id and redirect_uri, stores a relay state in KV, and then redirects
 * the user to GitHub's OAuth authorization page.  Once the user authorizes
 * your GitHub app, GitHub will redirect back to the github/callback
 * endpoint below.
 */
export default async function handler(req, res) {
  // Only GET requests are allowed.  Other methods return 405.
  if (req.method !== 'GET') {
    return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Only GET allowed.' });
  }
  const { client_id, redirect_uri, state, scope = 'basic' } = req.query;

  // Validate the client ID.
  if (client_id !== process.env.CHATGPT_OAUTH_CLIENT_ID) {
    return res.status(400).json({ code: 'INVALID_CLIENT', message: 'Unknown client_id.' });
  }

  // Validate the redirect URI against the list of allowed URIs.
  const allowedUris = (process.env.OAUTH_ALLOWED_REDIRECT_URIS || '').split(',').map(u => u.trim()).filter(Boolean);
  if (!allowedUris.includes(redirect_uri)) {
    return res.status(400).json({ code: 'INVALID_REDIRECT_URI', message: 'redirect_uri is not allowed.' });
  }

  // The state parameter from ChatGPT must be present for CSRF protection.
  if (!state) {
    return res.status(400).json({ code: 'INVALID_STATE', message: 'Missing state parameter.' });
  }

  // Create a relay state and persist it so we can look it up during the GitHub callback.
  const relayState = randomBytes(16).toString('hex');
  const relayData = {
    chatgptState: state,
    redirectUri: redirect_uri,
    scope,
  };
  // Store the relay data with a TTL of 600 seconds (10 minutes).
  await kv.set(`relay:${relayState}`, JSON.stringify(relayData), { ex: 600 });

  // Construct the GitHub authorization URL.  The redirect_uri passed to GitHub
  // points back to the github/callback endpoint on this project.
  const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
  githubAuthUrl.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID);
  githubAuthUrl.searchParams.set('redirect_uri', `${process.env.BASE_URL}/api/oauth/github/callback`);
  githubAuthUrl.searchParams.set('state', relayState);
  githubAuthUrl.searchParams.set('scope', 'read:user');

  // Redirect the user to GitHub to complete the OAuth flow.
  res.setHeader('Location', githubAuthUrl.toString());
  return res.status(302).end();
}