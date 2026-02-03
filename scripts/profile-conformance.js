#!/usr/bin/env node
/**
 * Conformance testing for a client/team profile.
 *
 * A profile is a directory containing:
 * - .agency-project.json
 *
 * This runner:
 * - Validates config/generation in a temp host root
 * - Lints prompts
 * - Runs deterministic simulated flows (fake backend)
 *
 * Usage:
 *   node scripts/profile-conformance.js --profile profiles/atlassian
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

function die(msg) {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { profile: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--profile') {
      out.profile = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

function repoRoot() {
  return path.resolve(__dirname, '..');
}

function mkTempHost() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agency-profile-'));
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runNode(scriptRel, args, env) {
  const script = path.join(repoRoot(), scriptRel);
  const res = cp.spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot(),
    env: { ...process.env, ...env },
    encoding: 'utf8'
  });
  return res;
}

function runSim(scriptRel, args, env) {
  const res = runNode(scriptRel, [...args, '--json'], env);
  if (res.status !== 0) {
    die(`simulate failed: ${scriptRel}\n${res.stdout}\n${res.stderr}`);
  }
  return JSON.parse(res.stdout);
}

function ensureProfile(profileDir) {
  const abs = path.resolve(profileDir);
  const cfgPath = path.join(abs, '.agency-project.json');
  if (!fs.existsSync(cfgPath)) die(`Profile missing .agency-project.json: ${cfgPath}`);
  const cfg = readJson(cfgPath);
  if (!cfg?.tracker?.mode) die(`Profile must set tracker.mode in ${cfgPath}`);
  return { abs, cfg };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.profile) die('Usage: node scripts/profile-conformance.js --profile <dir>');

  const { abs: profileAbs, cfg: profileCfg } = ensureProfile(args.profile);
  const mode = profileCfg.tracker.mode;

  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), profileCfg);

  // Always run with the fake integration backend so tests are deterministic.
  const baseEnv = {
    AGENCY_HOST_ROOT: hostRoot,
    AGENCY_INTEGRATION_BACKEND: 'fake'
  };

  // 1) Prompt lint (repo-level)
  {
    const lint = runNode('scripts/prompt-lint.js', ['--json'], baseEnv);
    if (lint.status !== 0) die(`prompt lint failed:\n${lint.stdout}\n${lint.stderr}`);
  }

  // 2) Generate opencode.jsonc for this profile config
  {
    const gen = runNode('scripts/config.js', ['--generate'], baseEnv);
    if (gen.status !== 0) die(`config generate failed:\n${gen.stdout}\n${gen.stderr}`);
  }

  // 3) Run deterministic flow suite. We keep fixtures aligned with each mode.
  const label = (name) => (mode === 'github' ? name.replace('ai-state:', '') : name);

  // Planning
  writeJson(path.join(hostRoot, '.agency-fixtures', 'state.json'), {
    tracker: { items: [{ id: 'T-1', key: 'T-1', title: 'Plan', labels: [label('ai-state:ready-for-plan')], comments: [] }] },
    docs: { pages: [] }
  });
  runSim('scripts/simulate/planning.js', ['--execute'], baseEnv);

  // PM Sync (approved)
  writeJson(path.join(hostRoot, '.agency-fixtures', 'state.json'), {
    tracker: {
      items: [
        { id: 'T-2', key: 'T-2', title: 'Sync', labels: [label('ai-state:plan-review')], comments: ['Confluence Spec: https://fake.local/docs/page-a'] }
      ]
    },
    docs: { pages: [{ id: 'page-a', title: 'Spec', body: 'x', status: 'APPROVED', url: 'https://fake.local/docs/page-a' }] }
  });
  runSim('scripts/simulate/pm-sync.js', ['--execute'], baseEnv);

  // Dev -> QA -> Verified
  writeJson(path.join(hostRoot, '.agency-fixtures', 'state.json'), {
    tracker: { items: [{ id: 'T-3', key: 'T-3', title: 'Dev', labels: [label('ai-state:approved')], comments: [] }] },
    docs: { pages: [] }
  });
  runSim('scripts/simulate/dev-complete.js', ['--execute'], baseEnv);
  runSim('scripts/simulate/qa-verify.js', ['--execute', '--pass'], baseEnv);

  // Review + Security
  writeJson(path.join(hostRoot, '.agency-fixtures', 'state.json'), {
    tracker: { items: [{ id: 'T-4', key: 'T-4', title: 'Review', labels: [label('ai-state:verified')], comments: [] }] },
    docs: { pages: [] }
  });
  runSim('scripts/simulate/review.js', ['--execute', '--pass'], baseEnv);
  runSim('scripts/simulate/security-audit.js', ['--execute', '--pass'], baseEnv);

  // Release (requires verified + reviewed + security-pass)
  writeJson(path.join(hostRoot, '.agency-fixtures', 'state.json'), {
    tracker: {
      items: [
        {
          id: 'T-5',
          key: 'T-5',
          title: 'Release',
          labels: [label('ai-state:verified'), label('ai-state:reviewed'), label('ai-state:security-pass')],
          comments: []
        }
      ]
    },
    docs: { pages: [] }
  });
  runSim('scripts/simulate/release.js', ['--execute'], baseEnv);

  // SCM PR flow (only when enabled for this profile)
  if ((profileCfg.scm?.provider || 'none') !== 'none') {
    writeJson(path.join(hostRoot, '.agency-fixtures', 'state.json'), {
      tracker: {
        items: [
          { id: 'T-6', key: 'T-6', title: 'PR', labels: [label('ai-state:approved')], comments: [] }
        ]
      },
      docs: { pages: [] },
      scm: { prs: [] }
    });
    runSim('scripts/simulate/scm-pr.js', ['--execute'], baseEnv);
  }

  process.stdout.write(`Profile OK: ${profileAbs}\n`);
  process.stdout.write(`- tracker.mode=${mode}\n`);
  process.stdout.write(`- temp host root: ${hostRoot}\n`);
}

main();
