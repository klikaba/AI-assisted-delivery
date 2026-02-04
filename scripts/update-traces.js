const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const { writeTraceSnapshot } = require('../testlib/helpers.trace');

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

function update() {
  const scripts = {
    planning: path.join(repoRoot, 'scripts', 'simulate', 'planning.js'),
    pmSync: path.join(repoRoot, 'scripts', 'simulate', 'pm-sync.js'),
    devComplete: path.join(repoRoot, 'scripts', 'simulate', 'dev-complete.js'),
    qaPass: path.join(repoRoot, 'scripts', 'simulate', 'qa-verify.js'),
    reviewPass: path.join(repoRoot, 'scripts', 'simulate', 'review.js'),
    securityPass: path.join(repoRoot, 'scripts', 'simulate', 'security-audit.js'),
    release: path.join(repoRoot, 'scripts', 'simulate', 'release.js'),
    scmPr: path.join(repoRoot, 'scripts', 'simulate', 'scm-pr.js')
  };

  // Planning
  {
    const hostRoot = mkTempHost();
    buildFixtureState(hostRoot, {
      tracker: { items: [{ id: 'ABC-1', key: 'ABC-1', title: 'Plan', labels: ['ai-state:ready-for-plan'], comments: [] }] },
      docs: { pages: [] }
    });
    const payload = runSim(scripts.planning, ['--execute', '--json'], hostRoot);
    writeTraceSnapshot(path.join(tracesDir, 'planning.json'), payload);
  }

  // PM Sync
  {
    const hostRoot = mkTempHost();
    buildFixtureState(hostRoot, {
      tracker: {
        items: [
          { id: 'ABC-10', key: 'ABC-10', title: 'Approved', labels: ['ai-state:plan-review'], comments: ['Spec: page-a https://fake.local/docs/page-a'] }
        ]
      },
      docs: { pages: [{ id: 'page-a', title: 'Spec', body: 'x', status: 'APPROVED', url: 'https://fake.local/docs/page-a' }] }
    });
    const payload = runSim(scripts.pmSync, ['--execute', '--json'], hostRoot);
    writeTraceSnapshot(path.join(tracesDir, 'pm-sync.json'), payload);
  }

  // Dev complete
  {
    const hostRoot = mkTempHost();
    buildFixtureState(hostRoot, {
      tracker: { items: [{ id: 'ABC-20', key: 'ABC-20', title: 'Dev', labels: ['ai-state:approved'], comments: [] }] },
      docs: { pages: [] }
    });
    const payload = runSim(scripts.devComplete, ['--execute', '--json'], hostRoot);
    writeTraceSnapshot(path.join(tracesDir, 'dev-complete.json'), payload);
  }

  // QA pass
  {
    const hostRoot = mkTempHost();
    buildFixtureState(hostRoot, {
      tracker: { items: [{ id: 'ABC-21', key: 'ABC-21', title: 'QA', labels: ['ai-state:in-qa'], comments: [] }] },
      docs: { pages: [] }
    });
    const payload = runSim(scripts.qaPass, ['--execute', '--pass', '--json'], hostRoot);
    writeTraceSnapshot(path.join(tracesDir, 'qa-pass.json'), payload);
  }

  // Review pass
  {
    const hostRoot = mkTempHost();
    buildFixtureState(hostRoot, {
      tracker: { items: [{ id: 'ABC-30', key: 'ABC-30', title: 'Review', labels: ['ai-state:verified'], comments: [] }] },
      docs: { pages: [] }
    });
    const payload = runSim(scripts.reviewPass, ['--execute', '--pass', '--json'], hostRoot);
    writeTraceSnapshot(path.join(tracesDir, 'review-pass.json'), payload);
  }

  // Security pass
  {
    const hostRoot = mkTempHost();
    buildFixtureState(hostRoot, {
      tracker: { items: [{ id: 'ABC-31', key: 'ABC-31', title: 'Security', labels: ['ai-state:verified'], comments: [] }] },
      docs: { pages: [] }
    });
    const payload = runSim(scripts.securityPass, ['--execute', '--pass', '--json'], hostRoot);
    writeTraceSnapshot(path.join(tracesDir, 'security-pass.json'), payload);
  }

  // Release
  {
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
    const payload = runSim(scripts.release, ['--execute', '--json'], hostRoot);
    writeTraceSnapshot(path.join(tracesDir, 'release.json'), payload);
  }

  // SCM PR flow
  {
    const hostRoot = mkTempHost();
    buildFixtureState(hostRoot, {
      tracker: { items: [{ id: 'ABC-50', key: 'ABC-50', title: 'PR', labels: ['ai-state:approved'], comments: [] }] },
      docs: { pages: [] },
      scm: { prs: [] }
    });
    const payload = runSim(scripts.scmPr, ['--execute', '--json'], hostRoot);
    writeTraceSnapshot(path.join(tracesDir, 'scm-pr.json'), payload);
  }
}

update();
