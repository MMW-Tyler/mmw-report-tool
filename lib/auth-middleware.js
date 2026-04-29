// Middleware for API routes — returns JSON errors
function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

// Middleware for HTML page routes — redirects to /login
function requireAuthPage(req, res, next) {
  if (!req.session?.userId) {
    return res.redirect('/login');
  }
  next();
}

function requireAdminPage(req, res, next) {
  if (!req.session?.userId) {
    return res.redirect('/login');
  }
  if (req.session.role !== 'admin') {
    return res.status(403).send('Forbidden');
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireAuthPage, requireAdminPage };
