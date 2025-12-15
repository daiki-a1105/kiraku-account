module.exports = (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Only POST allowed.' });
  }
  // TODO: Implement save logic (validate JWT, scoring, storage)
  return res.status(501).json({ code: 'NOT_IMPLEMENTED', message: 'Save endpoint not implemented.' });
};
