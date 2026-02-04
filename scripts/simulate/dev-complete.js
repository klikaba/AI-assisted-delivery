#!/usr/bin/env node
/**
 * Simulated Developer "complete implementation" flow (deterministic, no model calls).
 *
 * For the first ticket in approved:
 * - Comment "Implementation complete..."
 * - Relabel approved -> in-qa
 * - Optionally transition status (best-effort)
 */

const { loadResolvedConfig, loadBackend, selectBackend } = require('../agency/runtime');
const { writeTrace } = require('./trace');

function parseArgs(argv) {
  return {
    execute: argv.includes('--execute'),
    json: argv.includes('--json'),
    help: argv.includes('--help') || argv.includes('-h')
  };
}

function usage() {
  console.log(`
Simulated Dev Complete

Usage:
  node scripts/simulate/dev-complete.js [--execute] [--json]

Options:
  --execute   Perform label/comment mutations
  --json      Output JSON payload
  --help, -h  Show help
`);
}

function labelNames(mode) {
  if (mode === 'github') {
    return { approved: 'approved', inQa: 'in-qa' };
  }
  return { approved: 'ai-state:approved', inQa: 'ai-state:in-qa' };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const trace = [];
  const { config } = loadResolvedConfig();
  const mode = config?.tracker?.mode || 'standalone';
  const labels = labelNames(mode);

  const backendId = selectBackend('tracker', mode, config);
  const backend = loadBackend('tracker', backendId);

  trace.push({ op: 'tracker.search', args: { labels: [labels.approved] } });
  const searchRes = await backend.tracker.search({ labels: [labels.approved] });
  const items = searchRes.items || [];
  const selected = items[0] || null;

  if (!selected) {
    const payload = { ok: true, mode, execute: args.execute, message: 'No tickets found', trace };
    const tracePath = writeTrace('dev-complete', payload);
    if (tracePath) payload.traceFile = tracePath;
    process.stdout.write(`${JSON.stringify(payload, null, args.json ? 2 : 0)}\n`);
    return;
  }

  if (!args.execute) {
    const payload = { ok: true, mode, execute: false, selected, trace, next: 'Run with --execute to relabel and comment' };
    const tracePath = writeTrace('dev-complete', payload);
    if (tracePath) payload.traceFile = tracePath;
    process.stdout.write(`${JSON.stringify(payload, null, args.json ? 2 : 0)}\n`);
    return;
  }

  trace.push({ op: 'tracker.comment', args: { id: selected.id, body: 'Implementation complete. Linting passed. Ready for QA.' } });
  await backend.tracker.comment({ id: selected.id, body: 'Implementation complete. Linting passed. Ready for QA.' });

  trace.push({ op: 'tracker.set_labels', args: { id: selected.id, remove: [labels.approved], add: [labels.inQa] } });
  await backend.tracker.set_labels({ id: selected.id, remove: [labels.approved], add: [labels.inQa] });

  trace.push({ op: 'tracker.transition', args: { id: selected.id, status: mode === 'github' ? 'In QA' : 'In QA' } });
  await backend.tracker.transition({ id: selected.id, status: 'In QA' });

  const payload = { ok: true, mode, execute: true, selected, trace };
  const tracePath = writeTrace('dev-complete', payload);
  if (tracePath) payload.traceFile = tracePath;
  process.stdout.write(`${JSON.stringify(payload, null, args.json ? 2 : 0)}\n`);
}

main().catch((err) => {
  process.stderr.write(`Error: ${err && err.message ? err.message : String(err)}\n`);
  process.exit(1);
});
