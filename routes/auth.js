const express = require('express');
const bcrypt = require('bcryptjs');
const supabase = require('../lib/db');

const router = express.Router();

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const { data: user, error } = await supabase
      .from('team_users')
      .select('id, email, name, role, password_hash, is_active')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (error || !user || !user.is_active) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.session.userId = user.id;
    req.session.email  = user.email;
    req.session.name   = user.name;
    req.session.role   = user.role;

    res.json({ ok: true, role: user.role, name: user.name });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// GET /auth/me — session probe for frontend
router.get('/me', (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({
    userId: req.session.userId,
    email:  req.session.email,
    name:   req.session.name,
    role:   req.session.role,
  });
});

module.exports = router;
