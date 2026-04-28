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
const os = require('os');
const path = require('path');
const cp = require('child_process');
require('./load-env').loadEnvFiles();
const {
  parseSpecRefFromComments,
  parsePrRefFromComments,
  parseGitHubPrNumberFromUrl,
  workflowLabel,
  classifyWorkflowGates
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
  agency workflow diagnose --id <ticketIdOrKey> [--json]
  agency plan get --id <ticketIdOrKey> [--json]
  agency plan check --id <ticketIdOrKey> [--json]
  agency plan republish --id <ticketIdOrKey> [--spec-id <specId>] [--json]
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

function printJson(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

function planStatus(planRes) {
  if (!planRes?.found) return 'missing';
  return planRes.valid ? 'valid' : 'invalid';
}

function printPlanCheck(planRes) {
  const key = planRes?.ticket?.key || planRes?.ticket?.id || '(unknown)';
  process.stdout.write(`${key}: execution plan ${planStatus(planRes)}\n`);
  if (planRes?.ref) {
    const refId = planRes.ref.id ? ` ${planRes.ref.id}` : '';
    process.stdout.write(`Source: ${planRes.ref.marker || 'unknown'}${refId}${planRes.ref.url ? ` ${planRes.ref.url}` : ''}\n`);
  }
  if (planRes?.plan?.version) process.stdout.write(`Version: ${planRes.plan.version}\n`);
  if (Array.isArray(planRes?.errors) && planRes.errors.length > 0) {
    process.stdout.write(`Errors: ${planRes.errors.join('; ')}\n`);
  }
}

function planCheck({ id, json }) {
  const planRes = runAgencyJson(['plan', 'get', '--id', id]);
  if (json) printJson(planRes);
  else printPlanCheck(planRes);
  return planRes.found && planRes.valid ? 0 : 1;
}

function planRepublish({ id, specId, json }) {
  const planRes = runAgencyJson(['plan', 'get', '--id', id]);
  if (!planRes.found) die(`No execution plan found for ${id}`);
  if (!planRes.valid) die(`Execution plan for ${id} is invalid: ${(planRes.errors || []).join('; ') || 'unknown error'}`);
  if (!planRes.plan) die(`Execution plan payload missing for ${id}`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agency-plan-'));
  const planFile = path.join(tmpDir, 'plan.json');
  fs.writeFileSync(planFile, JSON.stringify(planRes.plan, null, 2) + '\n');

  const publishArgs = ['plan', 'publish', '--id', id, '--file', planFile];
  if (specId) publishArgs.push('--spec-id', specId);
  const published = runAgencyJson(publishArgs);

  if (json) {
    printJson(published);
  } else {
    const key = planRes?.ticket?.key || planRes?.ticket?.id || id;
    process.stdout.write(`${key}: execution plan republished\n`);
    if (published?.spec?.id) {
      process.stdout.write(`Spec: ${published.spec.id}${published.spec.url ? ` ${published.spec.url}` : ''}\n`);
    }
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

function printTicketSummary({ ticket, spec, pr, prRequired = true }) {
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
  if (!prRequired) {
    process.stdout.write('PR: n/a\n');
  } else if (pr) {
    const prLine = pr.number
      ? `PR: ${pr.state || 'UNKNOWN'} (#${pr.number}${pr.url ? ` ${pr.url}` : ''})`
      : `PR: linked (${pr.url || 'unknown'})`;
    process.stdout.write(`${prLine}\n`);
  } else {
    process.stdout.write('PR: missing\n');
  }
}

function diagnoseWorkflow({ id, json }) {
  const ticketRes = runAgencyJson(['tracker', 'get', '--id', id]);
  const ticket = ticketRes.item || {};
  const comments = Array.isArray(ticket.comments) ? ticket.comments : [];
  const labels = Array.isArray(ticket.labels) ? ticket.labels : [];
  const config = loadResolvedConfigBestEffort();

  const specRef = parseSpecRefFromComments(comments);
  let spec = null;
  if (specRef?.id) {
    try {
      const page = runAgencyJson(['docs', 'get', '--id', String(specRef.id)]).page;
      spec = {
        id: String(specRef.id),
        status: page?.status ? String(page.status) : 'UNKNOWN',
        title: page?.title ? String(page.title) : null,
        url: page?.url ? String(page.url) : (specRef.url || null)
      };
    } catch (err) {
      spec = { id: String(specRef.id), status: 'UNKNOWN', url: specRef.url || null, error: err && err.message ? err.message : String(err) };
    }
  } else if (specRef?.url) {
    spec = { id: null, status: 'UNKNOWN', url: specRef.url };
  }

  let plan = null;
  try {
    plan = runAgencyJson(['plan', 'get', '--id', id]);
  } catch (err) {
    plan = { found: false, valid: false, errors: [err && err.message ? err.message : String(err)] };
  }

  const prRef = parsePrRefFromComments(comments);
  const pr = prRef?.url ? { url: prRef.url, number: parseGitHubPrNumberFromUrl(prRef.url) } : null;

  const labelsNeeded = {
    approved: getWorkflowLabel(config, 'approved', 'ai-state:approved'),
    inQa: getWorkflowLabel(config, 'in_qa', 'ai-state:in-qa'),
    verified: getWorkflowLabel(config, 'verified', 'ai-state:verified'),
    reviewed: getWorkflowLabel(config, 'reviewed', 'ai-state:reviewed')
  };
  const gates = config?.workflow?.gates || {};
  const gateSpec = gates.spec_approval !== false;
  const gateQa = gates.qa_verification !== false;
  const gateReview = gates.code_review !== false;
  const scmEnabled = String(config?.scm?.provider || 'none') !== 'none';
  const specApproved = !gateSpec || String(spec?.status || '').toUpperCase() === 'APPROVED';
  const qaPassed = !gateQa || labels.includes(labelsNeeded.verified);
  const reviewPassed = !gateReview || labels.includes(labelsNeeded.reviewed);
  const gateState = classifyWorkflowGates({
    config,
    labels,
    spec,
    planLinked: Boolean(plan?.found),
    planValid: Boolean(plan?.valid),
    prLinked: Boolean(pr),
    scmEnabled
  });

  let next = 'No next action determined.';
  if (!spec) next = 'Run Planning Agent to create/link a Spec.';
  else if (!plan?.found) next = 'Run Planning Agent or `agency plan republish` after a valid plan exists.';
  else if (!plan.valid) next = 'Repair the execution plan, then run `agency plan republish`.';
  else if (gateSpec && !specApproved) next = 'Approve the Spec, then run PM Governance Sync.';
  else if (labels.includes(labelsNeeded.approved)) next = 'Developer Agent can start.';
  else if (scmEnabled && !pr && (labels.includes(labelsNeeded.inQa) || labels.includes(labelsNeeded.verified) || labels.includes(labelsNeeded.reviewed))) next = 'Link the implementation PR, then continue the current gate.';
  else if (labels.includes(labelsNeeded.inQa)) next = 'QA Engineer Agent can verify.';
  else if (labels.includes(labelsNeeded.verified) && !reviewPassed) next = 'Code Reviewer Agent can review.';
  else if (labels.includes(labelsNeeded.verified) && reviewPassed) next = 'Project Manager Agent can release.';

  const missing = gateState.current_blockers;

  const diagnosis = {
    version: '1.0',
    ticket: {
      id: ticket.id ? String(ticket.id) : id,
      key: ticket.key ? String(ticket.key) : null,
      title: ticket.title ? String(ticket.title) : '',
      url: ticket.url ? String(ticket.url) : null,
      labels
    },
    spec: spec || { missing: true },
    plan: plan
      ? { found: Boolean(plan.found), valid: Boolean(plan.valid), errors: plan.errors || [], ref: plan.ref || null }
      : { found: false, valid: false, errors: ['plan.get unavailable'] },
    pr: pr ? { ...pr, linked: true, required: scmEnabled } : { missing: scmEnabled, linked: false, required: scmEnabled },
    gates: {
      spec_approval: { required: gateSpec, passed: specApproved },
      qa_verification: { required: gateQa, passed: qaPassed },
      code_review: { required: gateReview, passed: reviewPassed }
    },
    stage: gateState.stage,
    current_blockers: gateState.current_blockers,
    future_gates: gateState.future_gates,
    missing,
    next
  };

  if (json) {
    printJson(diagnosis);
    return 0;
  }

  const key = diagnosis.ticket.key || diagnosis.ticket.id;
  process.stdout.write(`${key}: ${firstLine(diagnosis.ticket.title)}\n`);
  process.stdout.write(`Labels: ${labels.length > 0 ? labels.join(', ') : '(none)'}\n`);
  if (spec) {
    process.stdout.write(`Spec: ${spec.status || 'UNKNOWN'}${spec.id ? ` (${spec.id})` : ''}${spec.url ? ` ${spec.url}` : ''}\n`);
  } else {
    process.stdout.write('Spec: missing\n');
  }
  process.stdout.write(`Execution plan: ${planStatus(plan)}\n`);
  if (Array.isArray(plan?.errors) && plan.errors.length > 0) {
    process.stdout.write(`Plan errors: ${plan.errors.join('; ')}\n`);
  }
  process.stdout.write(`PR: ${scmEnabled ? (pr?.url || 'missing') : 'n/a'}\n`);
  process.stdout.write(`Missing gates: ${missing.length > 0 ? missing.join(', ') : 'none'}\n`);
  process.stdout.write(`Next: ${next}\n`);
  return 0;
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

    const config = loadResolvedConfigBestEffort();
    const scmEnabled = String(config?.scm?.provider || 'none') !== 'none';
    printTicketSummary({ ticket, spec, pr, prRequired: scmEnabled });

    const labelApproved = getWorkflowLabel(config, 'approved', 'ai-state:approved');
    const labelInQa = getWorkflowLabel(config, 'in_qa', 'ai-state:in-qa');
    const labelVerified = getWorkflowLabel(config, 'verified', 'ai-state:verified');
    const labelReviewed = getWorkflowLabel(config, 'reviewed', 'ai-state:reviewed');
    const gateSpec = config?.workflow?.gates?.spec_approval !== false;
    let plan = null;
    try {
      plan = runAgencyJson(['plan', 'get', '--id', id]);
    } catch {
      plan = { found: false, valid: false };
    }
    const ticketLabels = Array.isArray(ticket.labels) ? ticket.labels : [];
    const gateState = classifyWorkflowGates({
      config,
      labels: ticketLabels,
      spec,
      planLinked: Boolean(plan?.found),
      planValid: Boolean(plan?.valid),
      prLinked: Boolean(pr),
      scmEnabled
    });
    const missing = gateState.current_blockers;

    if (ticketLabels.includes(labelApproved) && missing.length === 0) {
      process.stdout.write(`Next hint: ticket is ${labelApproved}; run the Dev agent when spec is APPROVED.\n`);
    } else if (!spec) {
      process.stdout.write('Next hint: run the Planning agent to create/link a Spec.\n');
    } else if (gateSpec && String(spec.status || '').toUpperCase() !== 'APPROVED') {
      process.stdout.write(`Next hint: approve the Spec (e.g. \`agency spec approve --id ${spec.id}\`), then add label ${labelApproved}.\n`);
    } else if (missing.length > 0) {
      process.stdout.write(`Next hint: missing gates: ${missing.join(', ')}.\n`);
    } else if (ticketLabels.includes(labelInQa)) {
      process.stdout.write(`Next hint: ticket is ${labelInQa}; run the QA agent.\n`);
    } else if (ticketLabels.includes(labelVerified)) {
      process.stdout.write(`Next hint: ticket is ${labelVerified}; run the Review agent.\n`);
    } else if (ticketLabels.includes(labelReviewed)) {
      process.stdout.write(`Next hint: ticket is ${labelReviewed}; release can proceed.\n`);
    } else {
      process.stdout.write('Next hint: all configured gates look satisfied.\n');
    }
    return;
  }

  if (cmd === 'workflow') {
    const sub = args._[1];
    if (sub === 'diagnose') {
      const id = args.flags.id ? String(args.flags.id) : '';
      if (!id) die('agency workflow diagnose requires --id <ticketIdOrKey>');
      const code = diagnoseWorkflow({ id, json: Boolean(args.flags.json) });
      process.exit(code);
    }
    die(`Unknown workflow command: ${sub || '(missing)'}`);
  }

  if (cmd === 'plan') {
    const sub = args._[1];
    const id = args.flags.id ? String(args.flags.id) : '';
    if (sub === 'get') {
      if (!id) die('agency plan get requires --id <ticketIdOrKey>');
      const out = runAgencyJson(['plan', 'get', '--id', id]);
      if (args.flags.json) printJson(out);
      else printPlanCheck(out);
      return;
    }
    if (sub === 'check') {
      if (!id) die('agency plan check requires --id <ticketIdOrKey>');
      const code = planCheck({ id, json: Boolean(args.flags.json) });
      process.exit(code);
    }
    if (sub === 'republish') {
      if (!id) die('agency plan republish requires --id <ticketIdOrKey>');
      planRepublish({
        id,
        specId: args.flags['spec-id'] ? String(args.flags['spec-id']) : '',
        json: Boolean(args.flags.json)
      });
      return;
    }
    die(`Unknown plan command: ${sub || '(missing)'}`);
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
