const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const agencyCli = path.join(repoRoot, 'scripts', 'agency.js');

function mkTempHost() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agency-host-'));
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
}

function runAgency(args, hostRoot) {
  const res = cp.spawnSync(
    process.execPath,
    [agencyCli, ...args],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        AGENCY_HOST_ROOT: hostRoot,
        AGENCY_INTEGRATION_BACKEND: 'fake'
      },
      encoding: 'utf8'
    }
  );
  return res;
}

test('simulated E2E (fake): plan flow updates tracker + creates doc', () => {
  const hostRoot = mkTempHost();

  // Mode doesn't matter for fake backend selection, but we model a realistic setup.
  writeJson(path.join(hostRoot, '.agency-project.json'), {
    version: '1.0',
    tracker: { mode: 'atlassian' }
  });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  writeJson(path.join(fixtureDir, 'state.json'), {
    tracker: {
      items: [
        {
          id: 'ABC-1',
          key: 'ABC-1',
          title: 'Add login button',
          url: 'https://fake.local/jira/browse/ABC-1',
          status: 'To Do',
          labels: ['ai-state:ready-for-plan'],
          body: 'As a user, I can log in.',
          comments: []
        }
      ]
    },
    docs: { pages: [] }
  });

  // 1) Search "ready for plan"
  const search = runAgency(['tracker', 'search', '--label', 'ai-state:ready-for-plan', '--json'], hostRoot);
  assert.equal(search.status, 0, search.stderr || search.stdout);
  const searchPayload = JSON.parse(search.stdout);
  assert.equal(searchPayload.items.length, 1);
  assert.equal(searchPayload.items[0].id, 'ABC-1');

  // 2) Create a draft doc (what the planner would do after approval)
  const create = runAgency(
    ['docs', 'create', '--title', 'Spec: ABC-1', '--body', 'DRAFT spec content', '--status', 'DRAFT', '--json'],
    hostRoot
  );
  assert.equal(create.status, 0, create.stderr || create.stdout);
  const createPayload = JSON.parse(create.stdout);
  assert.ok(createPayload.page?.id);
  assert.equal(createPayload.page.status, 'DRAFT');

  // 3) Comment ticket with link
  const comment = runAgency(
    ['tracker', 'comment', '--id', 'ABC-1', '--body', `Spec: ${createPayload.page.url}`, '--json'],
    hostRoot
  );
  assert.equal(comment.status, 0, comment.stderr || comment.stdout);

  // 4) Transition labels to plan-review
  const labels = runAgency(
    [
      'tracker',
      'set-labels',
      '--id',
      'ABC-1',
      '--remove',
      'ai-state:ready-for-plan',
      '--add',
      'ai-state:plan-review',
      '--json'
    ],
    hostRoot
  );
  assert.equal(labels.status, 0, labels.stderr || labels.stdout);
  const labelsPayload = JSON.parse(labels.stdout);
  assert.deepEqual(labelsPayload.labels, ['ai-state:plan-review']);

  // 5) Verify persisted state updated
  const state = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'state.json'), 'utf8'));
  assert.equal(state.tracker.items[0].comments.length, 1);
  assert.ok(String(state.tracker.items[0].comments[0]).includes('Spec: https://fake.local/docs/'));
  assert.deepEqual(state.tracker.items[0].labels.sort(), ['ai-state:plan-review']);
  assert.equal(state.docs.pages.length, 1);
});

