#!/usr/bin/env node
/**
 * OpenCode agent-run smoke test (manual / gated).
 *
 * Goal:
 * - Exercise a real agent run end-to-end (OpenCode -> Agency MCP -> fake backend)
 * - Assert that tool calls happen and are named as expected (tracker.* surface)
 *
 * This is not enabled in CI by default. It requires:
 * - opencode installed on PATH
 * - AGENCY_E2E_AGENT=1
 *
 * Usage:
 *   AGENCY_E2E_AGENT=1 node .agency/scripts/e2e/opencode-agent-smoke.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

function envFlag(name) {
  const v = process.env[name];
  if (!v) return false;
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes';
}

function die(msg) {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(1);
}

function repoRoot() {
  return path.resolve(__dirname, '..', '..');
}

function run(cmd, args, options = {}) {
  return cp.spawnSync(cmd, args, { encoding: 'utf8', ...options });
}

function checkCommand(name) {
  const res = run(name, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
  return res.status === 0;
}

function mkTempHost() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agency-opencode-e2e-'));
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
}

function safeSymlink(target, linkPath) {
  try {
    fs.symlinkSync(target, linkPath, 'dir');
  } catch (err) {
    // On some systems, an existing link may throw.
    if (err && err.code === 'EEXIST') return;
    throw err;
  }
}

function parseJsonLines(text) {
  const out = [];
  for (const line of String(text).split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      // Ignore non-JSON lines (some OpenCode versions may emit logs).
    }
  }
  return out;
}

function extractToolUses(events) {
  const uses = [];
  for (const e of events) {
    if (!e || typeof e !== 'object') continue;

    // Observed in the wild:
    // - { type: "tool_use", name, input, ... }
    // - (fallback) { event: "tool_use", ... }
    const type = e.type || e.event || null;
    if (type !== 'tool_use') continue;

    const name = e.name || e.tool || e.tool_name || null;
    if (!name) continue;
    uses.push({ name: String(name), raw: e });
  }
  return uses;
}

function main() {
  if (!envFlag('AGENCY_E2E_AGENT')) {
    process.stdout.write('Skip: set AGENCY_E2E_AGENT=1 to run OpenCode agent E2E.\n');
    return;
  }

  if (!checkCommand('opencode')) {
    die('opencode not found on PATH. Install it and re-run.');
  }

  const hostRoot = mkTempHost();
  const agencyPath = path.join(hostRoot, '.agency');
  safeSymlink(repoRoot(), agencyPath);

  // Minimal host config. We keep Jira/Confluence mode but use the fake backend.
  writeJson(path.join(hostRoot, '.agency-project.json'), {
    version: '1.0',
    tracker: { mode: 'atlassian' },
    scm: { provider: 'github' }
  });

  // Deterministic fixtures (fake backend).
  writeJson(path.join(hostRoot, '.agency-fixtures', 'state.json'), {
    tracker: {
      items: [
        { id: 'E2E-1', key: 'E2E-1', title: 'E2E planning', labels: ['ai-state:ready-for-plan'], comments: [] }
      ]
    },
    docs: { pages: [] },
    scm: { prs: [] }
  });

  // Generate opencode.jsonc into the host root (so OpenCode loads the same way it would in a real repo).
  {
    const res = run(process.execPath, [path.join(repoRoot(), 'scripts', 'config.js'), '--generate'], {
      cwd: repoRoot(),
      env: { ...process.env, AGENCY_HOST_ROOT: hostRoot }
    });
    if (res.status !== 0) {
      die(`Failed to generate opencode.jsonc:\n${res.stdout}\n${res.stderr}`);
    }
  }

  // Run a real agent. We only need to observe at least one tool call to Agency MCP.
  const agentName = process.env.AGENCY_E2E_AGENT_NAME || 'Planning Agent';
  const message =
    process.env.AGENCY_E2E_AGENT_MESSAGE ||
    'Run your dashboard startup protocol. Use the tracker tools to list ready items, then stop and ask which ticket to plan.';

  const opencodeRes = run('opencode', ['run', '--format', 'json', '--agent', agentName, message], {
    cwd: hostRoot,
    env: {
      ...process.env,
      AGENCY_HOST_ROOT: hostRoot,
      AGENCY_INTEGRATION_BACKEND: 'fake'
    }
  });

  const out = `${opencodeRes.stdout || ''}`;
  const err = `${opencodeRes.stderr || ''}`;
  if (opencodeRes.status !== 0) {
    die(`opencode run failed (exit=${opencodeRes.status}).\nSTDOUT:\n${out}\n\nSTDERR:\n${err}`);
  }

  const events = parseJsonLines(out);
  const toolUses = extractToolUses(events);
  const toolNames = toolUses.map((u) => u.name);

  const hasTrackerSearch = toolNames.some((n) => n === 'tracker.search' || n === 'agency.tracker.search');
  if (!hasTrackerSearch) {
    const preview = toolNames.length ? toolNames.join(', ') : '(none)';
    die(`No tracker.search tool call observed. toolUses=${preview}\nTip: set AGENCY_E2E_AGENT_MESSAGE for a more explicit prompt.`);
  }

  process.stdout.write('OpenCode agent E2E: OK\n');
  process.stdout.write(`- hostRoot=${hostRoot}\n`);
  process.stdout.write(`- agent=${agentName}\n`);
  process.stdout.write(`- toolUses=${toolNames.join(', ')}\n`);
}

main();

