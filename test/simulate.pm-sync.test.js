const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const script = path.join(repoRoot, 'scripts', 'simulate', 'pm-sync.js');

function mkTempHost() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agency-host-'));
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runSim(args, hostRoot) {
  return cp.spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    env: { ...process.env, AGENCY_HOST_ROOT: hostRoot, AGENCY_INTEGRATION_BACKEND: 'fake' },
    encoding: 'utf8'
  });
}

test('pm sync: moves plan-review based on spec status', () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), { version: '1.0', tracker: { mode: 'atlassian' } });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  const statePath = path.join(fixtureDir, 'state.json');

  // Two tickets in plan-review, each with a spec link
  writeJson(statePath, {
    tracker: {
      items: [
        {
          id: 'ABC-10',
          key: 'ABC-10',
          title: 'Approved ticket',
          labels: ['ai-state:plan-review'],
          comments: ['Confluence Spec: https://fake.local/docs/page-aaa']
        },
        {
          id: 'ABC-11',
          key: 'ABC-11',
          title: 'Changes ticket',
          labels: ['ai-state:plan-review'],
          comments: ['Confluence Spec: https://fake.local/docs/page-bbb']
        }
      ]
    },
    docs: {
      pages: [
        { id: 'page-aaa', title: 'Spec A', body: 'x', status: 'APPROVED', url: 'https://fake.local/docs/page-aaa' },
        { id: 'page-bbb', title: 'Spec B', body: 'y', status: 'CHANGES REQUESTED', url: 'https://fake.local/docs/page-bbb' }
      ]
    }
  });

  const res = runSim(['--execute', '--json'], hostRoot);
  assert.equal(res.status, 0, res.stderr || res.stdout);
  const payload = JSON.parse(res.stdout);
  assert.equal(payload.processed, 2);

  const stateAfter = readJson(statePath);
  const byId = Object.fromEntries(stateAfter.tracker.items.map((i) => [i.id, i]));
  assert.deepEqual(byId['ABC-10'].labels.sort(), ['ai-state:approved']);
  assert.deepEqual(byId['ABC-11'].labels.sort(), ['ai-state:ready-for-plan']);
});

