const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const { executionPlanMarkdown, EXECUTION_PLAN_START } = require('../scripts/agency/plan-artifact');

const repoRoot = path.resolve(__dirname, '..');
const wrapperScript = path.join(repoRoot, 'scripts', 'agency-cli.js');

function mkTempHost() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agency-host-'));
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
}

function runWrapper(args, hostRoot, extraEnv = {}) {
  return cp.spawnSync(process.execPath, [wrapperScript, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      AGENCY_HOST_ROOT: hostRoot,
      AGENCY_INTEGRATION_BACKEND: 'fake',
      ...extraEnv
    },
    encoding: 'utf8'
  });
}

function validPlan(id = 'ABC-1') {
  return {
    version: '1.0',
    ticket: { id, key: id, title: 'Plan target', url: null },
    acceptanceCriteria: ['AC-1'],
    filesToTouch: ['src/app.js'],
    steps: [{ id: '1', description: 'Implement', acRefs: ['AC-1'] }]
  };
}

function writeHostState(hostRoot, state) {
  writeJson(path.join(hostRoot, '.agency-project.json'), {
    version: '1.0',
    tracker: { mode: 'atlassian' },
    docs: { provider: 'repo', repo: { dir: 'docs/agency' } },
    scm: { provider: 'none' }
  });
  writeJson(path.join(hostRoot, '.agency-fixtures', 'state.json'), state);
}

test('agency wrapper: plan check reports valid linked execution plan', () => {
  const hostRoot = mkTempHost();
  const plan = validPlan('ABC-10');
  writeHostState(hostRoot, {
    tracker: {
      items: [
        { id: 'ABC-10', key: 'ABC-10', title: 'Plan target', labels: ['ai-state:approved'], comments: ['Spec: page-10 https://fake.local/docs/page-10'] }
      ]
    },
    docs: {
      pages: [
        { id: 'page-10', title: 'Spec: ABC-10', body: `Spec Status: APPROVED\n\n${executionPlanMarkdown(plan)}`, status: 'APPROVED', url: 'https://fake.local/docs/page-10' }
      ]
    },
    scm: { prs: [] }
  });

  const res = runWrapper(['plan', 'check', '--id', 'ABC-10'], hostRoot);
  assert.equal(res.status, 0, res.stderr || res.stdout);
  assert.match(res.stdout, /ABC-10: execution plan valid/);
});

test('agency wrapper: plan check exits non-zero for missing execution plan', () => {
  const hostRoot = mkTempHost();
  writeHostState(hostRoot, {
    tracker: {
      items: [
        { id: 'ABC-11', key: 'ABC-11', title: 'Missing plan', labels: ['ai-state:approved'], comments: ['Spec: page-11 https://fake.local/docs/page-11'] }
      ]
    },
    docs: {
      pages: [
        { id: 'page-11', title: 'Spec: ABC-11', body: 'Spec Status: APPROVED\n\nSummary', status: 'APPROVED', url: 'https://fake.local/docs/page-11' }
      ]
    },
    scm: { prs: [] }
  });

  const res = runWrapper(['plan', 'check', '--id', 'ABC-11'], hostRoot);
  assert.notEqual(res.status, 0);
  assert.match(res.stdout, /ABC-11: execution plan missing/);
});

test('agency wrapper: plan republish adds canonical markers to legacy plan section', () => {
  const hostRoot = mkTempHost();
  const plan = validPlan('ABC-12');
  writeHostState(hostRoot, {
    tracker: {
      items: [
        { id: 'ABC-12', key: 'ABC-12', title: 'Legacy plan', labels: ['ai-state:approved'], comments: ['Spec: page-12 https://fake.local/docs/page-12'] }
      ]
    },
    docs: {
      pages: [
        {
          id: 'page-12',
          title: 'Spec: ABC-12',
          body: `Spec Status: APPROVED\n\n## Execution Plan (JSON)\n\n\`\`\`json\n${JSON.stringify(plan, null, 2)}\n\`\`\``,
          status: 'APPROVED',
          url: 'https://fake.local/docs/page-12'
        }
      ]
    },
    scm: { prs: [] }
  });

  const res = runWrapper(['plan', 'republish', '--id', 'ABC-12'], hostRoot);
  assert.equal(res.status, 0, res.stderr || res.stdout);
  assert.match(res.stdout, /ABC-12: execution plan republished/);

  const state = JSON.parse(fs.readFileSync(path.join(hostRoot, '.agency-fixtures', 'state.json'), 'utf8'));
  assert.match(String(state.docs.pages[0].body || ''), new RegExp(EXECUTION_PLAN_START));
});

test('agency wrapper: workflow diagnose explains approved ticket readiness', () => {
  const hostRoot = mkTempHost();
  const plan = validPlan('ABC-13');
  writeHostState(hostRoot, {
    tracker: {
      items: [
        { id: 'ABC-13', key: 'ABC-13', title: 'Ready for dev', labels: ['ai-state:approved'], comments: ['Spec: page-13 https://fake.local/docs/page-13'] }
      ]
    },
    docs: {
      pages: [
        { id: 'page-13', title: 'Spec: ABC-13', body: `Spec Status: APPROVED\n\n${executionPlanMarkdown(plan)}`, status: 'APPROVED', url: 'https://fake.local/docs/page-13' }
      ]
    },
    scm: { prs: [] }
  });

  const res = runWrapper(['workflow', 'diagnose', '--id', 'ABC-13'], hostRoot);
  assert.equal(res.status, 0, res.stderr || res.stdout);
  assert.match(res.stdout, /Spec: APPROVED/);
  assert.match(res.stdout, /Execution plan: valid/);
  assert.match(res.stdout, /Missing gates: none/);
  assert.match(res.stdout, /Next: Developer Agent can start\./);
});

test('agency wrapper: workflow diagnose reports PR n/a when SCM is disabled', () => {
  const hostRoot = mkTempHost();
  const plan = validPlan('ABC-14');
  writeHostState(hostRoot, {
    tracker: {
      items: [
        { id: 'ABC-14', key: 'ABC-14', title: 'No SCM', labels: ['ai-state:approved'], comments: ['Spec: page-14 https://fake.local/docs/page-14'] }
      ]
    },
    docs: {
      pages: [
        { id: 'page-14', title: 'Spec: ABC-14', body: `Spec Status: APPROVED\n\n${executionPlanMarkdown(plan)}`, status: 'APPROVED', url: 'https://fake.local/docs/page-14' }
      ]
    },
    scm: { prs: [] }
  });

  const res = runWrapper(['workflow', 'diagnose', '--id', 'ABC-14'], hostRoot);
  assert.equal(res.status, 0, res.stderr || res.stdout);
  assert.match(res.stdout, /PR: n\/a/);
  assert.doesNotMatch(res.stdout, /PR: missing/);

  const jsonRes = runWrapper(['workflow', 'diagnose', '--id', 'ABC-14', '--json'], hostRoot);
  assert.equal(jsonRes.status, 0, jsonRes.stderr || jsonRes.stdout);
  const payload = JSON.parse(jsonRes.stdout);
  assert.equal(payload.pr.required, false);
  assert.equal(payload.pr.missing, false);
});

test('agency wrapper: open does not report future QA/review gates before development', () => {
  const hostRoot = mkTempHost();
  const plan = validPlan('ABC-15');
  writeHostState(hostRoot, {
    tracker: {
      items: [
        { id: 'ABC-15', key: 'ABC-15', title: 'Open ready', labels: ['ai-state:approved'], comments: ['Spec: page-15 https://fake.local/docs/page-15'] }
      ]
    },
    docs: {
      pages: [
        { id: 'page-15', title: 'Spec: ABC-15', body: `Spec Status: APPROVED\n\n${executionPlanMarkdown(plan)}`, status: 'APPROVED', url: 'https://fake.local/docs/page-15' }
      ]
    },
    scm: { prs: [] }
  });

  const res = runWrapper(['open', '--id', 'ABC-15'], hostRoot);
  assert.equal(res.status, 0, res.stderr || res.stdout);
  assert.doesNotMatch(res.stdout, /missing gates: .*qa verification/i);
  assert.doesNotMatch(res.stdout, /missing gates: .*code review/i);
  assert.match(res.stdout, /Next hint: ticket is ai-state:approved; run the Dev agent/);
});
