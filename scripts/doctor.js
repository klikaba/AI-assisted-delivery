#!/usr/bin/env node
/**
 * Repo/installation sanity checks.
 *
 * This is intentionally network-free and safe to run: it does not modify the
 * host repository because it uses a temp host root for generation checks.
 *
 * Usage:
 *   node scripts/doctor.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
require('./load-env').loadEnvFiles();

function envFlag(name) {
  const v = process.env[name];
  if (!v) return false;
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes';
}

function run(cmd, args, options = {}) {
  const res = cp.spawnSync(cmd, args, { encoding: 'utf8', ...options });
  return res;
}

function mkTempHost() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agency-doctor-'));
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
}

function checkCommandExists(name) {
  const res = run(name, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
  return res.status === 0;
}

function redactHost(host) {
  // Avoid printing secrets; host is safe, but keep output minimal.
  return String(host);
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const configScript = path.join(repoRoot, 'scripts', 'config.js');
  const promptLintScript = path.join(repoRoot, 'scripts', 'prompt-lint.js');
  const memoryScript = path.join(repoRoot, 'scripts', 'memory.js');

  const failures = [];
  const notes = [];

  // Prefer host-root context when available (e.g., when invoked via `./.agency/bin/agency doctor`).
  const hostRoot = process.env.AGENCY_HOST_ROOT || process.cwd();
  const hostProjectConfigPath = path.join(hostRoot, '.agency-project.json');
  let hostResolvedConfig = null;
  let hostResolvedMode = null;
  let hostScmProvider = null;
  if (fs.existsSync(hostProjectConfigPath)) {
    const res = run(process.execPath, [configScript, '--pretty'], {
      cwd: repoRoot,
      env: { ...process.env, AGENCY_HOST_ROOT: hostRoot }
    });
    if (res.status !== 0) {
      failures.push(`failed to load host config from ${redactHost(hostRoot)}:\n${res.stdout}${res.stderr}`);
    } else {
      try {
        hostResolvedConfig = JSON.parse(res.stdout);
        hostResolvedMode = hostResolvedConfig?.tracker?.mode || null;
        hostScmProvider = hostResolvedConfig?.scm?.provider || null;
      } catch (err) {
        failures.push(`failed to parse resolved host config JSON:\n${err && err.message ? err.message : String(err)}`);
      }
    }
  } else {
    notes.push(`No host .agency-project.json found at ${redactHost(hostProjectConfigPath)} (skipping host-specific checks)`);
  }

  // Print a short summary so teams understand what doctor is checking.
  if (hostResolvedMode || hostScmProvider) {
    process.stdout.write(
      `Doctor context: hostRoot=${redactHost(hostRoot)} tracker.mode=${hostResolvedMode || '(unknown)'} scm.provider=${hostScmProvider || '(default)'}\n`
    );
  }

  // 1) Basic tool availability (informational; not all installs need all tools).
  if (!checkCommandExists('git')) failures.push('git not found on PATH');
  if (!checkCommandExists(process.execPath)) failures.push('node not runnable');
  if (!checkCommandExists('opencode')) notes.push('opencode not found (only required to run the agents)');
  if (!checkCommandExists('gh')) {
    const needsGh =
      hostResolvedMode === 'github' ||
      hostScmProvider === 'github';
    if (needsGh) failures.push('gh not found (required by this repo config: tracker.mode=github and/or scm.provider=github)');
    else notes.push('gh not found (required if you enable GitHub tracker mode and/or GitHub SCM)');
  }
  if (hostResolvedMode === 'linear') {
    const hasLinearToken = Boolean(process.env.LINEAR_ACCESS_TOKEN || process.env.LINEAR_API_KEY);
    if (!hasLinearToken) {
      notes.push('LINEAR_API_KEY (or LINEAR_ACCESS_TOKEN) not set (required when tracker.mode=linear)');
    }
  }

  // 2) Prompt lint (must pass).
  {
    const res = run(process.execPath, [promptLintScript], { cwd: repoRoot });
    if (res.status !== 0) failures.push(`prompt lint failed:\n${res.stdout}${res.stderr}`);
  }

  // 3) Config validate (must pass).
  {
    const res = run(process.execPath, [configScript, '--validate'], { cwd: repoRoot });
    if (res.status !== 0) failures.push(`config validate failed:\n${res.stdout}${res.stderr}`);
  }

  // 4) Generation + memory smoke tests per mode using a temp host root.
  for (const mode of ['atlassian', 'github', 'linear', 'standalone']) {
    const hostRoot = mkTempHost();
    writeJson(path.join(hostRoot, '.agency-project.json'), {
      version: '1.0',
      tracker: { mode }
    });

    const gen = run(process.execPath, [configScript, '--generate'], {
      cwd: repoRoot,
      env: { ...process.env, AGENCY_HOST_ROOT: hostRoot }
    });
    if (gen.status !== 0) {
      failures.push(`config generate failed for mode=${mode}:\n${gen.stdout}${gen.stderr}`);
      continue;
    }

    const mem = run(process.execPath, [memoryScript], {
      cwd: repoRoot,
      env: { ...process.env, AGENCY_HOST_ROOT: hostRoot }
    });
    if (mem.status !== 0) failures.push(`memory payload failed for mode=${mode}:\n${mem.stdout}${mem.stderr}`);
  }

  // 5) Deterministic simulated flows (fake backend, no network).
  {
    const tmpHost = mkTempHost();
    writeJson(path.join(tmpHost, '.agency-project.json'), { version: '1.0', tracker: { mode: 'atlassian' }, scm: { provider: 'github' } });
    const fixtureDir = path.join(tmpHost, '.agency-fixtures');
    writeJson(path.join(fixtureDir, 'state.json'), {
      tracker: {
        items: [
          {
            id: 'DOC-1',
            key: 'DOC-1',
            title: 'Doctor simulated flow',
            labels: ['ai-state:ready-for-plan'],
            comments: []
          }
        ]
      },
      docs: { pages: [] },
      scm: { prs: [] }
    });

    const simPlanning = run(process.execPath, [path.join(repoRoot, 'scripts/simulate/planning.js'), '--execute', '--json'], {
      cwd: repoRoot,
      env: { ...process.env, AGENCY_HOST_ROOT: tmpHost, AGENCY_INTEGRATION_BACKEND: 'fake' }
    });
    if (simPlanning.status !== 0) failures.push(`simulate planning failed:\n${simPlanning.stdout}${simPlanning.stderr}`);

    // SCM PR flow (ensures scm.* surface is exercised deterministically).
    writeJson(path.join(fixtureDir, 'state.json'), {
      tracker: {
        items: [
          {
            id: 'DOC-2',
            key: 'DOC-2',
            title: 'Doctor SCM flow',
            labels: ['ai-state:approved'],
            comments: []
          }
        ]
      },
      docs: { pages: [] },
      scm: { prs: [] }
    });
    const simScmPr = run(process.execPath, [path.join(repoRoot, 'scripts/simulate/scm-pr.js'), '--execute', '--json'], {
      cwd: repoRoot,
      env: { ...process.env, AGENCY_HOST_ROOT: tmpHost, AGENCY_INTEGRATION_BACKEND: 'fake' }
    });
    if (simScmPr.status !== 0) failures.push(`simulate scm-pr failed:\n${simScmPr.stdout}${simScmPr.stderr}`);
  }

  // 6) Optional live checks (network and real auth). Disabled by default.
  // Enable by setting: AGENCY_DOCTOR_LIVE=1
  if (envFlag('AGENCY_DOCTOR_LIVE')) {
    const hostRootForLive = hostRoot;

    // GitHub auth check (only when required by host config).
    if (hostResolvedConfig?.tracker?.mode === 'github' || hostResolvedConfig?.scm?.provider === 'github') {
      const ghAuth = run('gh', ['auth', 'status', '--hostname', 'github.com'], { encoding: 'utf8' });
      if (ghAuth.status !== 0) {
        failures.push(
          `gh auth status failed (run "gh auth login"):\n${(ghAuth.stdout || '')}${(ghAuth.stderr || '')}`
        );
      }
    }

    const live = cp.spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'doctor-live.js')], {
      cwd: repoRoot,
      env: { ...process.env, AGENCY_HOST_ROOT: hostRootForLive },
      encoding: 'utf8'
    });
    if (live.status !== 0) failures.push(`live checks failed for hostRoot=${redactHost(hostRootForLive)}:\n${live.stdout}${live.stderr}`);
  } else {
    notes.push('Live checks are disabled (set AGENCY_DOCTOR_LIVE=1 to verify real Jira/GitHub auth)');
  }

  if (failures.length === 0) {
    process.stdout.write('Doctor: OK\n');
    for (const n of notes) process.stdout.write(`Note: ${n}\n`);
    return;
  }

  process.stderr.write('Doctor: FAILED\n');
  for (const f of failures) process.stderr.write(`- ${f}\n`);
  for (const n of notes) process.stderr.write(`Note: ${n}\n`);
  process.exit(1);
}

main();
