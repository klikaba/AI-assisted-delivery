const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const {
  EXECUTION_PLAN_START,
  EXECUTION_PLAN_END
} = require('../scripts/agency/plan-artifact');

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

test('agency cli: awaits async tracker search backends', () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), {
    version: '1.0',
    tracker: { mode: 'atlassian' }
  });
  writeJson(path.join(hostRoot, '.agency-fixtures', 'state.json'), {
    tracker: {
      items: [
        { id: 'ABC-1', key: 'ABC-1', title: 'Queued', labels: ['ai-state:ready-for-plan'], comments: [] }
      ]
    },
    docs: { pages: [] },
    scm: { prs: [] }
  });

  const res = runAgency(
    ['tracker', 'search', '--label', 'ai-state:ready-for-plan', '--json'],
    hostRoot,
    { AGENCY_INTEGRATION_BACKEND: 'fake' }
  );
  assert.equal(res.status, 0, res.stderr || res.stdout);

  const payload = JSON.parse(res.stdout);
  assert.equal(Array.isArray(payload.items), true);
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].key, 'ABC-1');
});

test('agency cli: tracker update modifies title and body on fake backend', () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), {
    version: '1.0',
    tracker: { mode: 'atlassian' }
  });
  writeJson(path.join(hostRoot, '.agency-fixtures', 'state.json'), {
    tracker: {
      items: [
        { id: 'ABC-2', key: 'ABC-2', title: 'Old title', body: 'Old body', labels: [], comments: [] }
      ]
    },
    docs: { pages: [] },
    scm: { prs: [] }
  });

  const res = runAgency(
    ['tracker', 'update', '--id', 'ABC-2', '--title', 'New title', '--body', 'New body', '--json'],
    hostRoot,
    { AGENCY_INTEGRATION_BACKEND: 'fake' }
  );
  assert.equal(res.status, 0, res.stderr || res.stdout);

  const payload = JSON.parse(res.stdout);
  assert.equal(payload.item.title, 'New title');
  assert.equal(payload.item.body, 'New body');
});

test('agency cli: plan publish/get round-trips on fake backend', () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), {
    version: '1.0',
    tracker: { mode: 'atlassian' }
  });
  writeJson(path.join(hostRoot, '.agency-fixtures', 'state.json'), {
    tracker: {
      items: [
        { id: 'ABC-3', key: 'ABC-3', title: 'Plan target', labels: [], comments: ['Spec: page-3 https://fake.local/docs/page-3'] }
      ]
    },
    docs: { pages: [{ id: 'page-3', title: 'Spec: ABC-3', body: 'Spec Status: DRAFT\n\nSummary', status: 'DRAFT', parentId: null, url: 'https://fake.local/docs/page-3' }] },
    scm: { prs: [] }
  });

  const planFile = path.join(hostRoot, 'plan.json');
  writeJson(planFile, {
    version: '1.0',
    ticket: { id: 'ABC-3', key: 'ABC-3', title: 'Plan target', url: null },
    acceptanceCriteria: ['AC-1'],
    filesToTouch: ['src/app.js'],
    steps: [{ id: '1', description: 'Implement', acRefs: ['AC-1'] }]
  });

  const pub = runAgency(
    ['plan', 'publish', '--id', 'ABC-3', '--file', planFile, '--json'],
    hostRoot,
    { AGENCY_INTEGRATION_BACKEND: 'fake' }
  );
  assert.equal(pub.status, 0, pub.stderr || pub.stdout);

  const get = runAgency(
    ['plan', 'get', '--id', 'ABC-3', '--json'],
    hostRoot,
    { AGENCY_INTEGRATION_BACKEND: 'fake' }
  );
  assert.equal(get.status, 0, get.stderr || get.stdout);
  const payload = JSON.parse(get.stdout);
  assert.equal(payload.found, true);
  assert.equal(payload.valid, true);
  assert.equal(payload.plan.ticket.id, 'ABC-3');
  assert.deepEqual(payload.plan.filesToTouch, ['src/app.js']);

  const spec = runAgency(
    ['docs', 'get', '--id', 'page-3', '--json'],
    hostRoot,
    { AGENCY_INTEGRATION_BACKEND: 'fake' }
  );
  assert.equal(spec.status, 0, spec.stderr || spec.stdout);
  const specPayload = JSON.parse(spec.stdout);
  assert.match(String(specPayload.page.body || ''), /Execution Plan \(JSON\)/);
  assert.match(String(specPayload.page.body || ''), new RegExp(EXECUTION_PLAN_START));
  assert.match(String(specPayload.page.body || ''), new RegExp(EXECUTION_PLAN_END));
});

test('agency cli: plan publish rejects ticket mismatch', () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), {
    version: '1.0',
    tracker: { mode: 'atlassian' }
  });
  writeJson(path.join(hostRoot, '.agency-fixtures', 'state.json'), {
    tracker: {
      items: [
        { id: 'ABC-4', key: 'ABC-4', title: 'Mismatch target', labels: [], comments: [] }
      ]
    },
    docs: { pages: [] },
    scm: { prs: [] }
  });

  const planFile = path.join(hostRoot, 'plan-mismatch.json');
  writeJson(planFile, {
    version: '1.0',
    ticket: { id: 'ABC-999', key: 'ABC-999', title: 'Wrong target', url: null },
    acceptanceCriteria: ['AC-1'],
    filesToTouch: ['src/app.js'],
    steps: [{ id: '1', description: 'Implement', acRefs: ['AC-1'] }]
  });

  const pub = runAgency(
    ['plan', 'publish', '--id', 'ABC-4', '--file', planFile, '--json'],
    hostRoot,
    { AGENCY_INTEGRATION_BACKEND: 'fake' }
  );
  assert.notEqual(pub.status, 0);
  assert.match(pub.stderr, /ticket mismatch/);
});

test('agency cli: plan publish accepts --spec-id before Jira spec comment exists', () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), {
    version: '1.0',
    tracker: { mode: 'atlassian' },
    docs: { provider: 'repo', repo: { dir: 'docs/agency' } }
  });
  writeJson(path.join(hostRoot, '.agency-fixtures', 'state.json'), {
    tracker: {
      items: [
        { id: 'ABC-5', key: 'ABC-5', title: 'First publish target', labels: [], comments: [] }
      ]
    },
    docs: {
      pages: [
        { id: 'page-5', title: 'Spec: ABC-5', status: 'DRAFT', body: 'Spec Status: DRAFT\n\nSummary', url: 'https://fake.local/docs/page-5' }
      ]
    },
    scm: { prs: [] }
  });

  const planFile = path.join(hostRoot, 'plan-first-publish.json');
  writeJson(planFile, {
    version: '1.0',
    ticket: { id: 'ABC-5', key: 'ABC-5', title: 'First publish target', url: null },
    acceptanceCriteria: ['AC-1'],
    filesToTouch: ['src/app.js'],
    steps: [{ id: '1', description: 'Implement', acRefs: ['AC-1'] }]
  });

  const pub = runAgency(
    ['plan', 'publish', '--id', 'ABC-5', '--spec-id', 'page-5', '--file', planFile, '--json'],
    hostRoot,
    { AGENCY_INTEGRATION_BACKEND: 'fake' }
  );
  assert.equal(pub.status, 0, pub.stderr || pub.stdout);

  const spec = runAgency(
    ['docs', 'get', '--id', 'page-5', '--json'],
    hostRoot,
    { AGENCY_INTEGRATION_BACKEND: 'fake' }
  );
  assert.equal(spec.status, 0, spec.stderr || spec.stdout);
  const specPayload = JSON.parse(spec.stdout);
  assert.match(String(specPayload.page.body || ''), /Execution Plan \(JSON\)/);

  const ticket = runAgency(
    ['tracker', 'get', '--id', 'ABC-5', '--json'],
    hostRoot,
    { AGENCY_INTEGRATION_BACKEND: 'fake' }
  );
  assert.equal(ticket.status, 0, ticket.stderr || ticket.stdout);
  const ticketPayload = JSON.parse(ticket.stdout);
  assert.equal(Array.isArray(ticketPayload.item.comments) ? ticketPayload.item.comments.length : 0, 0);
});
