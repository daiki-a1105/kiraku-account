module.exports = (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Only POST allowed.' });
  }
  return res.status(501).json({ error: 'Not implemented' });
};
