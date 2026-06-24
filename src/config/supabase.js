// Service role client — backend only, never expose to frontend
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || supabaseUrl.toLowerCase().includes('placeholder')) {
  throw new Error('Missing or placeholder SUPABASE_URL. Set a real Supabase project URL in .env');
}
if (!supabaseServiceRoleKey || supabaseServiceRoleKey.toLowerCase().includes('placeholder')) {
  throw new Error('Missing or placeholder SUPABASE_SERVICE_ROLE_KEY. Set a real service role key in .env');
}

// Polyfill WebSocket for Node.js < 22
if (!globalThis.WebSocket) {
  globalThis.WebSocket = require('ws');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  global: {
    fetch: (...args) => fetch(...args),
  },
});

module.exports = supabase;
