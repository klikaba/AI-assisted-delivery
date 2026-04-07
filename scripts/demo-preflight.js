#!/usr/bin/env node

const cp = require('child_process');
const path = require('path');
require('./load-env').loadEnvFiles();

function run(cmd, args, options = {}) {
  return cp.spawnSync(cmd, args, { encoding: 'utf8', ...options });
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) fail(`Missing required environment variable: ${name}`);
  return value;
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const checks = [];

  requireEnv('ATLASSIAN_SITE');
  requireEnv('ATLASSIAN_EMAIL');
  requireEnv('ATLASSIAN_API_TOKEN');
  requireEnv('CONFLUENCE_SPACE_KEY');

  const resolved = run(process.execPath, [path.join(repoRoot, 'scripts', 'config.js'), '--pretty'], {
    cwd: repoRoot,
    env: process.env
  });
  if (resolved.status !== 0) {
    fail(`Resolved config failed:\n${resolved.stdout}${resolved.stderr}`);
  }

  let config;
  try {
    config = JSON.parse(resolved.stdout);
  } catch (err) {
    fail(`Resolved config is not valid JSON: ${err.message}`);
  }

  checks.push(`tracker.mode=${config?.tracker?.mode || '(missing)'}`);
  checks.push(`docs.provider=${config?.docs?.provider || '(missing)'}`);
  checks.push(`scm.provider=${config?.scm?.provider || '(missing)'}`);

  if (config?.tracker?.mode !== 'atlassian') fail('Expected tracker.mode=atlassian for demo');
  if (config?.docs?.provider !== 'atlassian') fail('Expected docs.provider=atlassian for demo');

  const doctor = run(process.execPath, [path.join(repoRoot, 'scripts', 'doctor-live.js')], {
    cwd: repoRoot,
    env: process.env
  });
  if (doctor.status !== 0) {
    fail(`Live auth checks failed:\n${doctor.stdout}${doctor.stderr}`);
  }
  checks.push('doctor-live=ok');

  const search = run(process.execPath, [
    path.join(repoRoot, 'scripts', 'agency.js'),
    'tracker',
    'search',
    '--label',
    'ai-state:ready-for-plan',
    '--limit',
    '3',
    '--json'
  ], {
    cwd: repoRoot,
    env: process.env
  });
  if (search.status !== 0) {
    fail(`Agency tracker search failed:\n${search.stdout}${search.stderr}`);
  }

  let payload;
  try {
    payload = JSON.parse(search.stdout);
  } catch (err) {
    fail(`Agency tracker search returned invalid JSON: ${err.message}`);
  }
  const items = Array.isArray(payload?.items) ? payload.items : [];
  checks.push(`ready_for_plan_count=${items.length}`);

  const output = [
    'Demo preflight: OK',
    ...checks.map((line) => `- ${line}`)
  ].join('\n');

  process.stdout.write(`${output}\n`);
}

main();
