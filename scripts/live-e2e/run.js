#!/usr/bin/env node
/**
 * Optional live end-to-end harness (manual/nightly).
 *
 * This intentionally does NOT run in CI by default. It requires real auth and
 * should point at a dedicated sandbox project/space/repo.
 *
 * Controls:
 * - AGENCY_LIVE_E2E=1                      required to run
 * - AGENCY_LIVE_E2E_WRITE=1                allow write operations (comment/docs create)
 * - AGENCY_LIVE_E2E_LABEL=<label>          label to search for (default depends on mode)
 * - AGENCY_LIVE_E2E_LIMIT=<n>              search limit (default 1)
 *
 * Usage:
 *   AGENCY_LIVE_E2E=1 node scripts/live-e2e/run.js
 */

const path = require('path');
const cp = require('child_process');

function envFlag(name) {
  const v = process.env[name];
  if (!v) return false;
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes';
}

function die(msg) {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(1);
}

function repoRoot() {
  return path.resolve(__dirname, '..', '..');
}

function hostRoot() {
  return process.env.AGENCY_HOST_ROOT || process.cwd();
}

function runAgency(args) {
  const script = path.join(repoRoot(), 'scripts', 'agency.js');
  const res = cp.spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot(),
    env: { ...process.env, AGENCY_HOST_ROOT: hostRoot() },
    encoding: 'utf8'
  });
  if (res.status !== 0) {
    throw new Error(`agency failed:\n${res.stdout}\n${res.stderr}`);
  }
  return JSON.parse(res.stdout);
}

function loadResolvedConfig() {
  const configScript = path.join(repoRoot(), 'scripts', 'config.js');
  const res = cp.spawnSync(process.execPath, [configScript], {
    cwd: repoRoot(),
    env: { ...process.env, AGENCY_HOST_ROOT: hostRoot() },
    encoding: 'utf8'
  });
  if (res.status !== 0) {
    throw new Error(`config failed:\n${res.stdout}\n${res.stderr}`);
  }
  return JSON.parse(res.stdout);
}

function main() {
  if (!envFlag('AGENCY_LIVE_E2E')) {
    die('Refusing to run: set AGENCY_LIVE_E2E=1');
  }

  const cfg = loadResolvedConfig();
  const mode = cfg?.tracker?.mode || 'standalone';
  const writeAllowed = envFlag('AGENCY_LIVE_E2E_WRITE');
  const limit = Number(process.env.AGENCY_LIVE_E2E_LIMIT || 1);

  if (mode === 'standalone') {
    die('Live E2E is not meaningful for standalone mode.');
  }

  const defaultLabel = mode === 'github' ? 'ready-for-plan' : 'ai-state:ready-for-plan';
  const label = process.env.AGENCY_LIVE_E2E_LABEL || defaultLabel;

  const search = runAgency(['tracker', 'search', '--label', label, '--json']);
  const items = search.items || [];
  process.stdout.write(`Live E2E: mode=${mode} label=${label} found=${items.length}\n`);
  if (items.length === 0) {
    die('No items found; create a canary issue/ticket with the configured label.');
  }

  const item = items[0];
  process.stdout.write(`Using item: id=${item.id} key=${item.key || '(none)'} title=${item.title}\n`);

  if (!writeAllowed) {
    process.stdout.write('Write operations disabled (set AGENCY_LIVE_E2E_WRITE=1 to comment/create docs).\n');
    return;
  }

  // Comment on the item (non-destructive, but still a write).
  runAgency(['tracker', 'comment', '--id', String(item.id), '--body', `Agency Live E2E check (${new Date().toISOString()})`, '--json']);
  process.stdout.write('Posted canary comment.\n');

  // For Atlassian + Confluence docs provider, also create a draft Confluence page.
  if (mode === 'atlassian') {
    const doc = runAgency(['docs', 'create', '--title', `Agency Live E2E (${new Date().toISOString()})`, '--body', 'Canary page', '--status', 'DRAFT', '--json']);
    process.stdout.write(`Created Confluence page id=${doc.page?.id || '(none)'}\n`);
  }
}

try {
  main();
} catch (err) {
  die(err && err.message ? err.message : String(err));
}
