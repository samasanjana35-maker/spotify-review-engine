/**
 * Apply db/schema.sql to Supabase.
 * Run once: node scripts/apply-schema.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function tryEndpoint(url, sql) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  const text = await response.text();
  return { ok: response.ok, status: response.status, text, url };
}

async function applySchema() {
  const schemaPath = path.join(__dirname, '../db/schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');

  const endpoints = [
    `${supabaseUrl}/pg/query`,
    `${supabaseUrl}/platform/pg-meta/${projectRef}/query`,
    `${supabaseUrl}/platform/pg-meta/default/query`,
  ];

  for (const endpoint of endpoints) {
    const result = await tryEndpoint(endpoint, sql);
    console.log(`Tried ${endpoint} → HTTP ${result.status}`);

    if (result.ok) {
      console.log('Schema applied successfully.');
      return;
    }
  }

  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (const endpoint of endpoints) {
    let allOk = true;

    for (const statement of statements) {
      const result = await tryEndpoint(endpoint, `${statement};`);
      if (!result.ok) {
        allOk = false;
        console.log(`Failed (${result.status}): ${statement.substring(0, 80)}...`);
        break;
      }
      console.log(`OK: ${statement.substring(0, 80)}...`);
    }

    if (allOk) {
      console.log('Schema applied successfully (statement by statement).');
      return;
    }
  }

  throw new Error(
    'Could not apply schema via API. Run db/schema.sql manually in Supabase Dashboard → SQL Editor.'
  );
}

applySchema().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
