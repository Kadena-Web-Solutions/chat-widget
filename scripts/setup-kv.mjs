#!/usr/bin/env node
/**
 * scripts/setup-kv.mjs
 * Creates KV namespaces for the chat-widget worker and outputs their IDs.
 * Run this once during initial setup to get IDs for wrangler.toml
 */

import { execSync } from 'child_process';

function createKV(name) {
  try {
    const result = execSync(`wrangler kv:namespace create "${name}" --json`, {
      encoding: 'utf-8'
    });
    const data = JSON.parse(result);
    console.log(`Created KV: ${name}`);
    console.log(`  ID: ${data.id}`);
    console.log(`  binding: ${data.binding}`);
    return data;
  } catch (e) {
    console.error(`Failed to create KV ${name}: ${e.message}`);
    process.exit(1);
  }
}

console.log('Creating KV namespaces for chat-widget...\n');

const namespaces = [
  'CHAT_SESSIONS',
  'CHAT_RATE_LIMIT',
  'CHAT_CONFIG',
  'CHAT_BUDGET'
];

const results = {};
for (const name of namespaces) {
  results[name] = createKV(name);
}

console.log('\n--- Update your wrangler.toml with these IDs ---\n');
for (const [name, data] of Object.entries(results)) {
  console.log(`[[kv_namespaces]]`);
  console.log(`binding = "${data.binding}"`);
  console.log(`id = "${data.id}"`);
  console.log('');
}
