#!/usr/bin/env node
/**
 * Simulated PM "Governance Sync" flow (deterministic, no model calls).
 *
 * For each ticket in plan-review:
 * - Find the linked spec (expects a comment like "Confluence Spec: <url>")
 * - Read the spec status via docs.get
 * - Update labels:
 *   - APPROVED -> approved
 *   - CHANGES REQUESTED -> ready-for-plan
 *   - otherwise -> keep plan-review and comment
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
Simulated PM Governance Sync

Usage:
  node scripts/simulate/pm-sync.js [--execute] [--json]

Options:
  --execute   Perform label/comment mutations
  --json      Output JSON payload
  --help, -h  Show help
`);
}

function extractSpecIdFromComments(comments) {
  for (const c of comments || []) {
    const s = String(c);
    const idx = s.indexOf('Confluence Spec:');
    if (idx === -1) continue;
    const url = s.slice(idx + 'Confluence Spec:'.length).trim();
    // Fake backend uses https://fake.local/docs/<id>
    const m = /\/docs\/([^/\s]+)/.exec(url);
    if (m) return m[1];
  }
  return null;
}

function labelNames(mode) {
  if (mode === 'github') {
    return {
      planReview: 'plan-review',
      approved: 'approved',
      ready: 'ready-for-plan'
    };
  }
  return {
    planReview: 'ai-state:plan-review',
    approved: 'ai-state:approved',
    ready: 'ai-state:ready-for-plan'
  };
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

  const trackerBackendId = selectBackend('tracker', mode);
  const tracker = loadBackend('tracker', trackerBackendId);

  const docsBackendId = selectBackend('docs', mode);
  const docs = loadBackend('docs', docsBackendId);

  trace.push({ op: 'tracker.search', args: { labels: [labels.planReview] } });
  const searchRes = await tracker.tracker.search({ labels: [labels.planReview] });
  const items = searchRes.items || [];

  const decisions = [];

  for (const it of items) {
    trace.push({ op: 'tracker.get', args: { id: it.id } });
    const full = await tracker.tracker.get({ id: it.id });
    const item = full.item;

    const specId = extractSpecIdFromComments(item.comments || []);
    if (!specId) {
      decisions.push({ id: item.id, key: item.key, decision: 'no-spec', specStatus: null });
      if (args.execute) {
        trace.push({ op: 'tracker.comment', args: { id: item.id, body: 'No Confluence Spec link found; leaving in plan-review.' } });
        await tracker.tracker.comment({ id: item.id, body: 'No Confluence Spec link found; leaving in plan-review.' });
      }
      continue;
    }

    trace.push({ op: 'docs.get', args: { id: specId } });
    const page = await docs.docs.get({ id: specId });
    const status = String(page.page?.status || '').toUpperCase();

    if (status === 'APPROVED') {
      decisions.push({ id: item.id, key: item.key, decision: 'approved', specStatus: status });
      if (args.execute) {
        trace.push({ op: 'tracker.set_labels', args: { id: item.id, remove: [labels.planReview], add: [labels.approved] } });
        await tracker.tracker.set_labels({ id: item.id, remove: [labels.planReview], add: [labels.approved] });
        trace.push({ op: 'tracker.comment', args: { id: item.id, body: 'Governance Sync: Spec APPROVED -> marking approved.' } });
        await tracker.tracker.comment({ id: item.id, body: 'Governance Sync: Spec APPROVED -> marking approved.' });
      }
      continue;
    }

    if (status === 'CHANGES REQUESTED') {
      decisions.push({ id: item.id, key: item.key, decision: 'changes-requested', specStatus: status });
      if (args.execute) {
        trace.push({ op: 'tracker.set_labels', args: { id: item.id, remove: [labels.planReview], add: [labels.ready] } });
        await tracker.tracker.set_labels({ id: item.id, remove: [labels.planReview], add: [labels.ready] });
        trace.push({ op: 'tracker.comment', args: { id: item.id, body: 'Governance Sync: Spec CHANGES REQUESTED -> returning to ready-for-plan.' } });
        await tracker.tracker.comment({ id: item.id, body: 'Governance Sync: Spec CHANGES REQUESTED -> returning to ready-for-plan.' });
      }
      continue;
    }

    decisions.push({ id: item.id, key: item.key, decision: 'pending', specStatus: status || null });
    if (args.execute) {
      trace.push({ op: 'tracker.comment', args: { id: item.id, body: `Governance Sync: Spec status is "${status || 'UNKNOWN'}"; leaving in plan-review.` } });
      await tracker.tracker.comment({
        id: item.id,
        body: `Governance Sync: Spec status is "${status || 'UNKNOWN'}"; leaving in plan-review.`
      });
    }
  }

  const payload = {
    ok: true,
    mode,
    execute: args.execute,
    processed: items.length,
    decisions,
    trace,
    next: args.execute ? null : 'Run with --execute to apply label/comment changes'
  };

  const tracePath = writeTrace('pm-sync', payload);
  if (tracePath) payload.traceFile = tracePath;
  process.stdout.write(`${JSON.stringify(payload, null, args.json ? 2 : 0)}\n`);
}

main().catch((err) => {
  process.stderr.write(`Error: ${err && err.message ? err.message : String(err)}\n`);
  process.exit(1);
});
