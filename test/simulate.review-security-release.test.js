const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const reviewScript = path.join(repoRoot, 'scripts', 'simulate', 'review.js');
const securityScript = path.join(repoRoot, 'scripts', 'simulate', 'security-audit.js');
const releaseScript = path.join(repoRoot, 'scripts', 'simulate', 'release.js');

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

test('review pass + security pass + release', () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), { version: '1.0', tracker: { mode: 'atlassian' } });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  const statePath = path.join(fixtureDir, 'state.json');
  writeJson(statePath, {
    tracker: {
      items: [
        {
          id: 'ABC-30',
          key: 'ABC-30',
          title: 'Release me',
          labels: ['ai-state:verified'],
          comments: []
        }
      ]
    },
    docs: { pages: [] }
  });

  const review = run(reviewScript, ['--execute', '--pass', '--json'], hostRoot);
  assert.equal(review.status, 0, review.stderr || review.stdout);

  let state = readJson(statePath);
  assert.deepEqual(state.tracker.items[0].labels.sort(), ['ai-state:reviewed', 'ai-state:verified']);

  const security = run(securityScript, ['--execute', '--pass', '--json'], hostRoot);
  assert.equal(security.status, 0, security.stderr || security.stdout);

  state = readJson(statePath);
  assert.deepEqual(state.tracker.items[0].labels.sort(), ['ai-state:reviewed', 'ai-state:security-pass', 'ai-state:verified']);

  const release = run(releaseScript, ['--execute', '--json'], hostRoot);
  assert.equal(release.status, 0, release.stderr || release.stdout);

  state = readJson(statePath);
  assert.equal(state.docs.pages.length, 1);
  assert.deepEqual(state.tracker.items[0].labels, []);
});

test('review fail returns to approved', () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), { version: '1.0', tracker: { mode: 'atlassian' } });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  const statePath = path.join(fixtureDir, 'state.json');
  writeJson(statePath, {
    tracker: {
      items: [
        {
          id: 'ABC-31',
          key: 'ABC-31',
          title: 'Review fail',
          labels: ['ai-state:verified'],
          comments: []
        }
      ]
    },
    docs: { pages: [] }
  });

  const review = run(reviewScript, ['--execute', '--fail', '--json'], hostRoot);
  assert.equal(review.status, 0, review.stderr || review.stdout);

  const state = readJson(statePath);
  assert.deepEqual(state.tracker.items[0].labels.sort(), ['ai-state:approved', 'ai-state:review-fail']);
});

test('security fail returns to approved', () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), { version: '1.0', tracker: { mode: 'atlassian' } });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  const statePath = path.join(fixtureDir, 'state.json');
  writeJson(statePath, {
    tracker: {
      items: [
        {
          id: 'ABC-32',
          key: 'ABC-32',
          title: 'Security fail',
          labels: ['ai-state:verified'],
          comments: []
        }
      ]
    },
    docs: { pages: [] }
  });

  const security = run(securityScript, ['--execute', '--fail', '--json'], hostRoot);
  assert.equal(security.status, 0, security.stderr || security.stdout);

  const state = readJson(statePath);
  assert.deepEqual(state.tracker.items[0].labels.sort(), ['ai-state:approved', 'ai-state:security-fail']);
});

