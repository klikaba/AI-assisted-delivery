#!/usr/bin/env node
/**
 * Simulated Security Audit flow (deterministic, no model calls).
 *
 * For the first ticket in verified:
 * - If --pass: add security-pass, remove security-fail if present
 * - If --fail: add security-fail, remove verified, add approved (back to dev)
 * - Post audit comment
 */

const { loadResolvedConfig, loadBackend, selectBackend } = require('../agency/runtime');
const { writeTrace } = require('./trace');

function parseArgs(argv) {
  return {
    execute: argv.includes('--execute'),
    pass: argv.includes('--pass'),
    fail: argv.includes('--fail'),
    json: argv.includes('--json'),
    help: argv.includes('--help') || argv.includes('-h')
  };
}

function usage() {
  console.log(`
Simulated Security Audit

Usage:
  node scripts/simulate/security-audit.js [--execute] (--pass|--fail) [--json]

Options:
  --execute   Perform label/comment mutations
  --pass      Mark as PASS (verified -> security-pass)
  --fail      Mark as FAIL (verified -> approved + security-fail)
  --json      Output JSON payload
  --help, -h  Show help
`);
}

function labelNames(mode) {
  if (mode === 'github') {
    return {
      verified: 'verified',
      securityPass: 'security-pass',
      securityFail: 'security-fail',
      approved: 'approved'
    };
  }
  return {
    verified: 'ai-state:verified',
    securityPass: 'ai-state:security-pass',
    securityFail: 'ai-state:security-fail',
    approved: 'ai-state:approved'
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  if (args.pass === args.fail) {
    throw new Error('Specify exactly one of --pass or --fail');
  }

  const trace = [];
  const { config } = loadResolvedConfig();
  const mode = config?.tracker?.mode || 'standalone';
  const labels = labelNames(mode);

  const backendId = selectBackend('tracker', mode, config);
  const backend = loadBackend('tracker', backendId);

  trace.push({ op: 'tracker.search', args: { labels: [labels.verified] } });
  const searchRes = await backend.tracker.search({ labels: [labels.verified] });
  const items = searchRes.items || [];
  const selected = items[0] || null;

  if (!selected) {
    const payload = { ok: true, mode, execute: args.execute, message: 'No tickets found', trace };
    const tracePath = writeTrace('security-audit', payload);
    if (tracePath) payload.traceFile = tracePath;
    process.stdout.write(`${JSON.stringify(payload, null, args.json ? 2 : 0)}\n`);
    return;
  }

  const outcome = args.pass ? 'PASS' : 'FAIL';

  if (!args.execute) {
    const payload = { ok: true, mode, execute: false, outcome, selected, trace, next: 'Run with --execute to relabel and comment' };
    const tracePath = writeTrace('security-audit', payload);
    if (tracePath) payload.traceFile = tracePath;
    process.stdout.write(`${JSON.stringify(payload, null, args.json ? 2 : 0)}\n`);
    return;
  }

  trace.push({ op: 'tracker.comment', args: { id: selected.id, body: `Security Audit: ${outcome}` } });
  await backend.tracker.comment({ id: selected.id, body: `Security Audit: ${outcome}` });

  if (args.pass) {
    trace.push({ op: 'tracker.set_labels', args: { id: selected.id, remove: [labels.securityFail], add: [labels.securityPass] } });
    await backend.tracker.set_labels({ id: selected.id, remove: [labels.securityFail], add: [labels.securityPass] });
  } else {
    trace.push({
      op: 'tracker.set_labels',
      args: { id: selected.id, remove: [labels.verified, labels.securityPass], add: [labels.securityFail, labels.approved] }
    });
    await backend.tracker.set_labels({
      id: selected.id,
      remove: [labels.verified, labels.securityPass],
      add: [labels.securityFail, labels.approved]
    });
  }

  const payload = { ok: true, mode, execute: true, outcome, selected, trace };
  const tracePath = writeTrace('security-audit', payload);
  if (tracePath) payload.traceFile = tracePath;
  process.stdout.write(`${JSON.stringify(payload, null, args.json ? 2 : 0)}\n`);
}

main().catch((err) => {
  process.stderr.write(`Error: ${err && err.message ? err.message : String(err)}\n`);
  process.exit(1);
});
