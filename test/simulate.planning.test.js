const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const script = path.join(repoRoot, 'scripts', 'simulate', 'planning.js');

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
    env: {
      ...process.env,
      AGENCY_HOST_ROOT: hostRoot,
      AGENCY_INTEGRATION_BACKEND: 'fake'
    },
    encoding: 'utf8'
  });
}

function assertPlanShape(plan) {
  assert.equal(plan.version, '1.0');
  assert.ok(plan.ticket);
  assert.ok(plan.ticket.id);
  assert.ok(plan.ticket.title);
  assert.ok(Array.isArray(plan.acceptanceCriteria));
  assert.ok(Array.isArray(plan.filesToTouch));
  assert.ok(Array.isArray(plan.steps));
  assert.ok(plan.steps.length >= 1);
}

test('simulate planning: draft mode does not mutate', () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), { version: '1.0', tracker: { mode: 'atlassian' } });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  const statePath = path.join(fixtureDir, 'state.json');
  writeJson(statePath, {
    tracker: {
      items: [
        { id: 'ABC-2', key: 'ABC-2', title: 'Add logout button', labels: ['ai-state:ready-for-plan'], comments: [] }
      ]
    },
    docs: { pages: [] }
  });

  const res = runSim(['--json'], hostRoot);
  assert.equal(res.status, 0, res.stderr || res.stdout);
  const payload = JSON.parse(res.stdout);
  assert.equal(payload.execute, false);
  assertPlanShape(payload.plan);

  const stateAfter = readJson(statePath);
  assert.equal(stateAfter.docs.pages.length, 0);
  assert.equal(stateAfter.tracker.items[0].comments.length, 0);
  assert.deepEqual(stateAfter.tracker.items[0].labels, ['ai-state:ready-for-plan']);
});

test('simulate planning: execute mode creates spec, comments, relabels', () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), { version: '1.0', tracker: { mode: 'atlassian' } });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  const statePath = path.join(fixtureDir, 'state.json');
  writeJson(statePath, {
    tracker: {
      items: [
        { id: 'ABC-3', key: 'ABC-3', title: 'Add settings page', labels: ['ai-state:ready-for-plan'], comments: [] }
      ]
    },
    docs: { pages: [] }
  });

  const res = runSim(['--execute', '--json'], hostRoot);
  assert.equal(res.status, 0, res.stderr || res.stdout);
  const payload = JSON.parse(res.stdout);
  assert.equal(payload.execute, true);
  assertPlanShape(payload.plan);
  assert.ok(String(payload.specUrl || '').includes('https://fake.local/docs/'));

  const stateAfter = readJson(statePath);
  assert.equal(stateAfter.docs.pages.length, 1);
  assert.equal(stateAfter.tracker.items[0].comments.length, 2);
  assert.deepEqual(stateAfter.tracker.items[0].labels.sort(), ['ai-state:plan-review']);
});

