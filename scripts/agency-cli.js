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
 *
 * Notes:
 * - Uses AGENCY_HOST_ROOT to avoid mutating the .agency repo during tests.
 * - Designed to work when this repo is installed as a submodule at `.agency/`.
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

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

function initHost({ mode, force }) {
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

  fs.writeFileSync(
    projectConfigPath,
    JSON.stringify({ version: '1.0', tracker, scm }, null, 2) + '\n'
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
  agency init [--mode atlassian|github|linear|standalone] [--force]
  agency generate
  agency doctor
  agency test [--profile <dir>]
  agency labels [--mode atlassian|github|linear|standalone]

Notes:
  - Uses AGENCY_HOST_ROOT to decide which host repo is being configured.
  - For simulated E2E/conformance tests, pass --profile which must contain .agency-project.json.
`);
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
  const labels = requiredAiStateLabels();
  process.stdout.write('Required workflow labels (portable state machine):\n');
  for (const l of labels) process.stdout.write(`- ${l}\n`);

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
    initHost({ mode, force: Boolean(args.flags.force) });
    return;
  }

  if (cmd === 'generate') {
    const res = runNode('scripts/config.js', ['--generate']);
    process.stdout.write(res.stdout);
    process.stderr.write(res.stderr);
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

  die(`Unknown command: ${cmd}`);
}

main();
