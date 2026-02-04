const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const { readTraceSnapshot, assertTraceSnapshot } = require('../testlib/helpers.trace');

const repoRoot = path.resolve(__dirname, '..');
const tracesDir = path.join(repoRoot, 'test', 'fixtures', 'traces');

function mkTempHost() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agency-host-'));
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
}

function runSim(script, args, hostRoot) {
  const res = cp.spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    env: { ...process.env, AGENCY_HOST_ROOT: hostRoot, AGENCY_INTEGRATION_BACKEND: 'fake' },
    encoding: 'utf8'
  });
  if (res.status !== 0) {
    throw new Error(`simulate failed: ${script}\n${res.stdout}\n${res.stderr}`);
  }
  return JSON.parse(res.stdout);
}

function buildFixtureState(hostRoot, state) {
  writeJson(path.join(hostRoot, '.agency-project.json'), { version: '1.0', tracker: { mode: 'atlassian' }, scm: { provider: 'github' } });
  writeJson(path.join(hostRoot, '.agency-fixtures', 'state.json'), state);
}

function compare(actualPayload, snapshotName) {
  const snapshotPath = path.join(tracesDir, snapshotName);
  const expected = readTraceSnapshot(snapshotPath);
  const { normalized, expected: exp } = assertTraceSnapshot(actualPayload, expected);
  assert.deepEqual(normalized, exp);
}

test('trace snapshots: planning', () => {
  const hostRoot = mkTempHost();
  buildFixtureState(hostRoot, {
    tracker: { items: [{ id: 'ABC-1', key: 'ABC-1', title: 'Plan', labels: ['ai-state:ready-for-plan'], comments: [] }] },
    docs: { pages: [] }
  });
  const payload = runSim(path.join(repoRoot, 'scripts', 'simulate', 'planning.js'), ['--execute', '--json'], hostRoot);
  compare(payload, 'planning.json');
});

test('trace snapshots: pm-sync', () => {
  const hostRoot = mkTempHost();
  buildFixtureState(hostRoot, {
    tracker: { items: [{ id: 'ABC-10', key: 'ABC-10', title: 'Approved', labels: ['ai-state:plan-review'], comments: ['Spec: page-a https://fake.local/docs/page-a'] }] },
    docs: { pages: [{ id: 'page-a', title: 'Spec', body: 'x', status: 'APPROVED', url: 'https://fake.local/docs/page-a' }] }
  });
  const payload = runSim(path.join(repoRoot, 'scripts', 'simulate', 'pm-sync.js'), ['--execute', '--json'], hostRoot);
  compare(payload, 'pm-sync.json');
});

test('trace snapshots: dev-complete', () => {
  const hostRoot = mkTempHost();
  buildFixtureState(hostRoot, {
    tracker: { items: [{ id: 'ABC-20', key: 'ABC-20', title: 'Dev', labels: ['ai-state:approved'], comments: [] }] },
    docs: { pages: [] }
  });
  const payload = runSim(path.join(repoRoot, 'scripts', 'simulate', 'dev-complete.js'), ['--execute', '--json'], hostRoot);
  compare(payload, 'dev-complete.json');
});

test('trace snapshots: qa-pass', () => {
  const hostRoot = mkTempHost();
  buildFixtureState(hostRoot, {
    tracker: { items: [{ id: 'ABC-21', key: 'ABC-21', title: 'QA', labels: ['ai-state:in-qa'], comments: [] }] },
    docs: { pages: [] }
  });
  const payload = runSim(path.join(repoRoot, 'scripts', 'simulate', 'qa-verify.js'), ['--execute', '--pass', '--json'], hostRoot);
  compare(payload, 'qa-pass.json');
});

test('trace snapshots: review-pass', () => {
  const hostRoot = mkTempHost();
  buildFixtureState(hostRoot, {
    tracker: { items: [{ id: 'ABC-30', key: 'ABC-30', title: 'Review', labels: ['ai-state:verified'], comments: [] }] },
    docs: { pages: [] }
  });
  const payload = runSim(path.join(repoRoot, 'scripts', 'simulate', 'review.js'), ['--execute', '--pass', '--json'], hostRoot);
  compare(payload, 'review-pass.json');
});

test('trace snapshots: security-pass', () => {
  const hostRoot = mkTempHost();
  buildFixtureState(hostRoot, {
    tracker: { items: [{ id: 'ABC-31', key: 'ABC-31', title: 'Security', labels: ['ai-state:verified'], comments: [] }] },
    docs: { pages: [] }
  });
  const payload = runSim(path.join(repoRoot, 'scripts', 'simulate', 'security-audit.js'), ['--execute', '--pass', '--json'], hostRoot);
  compare(payload, 'security-pass.json');
});

test('trace snapshots: release', () => {
  const hostRoot = mkTempHost();
  buildFixtureState(hostRoot, {
    tracker: {
      items: [
        {
          id: 'ABC-40',
          key: 'ABC-40',
          title: 'Release',
          labels: ['ai-state:verified', 'ai-state:reviewed', 'ai-state:security-pass'],
          comments: []
        }
      ]
    },
    docs: { pages: [] }
  });
  const payload = runSim(path.join(repoRoot, 'scripts', 'simulate', 'release.js'), ['--execute', '--json'], hostRoot);
  compare(payload, 'release.json');
});

test('trace snapshots: scm-pr', () => {
  const hostRoot = mkTempHost();
  buildFixtureState(hostRoot, {
    tracker: { items: [{ id: 'ABC-50', key: 'ABC-50', title: 'PR', labels: ['ai-state:approved'], comments: [] }] },
    docs: { pages: [] },
    scm: { prs: [] }
  });
  const payload = runSim(path.join(repoRoot, 'scripts', 'simulate', 'scm-pr.js'), ['--execute', '--json'], hostRoot);
  compare(payload, 'scm-pr.json');
});
