#!/usr/bin/env node
/**
 * CORS origin verification script for the Chat Widget Worker.
 *
 * Usage:
 *   node scripts/cors-check.mjs                          # List all client origins
 *   node scripts/cors-check.mjs mkstuccollc.com          # Check a specific origin
 *   node scripts/cors-check.mjs --live                   # Test live endpoint CORS headers
 *   node scripts/cors-check.mjs mkstuccollc.com --live   # Check origin + test live
 */

const LIVE_URL = 'https://chat-widget.kadenaweb.solutions';

const CHAT_CLIENTS = {
  'mkstucco.com':        ['mkstuccollc.com', 'www.mkstuccollc.com', 'mk-stucco-llc.pages.dev'],
  'nixonconsulting.com': ['nixonconsulting.net', 'www.nixonconsulting.net', 'nixon-consulting.pages.dev'],
  'generationplastering.com': ['generationplastering.com', 'www.generationplastering.com', 'generation-plastering.pages.dev'],
  'jgpcolorado.com':    ['jgpcolorado.com', 'www.jgpcolorado.com', 'jg-plastering.pages.dev'],
  'rg-drywall.com':     ['rg-drywall.com', 'www.rg-drywall.com', 'rg-drywall-llc.pages.dev'],
  'floorwater.gg':      ['floorwater.gg', 'www.floorwater.gg', 'floor-water-gang.pages.dev'],
  'mrweedbuakhao.com':  ['mrweedbuakhao.com', 'www.mrweedbuakhao.com', 'mr-weed-buakhao.pages.dev'],
  'default':            ['kadenaweb.solutions', 'www.kadenaweb.solutions', 'kadena-web-solutions.pages.dev'],
};

/**
 * Check whether a given origin hostname matches any client's allowed origins.
 */
function resolveClient(origin) {
  let hostname;
  try {
    hostname = new URL(origin.startsWith('http') ? origin : `https://${origin}`).hostname;
  } catch {
    hostname = origin;
  }

  for (const [key, origins] of Object.entries(CHAT_CLIENTS)) {
    if (origins.includes(hostname)) return { clientKey: key, matchType: 'exact' };
    for (const allowed of origins) {
      if (hostname.endsWith('.' + allowed)) return { clientKey: key, matchType: 'subdomain' };
    }
  }

  return { clientKey: null, matchType: null };
}

/**
 * Test live endpoint CORS headers by sending an OPTIONS request.
 */
async function testLive(origin) {
  const url = `${LIVE_URL}/health`;
  try {
    const res = await fetch(url, {
      method: 'OPTIONS',
      headers: { 'Origin': origin, 'Access-Control-Request-Method': 'GET' },
      signal: AbortSignal.timeout(10000),
    });

    console.log(`\n🔍 Live OPTIONS test: ${url}`);
    console.log(`   Origin sent:  ${origin}`);
    console.log(`   Status:       ${res.status}`);
    console.log(`   Allowed Origin: ${res.headers.get('Access-Control-Allow-Origin') || '(none)'}`);
    console.log(`   Allowed Methods: ${res.headers.get('Access-Control-Allow-Methods') || '(none)'}`);
    console.log(`   Allowed Headers: ${res.headers.get('Access-Control-Allow-Headers') || '(none)'}`);

    const corsOrigin = res.headers.get('Access-Control-Allow-Origin');
    if (corsOrigin === origin || corsOrigin === '*') {
      console.log('   ✅ CORS origin matches!');
    } else if (corsOrigin) {
      console.log(`   ⚠️  CORS origin returned "${corsOrigin}" but we sent "${origin}"`);
    } else {
      console.log('   ❌ No Access-Control-Allow-Origin header returned');
    }
  } catch (err) {
    console.error(`\n❌ Live check failed: ${err.message}`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const liveFlag = args.includes('--live');
const origins = args.filter(a => a !== '--live');

if (origins.length > 0) {
  for (const origin of origins) {
    const result = resolveClient(origin);
    console.log(`\n🔍 Origin check: ${origin}`);
    if (result.clientKey) {
      console.log(`   ✅ Matched: ${result.clientKey} (${result.matchType})`);
    } else {
      console.log(`   ❌ No match found`);
    }
    console.log(`   Allowed origins across all clients:`);
    for (const [key, o] of Object.entries(CHAT_CLIENTS)) {
      for (const allowed of o) {
        console.log(`     - ${allowed} (${key})`);
      }
    }
  }
} else {
  console.log('📋 Allowed origins by client:');
  console.log('');
  for (const [key, o] of Object.entries(CHAT_CLIENTS)) {
    console.log(`  ${key}:`);
    for (const allowed of o) {
      console.log(`    - ${allowed}`);
    }
  }
  console.log(`\nTotal: ${Object.values(CHAT_CLIENTS).flat().length} origins across ${Object.keys(CHAT_CLIENTS).length} clients`);
}

if (liveFlag) {
  // If specific origins given, test those. Otherwise, test with the default origin.
  const testOrigins = origins.length > 0 ? origins : ['https://kadenaweb.solutions'];
  for (const origin of testOrigins) {
    await testLive(origin);
  }
}
