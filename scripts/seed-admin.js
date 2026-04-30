#!/usr/bin/env node
// Usage: node scripts/seed-admin.js <email> <password> [name]
// Creates or updates an admin user in team_users.
// Run this once after first deploy to create Tyler's account.

require('dotenv').config();
const bcrypt = require('bcryptjs');
const supabase = require('../lib/db');

async function seedAdmin() {
  const [,, email, password, name = 'Tyler'] = process.argv;

  if (!email || !password) {
    console.error('Usage: node scripts/seed-admin.js <email> <password> [name]');
    process.exit(1);
  }

  const password_hash = await bcrypt.hash(password, 12);

  const { data, error } = await supabase
    .from('team_users')
    .upsert(
      { email: email.toLowerCase().trim(), full_name: name, role: 'admin', password_hash, active: true },
      { onConflict: 'email' }
    )
    .select('id, email, full_name, role')
    .single();

  if (error) {
    console.error('Seed failed:', error.message);
    process.exit(1);
  }

  console.log('Admin user created/updated:', data);
}

seedAdmin();
