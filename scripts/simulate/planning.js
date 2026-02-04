#!/usr/bin/env node
/**
 * Simulated Planning Agent flow (deterministic, no model calls).
 *
 * Purpose:
 * - Provide end-to-end-ish regression tests for integration wiring and state transitions
 *   without relying on non-deterministic LLM output or live Jira/docs.
 *
 * Behavior:
 * - In "draft" mode (default), it only discovers tickets and prints a trace.
 * - In "execute" mode (--execute), it performs the planned tool actions:
 *   - docs.create (DRAFT)
 *   - tracker.comment (spec link + plan JSON)
 *   - tracker.set-labels (ready-for-plan -> plan-review)
 *
 * Usage:
 *   node scripts/simulate/planning.js --json
 *   node scripts/simulate/planning.js --execute --json
 *
 * Notes:
 * - Use AGENCY_HOST_ROOT + AGENCY_INTEGRATION_BACKEND=fake for hermetic tests.
 */

const { loadResolvedConfig, loadBackend, selectBackend } = require('../agency/runtime');
const { validatePlan } = require('../schema/plan');
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
Simulated Planning Flow

Usage:
  node scripts/simulate/planning.js [--execute] [--json]

Options:
  --execute   Perform the mutations (create doc, comment, relabel)
  --json      Output JSON payload
  --help, -h  Show help
`);
}

function mkPlanArtifact(item) {
  // Minimal stable artifact shape. We’ll later formalize this as JSON Schema and
  // tighten validation in tests.
  return {
    version: '1.0',
    ticket: {
      id: item.id,
      key: item.key,
      title: item.title,
      url: item.url
    },
    acceptanceCriteria: [],
    filesToTouch: [],
    steps: []
  };
}

function addDefaultACs(plan, item) {
  // If the fixture includes ACs, teams can encode them however they like; for
  // deterministic tests, keep this simple and avoid heuristic parsing.
  plan.acceptanceCriteria.push(`Deliver "${item.title}"`);
}

function addDefaultSteps(plan) {
  plan.steps.push({ id: '1', description: 'Read existing code and identify touch points', acRefs: [] });
  plan.steps.push({ id: '2', description: 'Implement per spec and add tests', acRefs: [] });
  plan.steps.push({ id: '3', description: 'Run lint/tests and update tracker state', acRefs: [] });
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
  const backendId = selectBackend('tracker', mode, config);
  const backend = loadBackend('tracker', backendId);

  const labelReady = mode === 'github' ? 'ready-for-plan' : 'ai-state:ready-for-plan';
  trace.push({ op: 'tracker.search', args: { labels: [labelReady] } });
  const searchRes = await backend.tracker.search({ labels: [labelReady] });
  const items = searchRes.items || [];

  if (items.length === 0) {
    const payload = { ok: true, mode, execute: args.execute, message: 'No tickets found', trace, items: [] };
    const tracePath = writeTrace('planning', payload);
    if (tracePath) payload.traceFile = tracePath;
    process.stdout.write(`${JSON.stringify(payload, null, args.json ? 2 : 0)}\n`);
    return;
  }

  const selected = items[0];
  trace.push({ op: 'tracker.get', args: { id: selected.id } });
  const getRes = await backend.tracker.get({ id: selected.id });
  const item = getRes.item;

  const plan = mkPlanArtifact(item);
  addDefaultACs(plan, item);
  addDefaultSteps(plan);
  const validation = validatePlan(plan);
  if (!validation.ok) {
    throw new Error(`Generated plan failed validation: ${validation.errors.join('; ')}`);
  }

  if (!args.execute) {
    const payload = {
      ok: true,
      mode,
      execute: false,
      selected: { id: item.id, key: item.key, title: item.title },
      plan,
      trace,
      next: 'Run with --execute to perform docs/comment/label updates'
    };
    const tracePath = writeTrace('planning', payload);
    if (tracePath) payload.traceFile = tracePath;
    process.stdout.write(`${JSON.stringify(payload, null, args.json ? 2 : 0)}\n`);
    return;
  }

  const docsBackendId = selectBackend('docs', mode, config);
  const docsBackend = loadBackend('docs', docsBackendId);

  trace.push({ op: 'docs.create', args: { title: `Spec: ${item.key || item.id}`, status: 'DRAFT' } });
  const docRes = await docsBackend.docs.create({
    title: `Spec: ${item.key || item.id}`,
    body: `DRAFT spec for ${item.key || item.id}\n\n${item.title}`,
    status: 'DRAFT'
  });

  const specUrl = docRes.page?.url || '(no url)';
  const specId = docRes.page?.id || '(no id)';
  trace.push({ op: 'tracker.comment', args: { id: item.id, body: `Spec: ${specId} ${specUrl}` } });
  await backend.tracker.comment({ id: item.id, body: `Spec: ${specId} ${specUrl}` });

  trace.push({ op: 'tracker.comment', args: { id: item.id, body: '<plan json>' } });
  await backend.tracker.comment({ id: item.id, body: `Implementation Plan (JSON)\n\n${JSON.stringify(plan, null, 2)}` });

  // Relabel
  if (mode === 'github') {
    trace.push({ op: 'tracker.set_labels', args: { id: item.id, remove: ['ready-for-plan'], add: ['plan-review'] } });
    await backend.tracker.set_labels({ id: item.id, remove: ['ready-for-plan'], add: ['plan-review'] });
  } else {
    trace.push({ op: 'tracker.set_labels', args: { id: item.id, remove: ['ai-state:ready-for-plan'], add: ['ai-state:plan-review'] } });
    await backend.tracker.set_labels({
      id: item.id,
      remove: ['ai-state:ready-for-plan'],
      add: ['ai-state:plan-review']
    });
  }

  const payload = {
    ok: true,
    mode,
    execute: true,
    selected: { id: item.id, key: item.key, title: item.title },
    specUrl,
    plan,
    trace
  };
  const tracePath = writeTrace('planning', payload);
  if (tracePath) payload.traceFile = tracePath;
  process.stdout.write(`${JSON.stringify(payload, null, args.json ? 2 : 0)}\n`);
}

main().catch((err) => {
  process.stderr.write(`Error: ${err && err.message ? err.message : String(err)}\n`);
  process.exit(1);
});
