#!/usr/bin/env node
/**
 * Simulated QA verify flow (deterministic, no model calls).
 *
 * For the first ticket in in-qa:
 * - If --pass: in-qa -> verified
 * - If --fail: in-qa -> approved (back to dev)
 * - Comment result
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
Simulated QA Verify

Usage:
  node scripts/simulate/qa-verify.js [--execute] (--pass|--fail) [--json]

Options:
  --execute   Perform label/comment mutations
  --pass      Mark as PASS (in-qa -> verified)
  --fail      Mark as FAIL (in-qa -> approved)
  --json      Output JSON payload
  --help, -h  Show help
`);
}

function labelNames(mode) {
  if (mode === 'github') return { inQa: 'in-qa', verified: 'verified', approved: 'approved' };
  return { inQa: 'ai-state:in-qa', verified: 'ai-state:verified', approved: 'ai-state:approved' };
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

  trace.push({ op: 'tracker.search', args: { labels: [labels.inQa] } });
  const searchRes = await backend.tracker.search({ labels: [labels.inQa] });
  const items = searchRes.items || [];
  const selected = items[0] || null;

  if (!selected) {
    const payload = { ok: true, mode, execute: args.execute, message: 'No tickets found', trace };
    const tracePath = writeTrace('qa-verify', payload);
    if (tracePath) payload.traceFile = tracePath;
    process.stdout.write(`${JSON.stringify(payload, null, args.json ? 2 : 0)}\n`);
    return;
  }

  const outcome = args.pass ? 'PASS' : 'FAIL';

  if (!args.execute) {
    const payload = { ok: true, mode, execute: false, outcome, selected, trace, next: 'Run with --execute to relabel and comment' };
    const tracePath = writeTrace('qa-verify', payload);
    if (tracePath) payload.traceFile = tracePath;
    process.stdout.write(`${JSON.stringify(payload, null, args.json ? 2 : 0)}\n`);
    return;
  }

  trace.push({ op: 'tracker.comment', args: { id: selected.id, body: `QA COMPLETE: ${outcome}` } });
  await backend.tracker.comment({ id: selected.id, body: `QA COMPLETE: ${outcome}` });

  if (args.pass) {
    trace.push({ op: 'tracker.set_labels', args: { id: selected.id, remove: [labels.inQa], add: [labels.verified] } });
    await backend.tracker.set_labels({ id: selected.id, remove: [labels.inQa], add: [labels.verified] });
  } else {
    trace.push({ op: 'tracker.set_labels', args: { id: selected.id, remove: [labels.inQa], add: [labels.approved] } });
    await backend.tracker.set_labels({ id: selected.id, remove: [labels.inQa], add: [labels.approved] });
    trace.push({ op: 'tracker.transition', args: { id: selected.id, status: 'In Progress' } });
    await backend.tracker.transition({ id: selected.id, status: 'In Progress' });
  }

  const payload = { ok: true, mode, execute: true, outcome, selected, trace };
  const tracePath = writeTrace('qa-verify', payload);
  if (tracePath) payload.traceFile = tracePath;
  process.stdout.write(`${JSON.stringify(payload, null, args.json ? 2 : 0)}\n`);
}

main().catch((err) => {
  process.stderr.write(`Error: ${err && err.message ? err.message : String(err)}\n`);
  process.exit(1);
});
