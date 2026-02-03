#!/usr/bin/env node
/**
 * Simulated SCM PR flow (deterministic, no model calls).
 *
 * For the first "approved" ticket, when SCM is enabled:
 * - Create a PR
 * - Link the ticket
 * - Comment back on the ticket with the PR URL
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
Simulated SCM PR Flow

Usage:
  node scripts/simulate/scm-pr.js [--execute] [--json]

Options:
  --execute   Perform PR creation/linking + ticket comment
  --json      Output JSON payload
  --help, -h  Show help
`);
}

function labelNames(mode) {
  if (mode === 'github') {
    return { approved: 'approved' };
  }
  return { approved: 'ai-state:approved' };
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

  const scmProvider = config?.scm?.provider || 'none';
  if (scmProvider === 'none') {
    const payload = { ok: true, mode, execute: args.execute, message: 'SCM disabled (scm.provider=none)', trace };
    const tracePath = writeTrace('scm-pr', payload);
    if (tracePath) payload.traceFile = tracePath;
    process.stdout.write(`${JSON.stringify(payload, null, args.json ? 2 : 0)}\n`);
    return;
  }

  const trackerBackendId = selectBackend('tracker', mode, config);
  const trackerBackend = loadBackend('tracker', trackerBackendId);

  const scmBackendId = selectBackend('scm', mode, config);
  const scmBackend = loadBackend('scm', scmBackendId);
  if (!scmBackend.scm) {
    throw new Error(`SCM backend "${scmBackendId}" does not provide scm.* tools`);
  }

  trace.push({ op: 'tracker.search', args: { labels: [labels.approved] } });
  const searchRes = await trackerBackend.tracker.search({ labels: [labels.approved] });
  const items = searchRes.items || [];
  const selected = items[0] || null;

  if (!selected) {
    const payload = { ok: true, mode, execute: args.execute, message: 'No tickets found', trace };
    const tracePath = writeTrace('scm-pr', payload);
    if (tracePath) payload.traceFile = tracePath;
    process.stdout.write(`${JSON.stringify(payload, null, args.json ? 2 : 0)}\n`);
    return;
  }

  if (!args.execute) {
    const payload = { ok: true, mode, execute: false, selected, trace, next: 'Run with --execute to create/link a PR' };
    const tracePath = writeTrace('scm-pr', payload);
    if (tracePath) payload.traceFile = tracePath;
    process.stdout.write(`${JSON.stringify(payload, null, args.json ? 2 : 0)}\n`);
    return;
  }

  const ticketKey = selected.key || selected.id;
  const prTitle = ticketKey ? `${ticketKey}: Implementation` : 'Implementation';

  trace.push({ op: 'scm.pr_create', args: { title: prTitle, body: 'Auto-created by Agency.' } });
  const prRes = await scmBackend.scm.pr_create({ title: prTitle, body: 'Auto-created by Agency.' });
  const prUrl = prRes?.pr?.url || null;

  trace.push({ op: 'scm.pr_link_ticket', args: { number: prRes?.pr?.number, ticket: String(ticketKey) } });
  await scmBackend.scm.pr_link_ticket({ number: prRes?.pr?.number, ticket: String(ticketKey) });

  trace.push({ op: 'tracker.comment', args: { id: selected.id, body: `PR: ${prUrl || '(unknown)'}` } });
  await trackerBackend.tracker.comment({ id: selected.id, body: `PR: ${prUrl || '(unknown)'}` });

  const payload = { ok: true, mode, execute: true, selected, trace };
  const tracePath = writeTrace('scm-pr', payload);
  if (tracePath) payload.traceFile = tracePath;
  process.stdout.write(`${JSON.stringify(payload, null, args.json ? 2 : 0)}\n`);
}

main().catch((err) => {
  process.stderr.write(`Error: ${err && err.message ? err.message : String(err)}\n`);
  process.exit(1);
});

