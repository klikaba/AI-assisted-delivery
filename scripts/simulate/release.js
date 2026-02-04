#!/usr/bin/env node
/**
 * Simulated PM Release flow (deterministic, no model calls).
 *
 * Requires: verified + reviewed + security-pass labels.
 * Actions:
 * - Create release notes doc (docs.create)
 * - Transition to Done (best-effort)
 * - Remove all ai-state labels (or github equivalents)
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
Simulated Release

Usage:
  node scripts/simulate/release.js [--execute] [--json]

Options:
  --execute   Perform label/comment/doc mutations
  --json      Output JSON payload
  --help, -h  Show help
`);
}

function labelNames(mode) {
  if (mode === 'github') {
    return {
      verified: 'verified',
      reviewed: 'reviewed',
      securityPass: 'security-pass',
      approved: 'approved'
    };
  }
  return {
    verified: 'ai-state:verified',
    reviewed: 'ai-state:reviewed',
    securityPass: 'ai-state:security-pass',
    approved: 'ai-state:approved'
  };
}

function aiStateLabels(mode) {
  if (mode === 'github') {
    return ['ready-for-plan', 'plan-review', 'approved', 'in-qa', 'verified', 'reviewed', 'review-fail', 'security-pass', 'security-fail'];
  }
  return [
    'ai-state:ready-for-plan',
    'ai-state:plan-review',
    'ai-state:approved',
    'ai-state:in-qa',
    'ai-state:verified',
    'ai-state:reviewed',
    'ai-state:review-fail',
    'ai-state:security-pass',
    'ai-state:security-fail'
  ];
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

  const trackerId = selectBackend('tracker', mode, config);
  const tracker = loadBackend('tracker', trackerId);
  const docsId = selectBackend('docs', mode, config);
  const docs = loadBackend('docs', docsId);

  trace.push({ op: 'tracker.search', args: { labels: [labels.verified, labels.reviewed, labels.securityPass] } });
  const searchRes = await tracker.tracker.search({ labels: [labels.verified, labels.reviewed, labels.securityPass] });
  const items = searchRes.items || [];
  const selected = items[0] || null;

  if (!selected) {
    const payload = { ok: true, mode, execute: args.execute, message: 'No releasable tickets found', trace };
    const tracePath = writeTrace('release', payload);
    if (tracePath) payload.traceFile = tracePath;
    process.stdout.write(`${JSON.stringify(payload, null, args.json ? 2 : 0)}\n`);
    return;
  }

  if (!args.execute) {
    const payload = { ok: true, mode, execute: false, selected, trace, next: 'Run with --execute to create release notes and close' };
    const tracePath = writeTrace('release', payload);
    if (tracePath) payload.traceFile = tracePath;
    process.stdout.write(`${JSON.stringify(payload, null, args.json ? 2 : 0)}\n`);
    return;
  }

  trace.push({ op: 'docs.create', args: { title: `Release Notes: ${selected.key || selected.id}`, status: 'DRAFT' } });
  await docs.docs.create({
    title: `Release Notes: ${selected.key || selected.id}`,
    body: `Release Notes for ${selected.key || selected.id}\n\n${selected.title}`,
    status: 'DRAFT'
  });

  trace.push({ op: 'tracker.transition', args: { id: selected.id, status: 'Done' } });
  await tracker.tracker.transition({ id: selected.id, status: 'Done' });

  trace.push({ op: 'tracker.set_labels', args: { id: selected.id, remove: aiStateLabels(mode), add: [] } });
  await tracker.tracker.set_labels({ id: selected.id, remove: aiStateLabels(mode), add: [] });

  const payload = { ok: true, mode, execute: true, selected, trace };
  const tracePath = writeTrace('release', payload);
  if (tracePath) payload.traceFile = tracePath;
  process.stdout.write(`${JSON.stringify(payload, null, args.json ? 2 : 0)}\n`);
}

main().catch((err) => {
  process.stderr.write(`Error: ${err && err.message ? err.message : String(err)}\n`);
  process.exit(1);
});
