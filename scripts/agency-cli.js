#!/usr/bin/env node
/**
 * Team-friendly CLI entrypoint for .agency.
 *
 * Commands:
 * - init: create baseline host config + gitignore + generate opencode.jsonc
 * - generate: generate opencode.jsonc
 * - doctor: run sanity checks
 * - test: run conformance test suite, optionally for a profile
 * - labels: print required workflow labels
 * - next: show "what's next" queue (live)
 * - spec: approve/check specs (docs provider)
 * - open: show a ticket summary (live)
 *
 * Notes:
 * - Uses AGENCY_HOST_ROOT to avoid mutating the .agency repo during tests.
 * - Designed to work when this repo is installed as a submodule at `.agency/`.
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
require('./load-env').loadEnvFiles();
const {
  parseSpecRefFromComments,
  parsePrRefFromComments,
  parseGitHubPrNumberFromUrl,
  workflowLabel
} = require('./agency/workflow');

function repoRoot() {
  return path.resolve(__dirname, '..');
}

function hostRoot() {
  // Prefer explicit override (used by tests and power users).
  if (process.env.AGENCY_HOST_ROOT) return path.resolve(process.env.AGENCY_HOST_ROOT);

  // Default to current working directory.
  return process.cwd();
}

function runNode(scriptRel, args, extraEnv = {}) {
  const script = path.join(repoRoot(), scriptRel);
  const res = cp.spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot(),
    env: { ...process.env, AGENCY_HOST_ROOT: hostRoot(), ...extraEnv },
    encoding: 'utf8'
  });
  return res;
}

function die(msg) {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
    if (value !== true) i += 1;
    out.flags[key] = value;
  }
  return out;
}

function ensureGitignoreHasBlock(filePath, header, lines) {
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  if (existing.includes(header)) return;

  const block = `\n${header}\n${lines.join('\n')}\n`;
  fs.writeFileSync(filePath, existing + block);
}

function initHost({ mode, force, docsProvider }) {
  const root = hostRoot();
  if (root === repoRoot() && !process.env.AGENCY_ALLOW_INIT_IN_AGENCY_REPO) {
    die(
      [
        'Refusing to run `agency init` against the .agency repository itself.',
        'Run this command from your HOST repo root, or set AGENCY_HOST_ROOT to your host repo path.',
        'If you really intend to initialize the .agency repo as a host repo (not recommended), set AGENCY_ALLOW_INIT_IN_AGENCY_REPO=1.'
      ].join('\n')
    );
  }
  const projectConfigPath = path.join(root, '.agency-project.json');
  const rulesPath = path.join(root, '.agency-rules.md');
  const gitignorePath = path.join(root, '.gitignore');

  if (fs.existsSync(projectConfigPath) && !force) {
    die(`${projectConfigPath} already exists. Re-run with --force to overwrite.`);
  }

  const tracker = { mode };
  if (mode === 'atlassian') {
    tracker.atlassian = { backend: 'api' };
  }

  const scm = { provider: mode === 'standalone' ? 'none' : 'github' };

  const docs = {};
  if (docsProvider) {
    docs.provider = docsProvider;
  }

  fs.writeFileSync(
    projectConfigPath,
    JSON.stringify({ version: '1.0', tracker, scm, ...(Object.keys(docs).length > 0 ? { docs } : {}) }, null, 2) + '\n'
  );

  if (!fs.existsSync(rulesPath) || force) {
    const template =
      '# Agency Rules (Repository)\n\n' +
      'This file is repository-level rules for the AI workforce.\n' +
      'It is intended to be committed to git.\n\n' +
      '## Stack\n' +
      '- Primary Language: (fill in)\n' +
      '- Testing Framework: (fill in)\n' +
      '- Code Style: (fill in)\n';
    fs.writeFileSync(rulesPath, template);
  }

  ensureGitignoreHasBlock(gitignorePath, '# Agency Local State (ai-workforce)', [
    '.agency-memory.json',
    '.agency-traces/',
    '.agency-fixtures/'
  ]);
  ensureGitignoreHasBlock(gitignorePath, '# OpenCode Local State (ai-workforce)', [
    '.opencode/',
    'opencode.jsonc'
  ]);

  const gen = runNode('scripts/config.js', ['--generate']);
  if (gen.status !== 0) {
    die(`Failed to generate opencode.jsonc:\n${gen.stdout}${gen.stderr}`);
  }

  process.stdout.write(`Initialized host repo: ${root}\n`);
  process.stdout.write(`- Wrote ${projectConfigPath}\n`);
  process.stdout.write(`- Ensured ${gitignorePath} has local-state ignores\n`);
  process.stdout.write(`- Generated ${path.join(root, 'opencode.jsonc')}\n`);
  if (docsProvider) {
    process.stdout.write(`- Set docs.provider=${docsProvider}\n`);
  }
  if (mode === 'atlassian') {
    process.stdout.write('Next: set ATLASSIAN_SITE/ATLASSIAN_EMAIL/ATLASSIAN_API_TOKEN (see .env.example)\n');
    process.stdout.write('      If you set docs.provider=atlassian, also set CONFLUENCE_SPACE_KEY/CONFLUENCE_BASE_URL.\n');
  }
  if (mode === 'github') {
    process.stdout.write('Next: install/authenticate gh (gh auth login)\n');
  }
}

function usage() {
  process.stdout.write(`
agency

Usage:
  agency init [--mode atlassian|github|linear|standalone] [--docs atlassian|repo|none] [--force]
  agency generate [--preset <name> | --presets]
  agency presets
  agency doctor
  agency test [--profile <dir>]
  agency labels [--mode atlassian|github|linear|standalone]
  agency next [--label <label[,label...]>] [--limit <n>]
  agency open --id <ticketIdOrKey>
  agency spec approve --id <specId>

Notes:
  - Uses AGENCY_HOST_ROOT to decide which host repo is being configured.
  - For simulated E2E/conformance tests, pass --profile which must contain .agency-project.json.
`);
}

function parseCsvList(v) {
  if (!v) return [];
  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function firstLine(s) {
  const str = String(s || '').replace(/\r\n/g, '\n');
  const line = str.split('\n')[0] || '';
  return line.length > 120 ? `${line.slice(0, 117)}...` : line;
}

function runAgencyJson(args) {
  const res = runNode('scripts/agency.js', [...args, '--json']);
  if (res.status !== 0) {
    die(`agency integration failed:\n${res.stdout}${res.stderr}`);
  }
  try {
    return JSON.parse(res.stdout);
  } catch (err) {
    die(`Failed to parse agency integration JSON:\n${err && err.message ? err.message : String(err)}\n${res.stdout}`);
  }
}

function loadResolvedConfigBestEffort() {
  try {
    const res = runNode('scripts/config.js', []);
    if (res.status !== 0) return null;
    return JSON.parse(res.stdout);
  } catch {
    return null;
  }
}

function getWorkflowLabel(config, key, fallback) {
  return workflowLabel(config, key, fallback);
}

function printTicketSummary({ ticket, spec, pr }) {
  const key = ticket.key || ticket.id;
  process.stdout.write(`${key}: ${firstLine(ticket.title || '')}\n`);
  if (ticket.url) process.stdout.write(`URL: ${ticket.url}\n`);
  if (Array.isArray(ticket.labels) && ticket.labels.length > 0) {
    process.stdout.write(`Labels: ${ticket.labels.join(', ')}\n`);
  }
  if (spec) {
    const specLine = spec.id
      ? `Spec: ${spec.status || 'UNKNOWN'} (${spec.id}${spec.url ? ` ${spec.url}` : ''})`
      : `Spec: ${spec.status || 'UNKNOWN'} (${spec.url || 'linked'})`;
    process.stdout.write(`${specLine}\n`);
  } else {
    process.stdout.write('Spec: missing\n');
  }
  if (pr) {
    const prLine = pr.number
      ? `PR: ${pr.state || 'UNKNOWN'} (#${pr.number}${pr.url ? ` ${pr.url}` : ''})`
      : `PR: linked (${pr.url || 'unknown'})`;
    process.stdout.write(`${prLine}\n`);
  } else {
    process.stdout.write('PR: missing\n');
  }
}

function requiredAiStateLabels() {
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

function printLabels({ mode }) {
  const config = loadResolvedConfigBestEffort();
  const labels = config?.workflow?.labels;

  const resolved = labels && typeof labels === 'object'
    ? [
      labels.ready_for_plan,
      labels.plan_review,
      labels.approved,
      labels.in_qa,
      labels.verified,
      labels.reviewed,
      labels.review_fail,
      labels.security_pass,
      labels.security_fail
    ].filter(Boolean).map(String)
    : requiredAiStateLabels();

  process.stdout.write('Required workflow labels (portable state machine):\n');
  for (const l of resolved) process.stdout.write(`- ${l}\n`);

  if (mode === 'linear') {
    process.stdout.write('\nLinear note:\n');
    process.stdout.write('- These labels must exist in the Linear workspace before flows can apply them.\n');
    process.stdout.write('- Create them in Linear: Workspace Settings → Labels.\n');
  } else if (mode === 'atlassian') {
    process.stdout.write('\nJira note:\n');
    process.stdout.write('- Jira labels are free-form; they do not need to be pre-created.\n');
  } else if (mode === 'github') {
    process.stdout.write('\nGitHub note:\n');
    process.stdout.write('- Labels must exist in the repository before they can be applied.\n');
    process.stdout.write('- Create them in GitHub: Issues → Labels.\n');
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    usage();
    return;
  }

  if (cmd === 'init') {
    const mode = String(args.flags.mode || 'atlassian');
    if (!['atlassian', 'github', 'linear', 'standalone'].includes(mode)) {
      die('--mode must be one of: atlassian, github, linear, standalone');
    }
    const docsProvider = args.flags.docs ? String(args.flags.docs) : null;
    if (docsProvider && !['atlassian', 'repo', 'none'].includes(docsProvider)) {
      die('--docs must be one of: atlassian, repo, none');
    }
    initHost({ mode, force: Boolean(args.flags.force), docsProvider });
    return;
  }

  if (cmd === 'generate') {
    const preset = args.flags.preset ? String(args.flags.preset) : null;
    const presets = Boolean(args.flags.presets);
    if (preset && presets) {
      die('Use either --preset <name> or --presets (not both)');
    }
    const res = runNode('scripts/config.js', [
      '--generate',
      ...(presets ? ['--presets'] : []),
      ...(preset ? ['--preset', preset] : [])
    ]);
    process.stdout.write(res.stdout);
    process.stderr.write(res.stderr);
    process.exit(res.status || 0);
  }

  if (cmd === 'presets') {
    const res = runNode('scripts/config.js', ['--list-presets']);
    process.stdout.write('OpenCode presets:\n');
    for (const line of String(res.stdout || '').trim().split('\n')) {
      if (!line.trim()) continue;
      process.stdout.write(`- ${line.trim()}\n`);
    }
    process.stdout.write('\nExamples:\n');
    process.stdout.write('- Generate all: agency generate --presets\n');
    process.stdout.write('- Planning only: opencode --config opencode.planning.jsonc\n');
    process.stdout.write('- Dev only: opencode --config opencode.dev.jsonc\n');
    process.exit(res.status || 0);
  }

  if (cmd === 'doctor') {
    const res = runNode('scripts/doctor.js', []);
    process.stdout.write(res.stdout);
    process.stderr.write(res.stderr);
    process.exit(res.status || 0);
  }

  if (cmd === 'test') {
    const profile = args.flags.profile ? String(args.flags.profile) : null;
    if (!profile) {
      // Full internal suite (including trace snapshots) for this repo.
      const res = cp.spawnSync('npm', ['test'], { cwd: repoRoot(), encoding: 'utf8' });
      process.stdout.write(res.stdout);
      process.stderr.write(res.stderr);
      process.exit(res.status || 0);
    }

    const res = runNode('scripts/profile-conformance.js', ['--profile', profile]);
    process.stdout.write(res.stdout);
    process.stderr.write(res.stderr);
    process.exit(res.status || 0);
  }

  if (cmd === 'labels') {
    const mode = args.flags.mode ? String(args.flags.mode) : null;
    if (mode && !['atlassian', 'github', 'linear', 'standalone'].includes(mode)) {
      die('--mode must be one of: atlassian, github, linear, standalone');
    }
    printLabels({ mode });
    return;
  }

  if (cmd === 'next') {
    const config = loadResolvedConfigBestEffort();
    const defaultLabel = getWorkflowLabel(config, 'ready_for_plan', 'ai-state:ready-for-plan');
    const labels = parseCsvList(args.flags.label || defaultLabel);
    const limit = Number(args.flags.limit || 10);
    if (!Number.isFinite(limit) || limit <= 0) die('--limit must be a positive number');

    const search = runAgencyJson(['tracker', 'search', ...labels.flatMap((l) => ['--label', l]), '--limit', String(limit)]);
    const items = Array.isArray(search.items) ? search.items : [];

    if (items.length === 0) {
      process.stdout.write('Next: no matching items\n');
      return;
    }

    process.stdout.write(`Next (${items.length}):\n`);
    for (const it of items) {
      const key = it.key || it.id;
      const title = firstLine(it.title || '');
      const url = it.url ? String(it.url) : '';

      let spec = null;
      try {
        const full = runAgencyJson(['tracker', 'get', '--id', String(key)]);
        const ref = parseSpecRefFromComments(full.item?.comments || []);
        if (ref && ref.id) {
          const page = runAgencyJson(['docs', 'get', '--id', String(ref.id)]).page;
          spec = { id: String(ref.id), status: page?.status ? String(page.status) : 'UNKNOWN', url: page?.url ? String(page.url) : (ref.url || null) };
        } else if (ref && ref.url) {
          spec = { id: null, status: 'UNKNOWN', url: ref.url };
        }
      } catch {
        // best-effort enrichment; keep the queue usable even if docs are disabled/missing
      }

      const specText = spec
        ? spec.id
          ? `spec=${spec.status} (${spec.id}${spec.url ? ` ${spec.url}` : ''})`
          : `spec=${spec.status} (${spec.url || 'linked'})`
        : 'spec=missing';

      process.stdout.write(`- ${key}: ${title}${url ? ` (${url})` : ''}\n  ${specText}\n`);
    }
    return;
  }

  if (cmd === 'open') {
    const id = args.flags.id ? String(args.flags.id) : '';
    if (!id) die('agency open requires --id <ticketIdOrKey>');

    const full = runAgencyJson(['tracker', 'get', '--id', id]);
    const ticket = full.item;
    const comments = ticket?.comments || [];

    let spec = null;
    const specRef = parseSpecRefFromComments(comments);
    if (specRef && specRef.id) {
      try {
        const page = runAgencyJson(['docs', 'get', '--id', String(specRef.id)]).page;
        spec = { id: String(specRef.id), status: page?.status ? String(page.status) : 'UNKNOWN', url: page?.url ? String(page.url) : (specRef.url || null) };
      } catch {
        spec = { id: String(specRef.id), status: 'UNKNOWN', url: specRef.url || null };
      }
    } else if (specRef && specRef.url) {
      spec = { id: null, status: 'UNKNOWN', url: specRef.url };
    }

    let pr = null;
    const prRef = parsePrRefFromComments(comments);
    if (prRef && prRef.url) {
      const n = parseGitHubPrNumberFromUrl(prRef.url);
      if (n) {
        try {
          const prRes = runAgencyJson(['scm', 'pr-get', '--number', String(n)]);
          pr = {
            number: Number(prRes?.pr?.number),
            state: prRes?.pr?.state ? String(prRes.pr.state) : 'UNKNOWN',
            url: prRes?.pr?.url ? String(prRes.pr.url) : prRef.url
          };
        } catch {
          pr = { number: n, state: 'UNKNOWN', url: prRef.url };
        }
      } else {
        pr = { number: null, state: 'UNKNOWN', url: prRef.url };
      }
    }

    printTicketSummary({ ticket, spec, pr });

    const config = loadResolvedConfigBestEffort();
    const labelApproved = getWorkflowLabel(config, 'approved', 'ai-state:approved');
    const gateSpec = config?.workflow?.gates?.spec_approval !== false;
    const gates = config?.workflow?.gates || {};
    const gateReview = gates.code_review !== false;
    const gateQa = gates.qa_verification !== false;

    const missing = [];
    if (gateSpec && (!spec || String(spec.status || '').toUpperCase() !== 'APPROVED')) missing.push('spec approval');
    if (gateReview && !(Array.isArray(ticket.labels) && ticket.labels.includes(getWorkflowLabel(config, 'reviewed', 'ai-state:reviewed')))) missing.push('code review');
    if (gateQa && !(Array.isArray(ticket.labels) && ticket.labels.includes(getWorkflowLabel(config, 'verified', 'ai-state:verified')))) missing.push('qa verification');

    if (Array.isArray(ticket.labels) && ticket.labels.includes(labelApproved)) {
      process.stdout.write(`Next hint: ticket is ${labelApproved}; run the Dev agent when spec is APPROVED.\n`);
    } else if (!spec) {
      process.stdout.write('Next hint: run the Planning agent to create/link a Spec.\n');
    } else if (gateSpec && String(spec.status || '').toUpperCase() !== 'APPROVED') {
      process.stdout.write(`Next hint: approve the Spec (e.g. \`agency spec approve --id ${spec.id}\`), then add label ${labelApproved}.\n`);
    } else if (!pr) {
      process.stdout.write('Next hint: run the Dev agent to create/link a PR.\n');
    } else if (missing.length > 0) {
      process.stdout.write(`Next hint: missing gates: ${missing.join(', ')}.\n`);
    } else {
      process.stdout.write('Next hint: all configured gates look satisfied.\n');
    }
    return;
  }

  if (cmd === 'spec') {
    const sub = args._[1];
    if (sub === 'approve') {
      const id = args.flags.id ? String(args.flags.id) : '';
      if (!id) die('agency spec approve requires --id <specId>');
      const out = runAgencyJson(['docs', 'update', '--id', id, '--status', 'APPROVED']);
      const url = out.page?.url ? String(out.page.url) : '';
      process.stdout.write(`Spec approved: ${id}${url ? ` (${url})` : ''}\n`);
      return;
    }
    die(`Unknown spec command: ${sub || '(missing)'}`);
  }

  die(`Unknown command: ${cmd}`);
}

main();
