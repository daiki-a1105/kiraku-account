module.exports = (req, res) => {
  // Only allow GET requests
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { client_id, redirect_uri, state } = req.query;
  // Validate required parameters
  if (!client_id || !redirect_uri || !state) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }
  // Ensure client ID matches the one configured for ChatGPT
  if (process.env.CHATGPT_OAUTH_CLIENT_ID && client_id !== process.env.CHATGPT_OAUTH_CLIENT_ID) {
    res.status(400).json({ error: 'invalid_client' });
    return;
  }
  // Check redirect URI against allowed list
  const allowed = (process.env.OAUTH_ALLOWED_REDIRECT_URIS || '').split(',').map((u) => u.trim());
  if (!allowed.includes(redirect_uri)) {
    res.status(400).json({ error: 'invalid_redirect_uri' });
    return;
  }
  // Build GitHub authorization URL
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent('https://kiraku-account.vercel.app/api/oauth/github/callback')}&state=${state}&scope=read%3Auser`;
  // Redirect to GitHub for user login
  res.writeHead(302, { Location: githubAuthUrl });
  res.end();
};
