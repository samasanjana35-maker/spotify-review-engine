/**
 * Apply db/schema.sql to Supabase via direct PostgreSQL connection.
 * Requires SUPABASE_DB_PASSWORD in .env (from Supabase Dashboard → Settings → Database).
 * Run once: node scripts/apply-schema-pg.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function applySchema() {
  const password = process.env.SUPABASE_DB_PASSWORD;
  const projectRef = process.env.SUPABASE_URL
    .replace('https://', '')
    .replace('.supabase.co', '');

  if (!password) {
    throw new Error(
      'SUPABASE_DB_PASSWORD is required. Find it in Supabase Dashboard → Settings → Database → Database password'
    );
  }

  const client = new Client({
    host: `db.${projectRef}.supabase.co`,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password,
    ssl: { rejectUnauthorized: false },
  });

  const schemaPath = path.join(__dirname, '../db/schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  await client.connect();
  console.log('Connected to PostgreSQL.');

  try {
    await client.query(sql);
    console.log('Schema applied successfully.');
  } finally {
    await client.end();
  }
}

applySchema().catch((err) => {
  console.error('Schema apply failed:', err.message);
  process.exit(1);
});
