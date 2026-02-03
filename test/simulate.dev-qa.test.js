const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const devScript = path.join(repoRoot, 'scripts', 'simulate', 'dev-complete.js');
const qaScript = path.join(repoRoot, 'scripts', 'simulate', 'qa-verify.js');

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

function run(script, args, hostRoot) {
  return cp.spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    env: { ...process.env, AGENCY_HOST_ROOT: hostRoot, AGENCY_INTEGRATION_BACKEND: 'fake' },
    encoding: 'utf8'
  });
}

test('dev complete + qa pass: approved -> in-qa -> verified', () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), { version: '1.0', tracker: { mode: 'atlassian' } });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  const statePath = path.join(fixtureDir, 'state.json');

  writeJson(statePath, {
    tracker: {
      items: [
        { id: 'ABC-20', key: 'ABC-20', title: 'Ship it', labels: ['ai-state:approved'], comments: [] }
      ]
    },
    docs: { pages: [] }
  });

  const dev = run(devScript, ['--execute', '--json'], hostRoot);
  assert.equal(dev.status, 0, dev.stderr || dev.stdout);

  let stateAfter = readJson(statePath);
  assert.deepEqual(stateAfter.tracker.items[0].labels.sort(), ['ai-state:in-qa']);
  assert.equal(stateAfter.tracker.items[0].comments.length, 1);

  const qa = run(qaScript, ['--execute', '--pass', '--json'], hostRoot);
  assert.equal(qa.status, 0, qa.stderr || qa.stdout);

  stateAfter = readJson(statePath);
  assert.deepEqual(stateAfter.tracker.items[0].labels.sort(), ['ai-state:verified']);
  assert.equal(stateAfter.tracker.items[0].comments.length, 2);
});

test('qa fail: in-qa -> approved', () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), { version: '1.0', tracker: { mode: 'atlassian' } });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  const statePath = path.join(fixtureDir, 'state.json');

  writeJson(statePath, {
    tracker: {
      items: [
        { id: 'ABC-21', key: 'ABC-21', title: 'Oops', labels: ['ai-state:in-qa'], comments: [] }
      ]
    },
    docs: { pages: [] }
  });

  const qa = run(qaScript, ['--execute', '--fail', '--json'], hostRoot);
  assert.equal(qa.status, 0, qa.stderr || qa.stdout);

  const stateAfter = readJson(statePath);
  assert.deepEqual(stateAfter.tracker.items[0].labels.sort(), ['ai-state:approved']);
  assert.equal(stateAfter.tracker.items[0].comments.length, 1);
});

