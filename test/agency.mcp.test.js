const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { spawnAgencyMcp, createClient } = require('../testlib/helpers.mcp');

const repoRoot = path.resolve(__dirname, '..');

function mkTempHost() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agency-host-'));
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
}

test('agency mcp: initialize + tools/list + tools/call (fake)', async () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), { version: '1.0', tracker: { mode: 'atlassian' }, scm: { provider: 'github' } });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  writeJson(path.join(fixtureDir, 'state.json'), {
    tracker: { items: [{ id: 'ABC-99', key: 'ABC-99', title: 'MCP test', labels: ['ai-state:ready-for-plan'], comments: [] }] },
    docs: { pages: [] },
    scm: { prs: [] }
  });

  const proc = spawnAgencyMcp({
    repoRoot,
    env: { AGENCY_HOST_ROOT: hostRoot, AGENCY_INTEGRATION_BACKEND: 'fake' }
  });
  const client = createClient(proc);

  try {
    const init = await client.request('initialize', { protocolVersion: '2024-11-05' });
    assert.equal(init.result?.serverInfo?.name, 'agency');

    const list = await client.request('tools/list', {});
    const tools = list.result?.tools || [];
    assert.ok(tools.find((t) => t.name === 'capabilities.get'));
    assert.ok(tools.find((t) => t.name === 'agency.capabilities.get'));
    assert.ok(tools.find((t) => t.name === 'tracker.search'));
    assert.ok(tools.find((t) => t.name === 'agency.tracker.search'));
    assert.ok(tools.find((t) => t.name === 'docs.create'));
    assert.ok(tools.find((t) => t.name === 'agency.docs.create'));
    assert.ok(tools.find((t) => t.name === 'scm.pr_create'));
    assert.ok(tools.find((t) => t.name === 'agency.scm.pr_create'));
    assert.ok(tools.find((t) => t.name === 'workflow.summary'));
    assert.ok(tools.find((t) => t.name === 'agency.workflow.summary'));
    assert.ok(tools.find((t) => t.name === 'workflow.queue'));
    assert.ok(tools.find((t) => t.name === 'agency.workflow.queue'));
    assert.ok(tools.find((t) => t.name === 'workflow.gate_status'));
    assert.ok(tools.find((t) => t.name === 'agency.workflow.gate_status'));
    assert.ok(tools.find((t) => t.name === 'workflow.apply'));
    assert.ok(tools.find((t) => t.name === 'agency.workflow.apply'));
    assert.ok(tools.find((t) => t.name === 'workflow.sync_plan_review'));
    assert.ok(tools.find((t) => t.name === 'agency.workflow.sync_plan_review'));

    const caps = await client.request('tools/call', { name: 'capabilities.get', arguments: {} });
    const capsFirst = caps.result?.content?.[0];
    assert.equal(capsFirst.type, 'json');
    assert.equal(capsFirst.json.backends.tracker, 'fake');
    assert.equal(capsFirst.json.backends.docs, 'fake');
    assert.equal(capsFirst.json.backends.scm, 'fake');

    const call = await client.request('tools/call', {
      name: 'tracker.search',
      arguments: { labels: ['ai-state:ready-for-plan'] }
    });
    assert.ok(Array.isArray(call.result?.content));
    const first = call.result.content[0];
    assert.equal(first.type, 'json');
    assert.equal(first.json.items.length, 1);
    assert.equal(first.json.items[0].id, 'ABC-99');

    const prCreate = await client.request('tools/call', {
      name: 'scm.pr_create',
      arguments: { title: 'Test PR', body: 'Body', labels: ['ai'] }
    });
    const prFirst = prCreate.result?.content?.[0];
    assert.equal(prFirst.type, 'json');
    assert.equal(prFirst.json.pr.title, 'Test PR');
    assert.equal(prFirst.json.pr.labels.includes('ai'), true);

    const prompts = await client.request('prompts/list', {});
    assert.deepEqual(prompts.result?.prompts, []);
  } finally {
    proc.kill();
  }
});

test('agency mcp: newline framing compatibility (fake)', async () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), { version: '1.0', tracker: { mode: 'atlassian' }, scm: { provider: 'github' } });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  writeJson(path.join(fixtureDir, 'state.json'), {
    tracker: { items: [{ id: 'ABC-98', key: 'ABC-98', title: 'MCP newline test', labels: ['ai-state:ready-for-plan'], comments: [] }] },
    docs: { pages: [] },
    scm: { prs: [] }
  });

  const proc = spawnAgencyMcp({
    repoRoot,
    env: { AGENCY_HOST_ROOT: hostRoot, AGENCY_INTEGRATION_BACKEND: 'fake' }
  });

  function sendLine(obj) {
    proc.stdin.write(`${JSON.stringify(obj)}\n`);
  }

  let buf = '';
  const messages = [];
  proc.stdout.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    const parts = buf.split('\n');
    buf = parts.pop() || '';
    for (const p of parts) {
      const t = p.trim();
      if (!t) continue;
      messages.push(JSON.parse(t));
    }
  });

  function waitFor(id) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        const found = messages.find((m) => m.id === id);
        if (found) return resolve(found);
        if (Date.now() - start > 5000) return reject(new Error('timeout'));
        setTimeout(tick, 20);
      };
      tick();
    });
  }

  try {
    sendLine({ jsonrpc: '2.0', id: '1', method: 'initialize', params: { protocolVersion: '2024-11-05' } });
    const init = await waitFor('1');
    assert.equal(init.result?.serverInfo?.name, 'agency');

    sendLine({ jsonrpc: '2.0', id: '2', method: 'tools/list', params: {} });
    const list = await waitFor('2');
    const tools = list.result?.tools || [];
    assert.ok(tools.find((t) => t.name === 'capabilities.get'));
    assert.ok(tools.find((t) => t.name === 'tracker.search'));
    assert.ok(tools.find((t) => t.name === 'scm.pr_create'));

    sendLine({ jsonrpc: '2.0', id: '3', method: 'tools/call', params: { name: 'agency.tracker.search', arguments: { labels: ['ai-state:ready-for-plan'] } } });
    const call = await waitFor('3');
    const first = call.result?.content?.[0];
    assert.equal(first.type, 'json');
    assert.equal(first.json.items.length, 1);
    assert.equal(first.json.items[0].id, 'ABC-98');
  } finally {
    proc.kill();
  }
});

test('agency mcp: workflow.summary returns strict gate checklist (fake)', async () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), {
    version: '1.0',
    tracker: { mode: 'atlassian' },
    docs: { provider: 'repo', repo: { dir: 'docs/agency' } },
    scm: { provider: 'github' },
    workflow: { gates: { spec_approval: true, code_review: true, qa_verification: true } }
  });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  writeJson(path.join(fixtureDir, 'state.json'), {
    tracker: {
      items: [
        {
          id: 'ABC-1',
          key: 'ABC-1',
          title: 'Workflow summary test',
          labels: ['ai-state:approved'],
          comments: ['Spec: doc-1 docs/agency/doc-1.md', 'PR: https://github.com/acme/repo/pull/12']
        }
      ]
    },
    docs: { pages: [] },
    scm: { prs: [{ number: 12, title: 'ABC-1: Test', url: 'https://github.com/acme/repo/pull/12', state: 'OPEN', labels: [] }] }
  });

  // Seed a repo-backed doc to simulate approval state.
  const docsDir = path.join(hostRoot, 'docs', 'agency');
  writeJson(path.join(docsDir, 'doc-1.json'), { id: 'doc-1', title: 'Spec: ABC-1', status: 'APPROVED' });
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, 'doc-1.md'), 'Spec Status: APPROVED\n', 'utf8');

  const proc = spawnAgencyMcp({
    repoRoot,
    env: { AGENCY_HOST_ROOT: hostRoot, AGENCY_INTEGRATION_BACKEND: 'fake', AGENCY_DOCS_BACKEND: 'repo', AGENCY_SCM_BACKEND: 'fake' }
  });
  const client = createClient(proc);

  try {
    await client.request('initialize', { protocolVersion: '2024-11-05' });

    const sum = await client.request('tools/call', { name: 'workflow.summary', arguments: { id: 'ABC-1' } });
    const first = sum.result?.content?.[0];
    assert.equal(first.type, 'json');
    assert.equal(first.json.ticket.key, 'ABC-1');
    assert.equal(first.json.gates.spec_approval, true);
    assert.equal(first.json.evidence.spec.approved, true);
    assert.equal(first.json.evidence.pr.linked, true);
    assert.equal(Array.isArray(first.json.missing), true);
    // With only approved label present (no verified/reviewed), QA and review should be missing.
    assert.ok(first.json.missing.includes('qa verification'));
    assert.ok(first.json.missing.includes('code review'));
  } finally {
    proc.kill();
  }
});

test('agency mcp: workflow.queue returns summaries for matching tickets (fake)', async () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), {
    version: '1.0',
    tracker: { mode: 'atlassian' },
    docs: { provider: 'repo', repo: { dir: 'docs/agency' } },
    scm: { provider: 'github' },
    workflow: { gates: { spec_approval: true, code_review: true, qa_verification: true } }
  });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  writeJson(path.join(fixtureDir, 'state.json'), {
    tracker: {
      items: [
        {
          id: 'ABC-10',
          key: 'ABC-10',
          title: 'Queue item 1',
          labels: ['ai-state:ready-for-plan'],
          comments: []
        },
        {
          id: 'ABC-11',
          key: 'ABC-11',
          title: 'Queue item 2',
          labels: ['ai-state:ready-for-plan'],
          comments: ['Spec: doc-11 docs/agency/doc-11.md']
        }
      ]
    },
    docs: { pages: [] },
    scm: { prs: [] }
  });

  // Seed one repo-backed spec.
  const docsDir = path.join(hostRoot, 'docs', 'agency');
  fs.mkdirSync(docsDir, { recursive: true });
  writeJson(path.join(docsDir, 'doc-11.json'), { id: 'doc-11', title: 'Spec: ABC-11', status: 'DRAFT' });
  fs.writeFileSync(path.join(docsDir, 'doc-11.md'), 'Spec Status: DRAFT\n', 'utf8');

  const proc = spawnAgencyMcp({
    repoRoot,
    env: { AGENCY_HOST_ROOT: hostRoot, AGENCY_INTEGRATION_BACKEND: 'fake', AGENCY_DOCS_BACKEND: 'repo' }
  });
  const client = createClient(proc);

  try {
    await client.request('initialize', { protocolVersion: '2024-11-05' });
    const q = await client.request('tools/call', {
      name: 'workflow.queue',
      arguments: { labels: ['ai-state:ready-for-plan'], limit: 10 }
    });
    const first = q.result?.content?.[0];
    assert.equal(first.type, 'json');
    assert.equal(Array.isArray(first.json.items), true);
    assert.equal(first.json.items.length, 2);
    assert.ok(first.json.items.find((i) => i.ticket?.key === 'ABC-10'));
    const withSpec = first.json.items.find((i) => i.ticket?.key === 'ABC-11');
    assert.ok(withSpec?.evidence?.spec, 'Expected evidence.spec for ticket with Spec link');
  } finally {
    proc.kill();
  }
});

test('agency mcp: workflow.gate_status renders 5-line block (fake)', async () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), {
    version: '1.0',
    tracker: { mode: 'atlassian' },
    docs: { provider: 'repo', repo: { dir: 'docs/agency' } },
    scm: { provider: 'github' }
  });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  writeJson(path.join(fixtureDir, 'state.json'), {
    tracker: {
      items: [
        {
          id: 'ABC-777',
          key: 'ABC-777',
          title: 'Gate status test',
          labels: ['ai-state:approved'],
          comments: ['Spec: doc-777 docs/agency/doc-777.md']
        }
      ]
    },
    docs: { pages: [] },
    scm: { prs: [] }
  });

  const docsDir = path.join(hostRoot, 'docs', 'agency');
  fs.mkdirSync(docsDir, { recursive: true });
  writeJson(path.join(docsDir, 'doc-777.json'), { id: 'doc-777', title: 'Spec: ABC-777', status: 'APPROVED' });
  fs.writeFileSync(path.join(docsDir, 'doc-777.md'), 'Spec Status: APPROVED\n', 'utf8');

  const proc = spawnAgencyMcp({
    repoRoot,
    env: { AGENCY_HOST_ROOT: hostRoot, AGENCY_INTEGRATION_BACKEND: 'fake', AGENCY_DOCS_BACKEND: 'repo' }
  });
  const client = createClient(proc);

  try {
    await client.request('initialize', { protocolVersion: '2024-11-05' });
    const res = await client.request('tools/call', { name: 'workflow.gate_status', arguments: { id: 'ABC-777' } });
    const first = res.result?.content?.[0];
    assert.equal(first.type, 'json');
    assert.equal(Array.isArray(first.json.lines), true);
    assert.equal(first.json.lines.length, 5);
    assert.ok(first.json.lines[0].startsWith('Spec: '));
    assert.ok(first.json.lines[1].startsWith('PR: '));
    assert.ok(first.json.lines[2].startsWith('QA: '));
    assert.ok(first.json.lines[3].startsWith('Review: '));
    assert.ok(first.json.lines[4].startsWith('Next: '));
  } finally {
    proc.kill();
  }
});

test('agency mcp: workflow.apply enforces strict QA/Review markers (fake)', async () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), {
    version: '1.0',
    tracker: { mode: 'atlassian' },
    scm: { provider: 'github' }
  });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  writeJson(path.join(fixtureDir, 'state.json'), {
    tracker: {
      items: [
        {
          id: 'ABC-200',
          key: 'ABC-200',
          title: 'Apply test',
          labels: ['ai-state:in-qa'],
          comments: []
        }
      ]
    },
    docs: { pages: [] },
    scm: { prs: [] }
  });

  const proc = spawnAgencyMcp({
    repoRoot,
    env: { AGENCY_HOST_ROOT: hostRoot, AGENCY_INTEGRATION_BACKEND: 'fake' }
  });
  const client = createClient(proc);

  try {
    await client.request('initialize', { protocolVersion: '2024-11-05' });

    // Should fail: adding verified without QA: PASS marker.
    const bad = await client.request('tools/call', {
      name: 'workflow.apply',
      arguments: {
        id: 'ABC-200',
        actions: [
          { type: 'comment', body: 'Some note' },
          { type: 'set_labels', add: ['ai-state:verified'], remove: ['ai-state:in-qa'] }
        ]
      }
    });
    assert.ok(bad.error, 'Expected workflow.apply to fail');

    // Should pass with marker.
    const ok = await client.request('tools/call', {
      name: 'workflow.apply',
      arguments: {
        id: 'ABC-200',
        actions: [
          { type: 'comment', body: 'QA: PASS\nRan: npm test' },
          { type: 'set_labels', add: ['ai-state:verified'], remove: ['ai-state:in-qa'] }
        ]
      }
    });
    assert.ok(!ok.error, `Did not expect error: ${ok.error?.message || ''}`);
    const first = ok.result?.content?.[0];
    assert.equal(first.type, 'json');
    assert.equal(first.json.ok, true);

    const item = await client.request('tools/call', { name: 'tracker.get', arguments: { id: 'ABC-200' } });
    const itemFirst = item.result?.content?.[0];
    assert.equal(itemFirst.type, 'json');
    assert.ok(itemFirst.json.item.labels.includes('ai-state:verified'));
  } finally {
    proc.kill();
  }
});

test('agency mcp: workflow.sync_plan_review can dry-run and apply (fake)', async () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), {
    version: '1.0',
    tracker: { mode: 'atlassian' },
    docs: { provider: 'repo', repo: { dir: 'docs/agency' } },
    scm: { provider: 'github' }
  });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  writeJson(path.join(fixtureDir, 'state.json'), {
    tracker: {
      items: [
        { id: 'ABC-301', key: 'ABC-301', title: 'Plan review approved', labels: ['ai-state:plan-review'], comments: ['Spec: doc-301 docs/agency/doc-301.md'] },
        { id: 'ABC-302', key: 'ABC-302', title: 'Plan review changes', labels: ['ai-state:plan-review'], comments: ['Spec: doc-302 docs/agency/doc-302.md'] }
      ]
    },
    docs: { pages: [] },
    scm: { prs: [] }
  });

  const docsDir = path.join(hostRoot, 'docs', 'agency');
  fs.mkdirSync(docsDir, { recursive: true });
  writeJson(path.join(docsDir, 'doc-301.json'), { id: 'doc-301', title: 'Spec: ABC-301', status: 'APPROVED' });
  fs.writeFileSync(path.join(docsDir, 'doc-301.md'), 'Spec Status: APPROVED\n', 'utf8');
  writeJson(path.join(docsDir, 'doc-302.json'), { id: 'doc-302', title: 'Spec: ABC-302', status: 'CHANGES REQUESTED' });
  fs.writeFileSync(path.join(docsDir, 'doc-302.md'), 'Spec Status: CHANGES REQUESTED\n', 'utf8');

  const proc = spawnAgencyMcp({
    repoRoot,
    env: { AGENCY_HOST_ROOT: hostRoot, AGENCY_INTEGRATION_BACKEND: 'fake', AGENCY_DOCS_BACKEND: 'repo' }
  });
  const client = createClient(proc);

  try {
    await client.request('initialize', { protocolVersion: '2024-11-05' });

    const dry = await client.request('tools/call', { name: 'workflow.sync_plan_review', arguments: { dry_run: true } });
    const dryFirst = dry.result?.content?.[0];
    assert.equal(dryFirst.type, 'json');
    assert.equal(dryFirst.json.dry_run, true);
    assert.equal(dryFirst.json.items.length, 2);
    assert.ok(dryFirst.json.items.find((d) => d.ticket.key === 'ABC-301' && d.decision === 'approve'));
    assert.ok(dryFirst.json.items.find((d) => d.ticket.key === 'ABC-302' && d.decision === 'changes_requested'));

    await client.request('tools/call', { name: 'workflow.sync_plan_review', arguments: { dry_run: false } });

    const after1 = await client.request('tools/call', { name: 'tracker.get', arguments: { id: 'ABC-301' } });
    const a1 = after1.result?.content?.[0].json.item.labels;
    assert.ok(a1.includes('ai-state:approved'));
    assert.ok(!a1.includes('ai-state:plan-review'));

    const after2 = await client.request('tools/call', { name: 'tracker.get', arguments: { id: 'ABC-302' } });
    const a2 = after2.result?.content?.[0].json.item.labels;
    assert.ok(a2.includes('ai-state:ready-for-plan'));
    assert.ok(!a2.includes('ai-state:plan-review'));
  } finally {
    proc.kill();
  }
});

test('agency mcp: workflow.apply requires TestCases marker when TMS is enabled (fake)', async () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), {
    version: '1.0',
    tracker: { mode: 'atlassian' },
    tms: { provider: 'testrail' },
    scm: { provider: 'github' }
  });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  writeJson(path.join(fixtureDir, 'state.json'), {
    tracker: {
      items: [
        { id: 'ABC-500', key: 'ABC-500', title: 'TMS gate test', labels: ['ai-state:in-qa'], comments: [] }
      ]
    },
    docs: { pages: [] },
    scm: { prs: [] },
    tms: { suites: [], cases: [] }
  });

  const proc = spawnAgencyMcp({
    repoRoot,
    env: { AGENCY_HOST_ROOT: hostRoot, AGENCY_INTEGRATION_BACKEND: 'fake', AGENCY_TMS_BACKEND: 'fake' }
  });
  const client = createClient(proc);

  try {
    await client.request('initialize', { protocolVersion: '2024-11-05' });

    const bad = await client.request('tools/call', {
      name: 'workflow.apply',
      arguments: {
        id: 'ABC-500',
        actions: [
          { type: 'comment', body: 'QA: PASS' },
          { type: 'set_labels', add: ['ai-state:verified'], remove: ['ai-state:in-qa'] }
        ]
      }
    });
    assert.ok(bad.error, 'Expected workflow.apply to fail when TestCases marker is missing');

    // If the TestCases marker already exists on the ticket, applying verification should succeed.
    await client.request('tools/call', {
      name: 'tracker.comment',
      arguments: { id: 'ABC-500', body: 'TestCases: TestRail suite=123 section=456 cases=C1001' }
    });

    const okExisting = await client.request('tools/call', {
      name: 'workflow.apply',
      arguments: {
        id: 'ABC-500',
        actions: [
          { type: 'comment', body: 'QA: PASS\nRan: npm test' },
          { type: 'set_labels', add: ['ai-state:verified'], remove: ['ai-state:in-qa'] }
        ]
      }
    });
    assert.ok(!okExisting.error);

    const ok = await client.request('tools/call', {
      name: 'workflow.apply',
      arguments: {
        id: 'ABC-500',
        actions: [
          { type: 'comment', body: 'QA: PASS\nTestCases: TestRail suite=123 section=456 cases=C1001' },
          { type: 'set_labels', add: ['ai-state:verified'], remove: ['ai-state:in-qa'] }
        ]
      }
    });
    assert.ok(!ok.error);
  } finally {
    proc.kill();
  }
});
