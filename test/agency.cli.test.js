const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const agencyScript = path.join(repoRoot, 'scripts', 'agency.js');

function mkTempHost() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agency-host-'));
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
}

function runAgency(args, hostRoot, extraEnv = {}) {
  const res = cp.spawnSync(process.execPath, [agencyScript, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      AGENCY_HOST_ROOT: hostRoot,
      ...extraEnv
    },
    encoding: 'utf8'
  });
  return res;
}

test('agency cli: supports boolean flags (e.g., --draft)', () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), {
    version: '1.0',
    tracker: { mode: 'atlassian' },
    scm: { provider: 'github' }
  });
  writeJson(path.join(hostRoot, '.agency-fixtures', 'state.json'), {
    tracker: { items: [] },
    docs: { pages: [] },
    scm: { prs: [] }
  });

  // Use fake backend so this is hermetic.
  const res = runAgency(
    ['scm', 'pr-create', '--title', 'Test', '--draft', '--json'],
    hostRoot,
    { AGENCY_INTEGRATION_BACKEND: 'fake' }
  );
  assert.equal(res.status, 0, res.stderr || res.stdout);

  const payload = JSON.parse(res.stdout);
  assert.equal(payload.pr.draft, true);
});
