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

function toolPayload(response) {
  const result = response?.result || {};
  if (result.structuredContent !== undefined) return result.structuredContent;
  const first = result.content?.[0];
  if (!first) return undefined;
  if (first.type === 'text') return JSON.parse(first.text);
  if (first.type === 'json') return first.json;
  return undefined;
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
    assert.ok(tools.find((t) => t.name === 'tracker.update'));
    assert.ok(tools.find((t) => t.name === 'agency.tracker.update'));
    assert.ok(tools.find((t) => t.name === 'plan.get'));
    assert.ok(tools.find((t) => t.name === 'agency.plan.get'));
    assert.ok(tools.find((t) => t.name === 'plan.publish'));
    assert.ok(tools.find((t) => t.name === 'agency.plan.publish'));
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
    assert.ok(tools.find((t) => t.name === 'workflow.qa_decide'));
    assert.ok(tools.find((t) => t.name === 'workflow.review_decide'));
    assert.ok(tools.find((t) => t.name === 'workflow.security_decide'));
    assert.ok(tools.find((t) => t.name === 'workflow.release'));

    const caps = await client.request('tools/call', { name: 'capabilities.get', arguments: {} });
    const capsFirst = caps.result?.content?.[0];
    assert.equal(capsFirst.type, 'text');
    const capsPayload = toolPayload(caps);
    assert.equal(capsPayload.backends.tracker, 'fake');
    assert.equal(capsPayload.backends.docs, 'fake');
    assert.equal(capsPayload.backends.scm, 'fake');
    assert.equal(capsPayload.tracker.update, true);
    assert.equal(capsPayload.plan.get, true);
    assert.equal(capsPayload.plan.publish, true);

    const call = await client.request('tools/call', {
      name: 'tracker.search',
      arguments: { labels: ['ai-state:ready-for-plan'] }
    });
    assert.ok(Array.isArray(call.result?.content));
    const first = call.result.content[0];
    assert.equal(first.type, 'text');
    const callPayload = toolPayload(call);
    assert.equal(callPayload.items.length, 1);
    assert.equal(callPayload.items[0].id, 'ABC-99');

    const prCreate = await client.request('tools/call', {
      name: 'scm.pr_create',
      arguments: { title: 'Test PR', body: 'Body', labels: ['ai'] }
    });
    const prFirst = prCreate.result?.content?.[0];
    assert.equal(prFirst.type, 'text');
    const prPayload = toolPayload(prCreate);
    assert.equal(prPayload.pr.title, 'Test PR');
    assert.equal(prPayload.pr.labels.includes('ai'), true);

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
    assert.equal(first.type, 'text');
    const callPayload = toolPayload(call);
    assert.equal(callPayload.items.length, 1);
    assert.equal(callPayload.items[0].id, 'ABC-98');
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
    assert.equal(first.type, 'text');
    const sumPayload = toolPayload(sum);
    assert.equal(sumPayload.ticket.key, 'ABC-1');
    assert.equal(sumPayload.gates.spec_approval, true);
    assert.equal(sumPayload.evidence.spec.approved, true);
    assert.equal(sumPayload.evidence.pr.linked, true);
    assert.equal(Array.isArray(sumPayload.missing), true);
    // With only approved label present (no verified/reviewed), QA and review should be missing.
    assert.ok(sumPayload.missing.includes('qa verification'));
    assert.ok(sumPayload.missing.includes('code review'));
  } finally {
    proc.kill();
  }
});

test('agency mcp: tracker.update modifies canonical tracker fields (fake)', async () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), { version: '1.0', tracker: { mode: 'atlassian' } });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  writeJson(path.join(fixtureDir, 'state.json'), {
    tracker: {
      items: [
        { id: 'ABC-11', key: 'ABC-11', title: 'Old title', body: 'Old body', labels: [], comments: [] }
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
    const res = await client.request('tools/call', {
      name: 'tracker.update',
      arguments: { id: 'ABC-11', title: 'Refined title', body: 'Refined body' }
    });
    const payload = toolPayload(res);
    assert.equal(payload.item.title, 'Refined title');
    assert.equal(payload.item.body, 'Refined body');
  } finally {
    proc.kill();
  }
});

test('agency mcp: plan.publish + plan.get expose canonical execution plan (fake)', async () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), { version: '1.0', tracker: { mode: 'atlassian' }, docs: { provider: 'repo', repo: { dir: 'docs/agency' } } });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  writeJson(path.join(fixtureDir, 'state.json'), {
    tracker: {
      items: [
        { id: 'ABC-12', key: 'ABC-12', title: 'Plan MCP', labels: [], comments: [] }
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

    const created = await client.request('tools/call', {
      name: 'docs.create',
      arguments: { title: 'Spec: ABC-12', body: 'Spec Status: DRAFT\n\nSummary', status: 'DRAFT' }
    });
    const createdPayload = toolPayload(created);
    const specId = createdPayload.page.id;
    const specUrl = createdPayload.page.url;
    await client.request('tools/call', {
      name: 'tracker.comment',
      arguments: { id: 'ABC-12', body: `Spec: ${specId} ${specUrl}` }
    });

    const plan = {
      version: '1.0',
      ticket: { id: 'ABC-12', key: 'ABC-12', title: 'Plan MCP', url: null },
      acceptanceCriteria: ['AC-1'],
      filesToTouch: ['src/app.js'],
      steps: [{ id: '1', description: 'Implement', acRefs: ['AC-1'] }]
    };

    const pub = await client.request('tools/call', { name: 'plan.publish', arguments: { id: 'ABC-12', plan } });
    const pubPayload = toolPayload(pub);
    assert.equal(pubPayload.published, true);
    assert.equal(pubPayload.spec.id, specId);

    const get = await client.request('tools/call', { name: 'plan.get', arguments: { id: 'ABC-12' } });
    const getPayload = toolPayload(get);
    assert.equal(getPayload.found, true);
    assert.equal(getPayload.valid, true);
    assert.deepEqual(getPayload.plan.filesToTouch, ['src/app.js']);

    const ticket = await client.request('tools/call', { name: 'tracker.get', arguments: { id: 'ABC-12' } });
    const ticketPayload = toolPayload(ticket);
    assert.equal(ticketPayload.item.comments.length, 1);
    assert.match(String(ticketPayload.item.comments[0] || ''), /^Spec:/);

    const spec = await client.request('tools/call', { name: 'docs.get', arguments: { id: specId } });
    const specPayload = toolPayload(spec);
    assert.match(String(specPayload.page.body || ''), /Execution Plan \(JSON\)/);
  } finally {
    proc.kill();
  }
});

test('agency mcp: plan.publish accepts explicit spec_id before Jira spec comment exists (fake)', async () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), { version: '1.0', tracker: { mode: 'atlassian' }, docs: { provider: 'repo', repo: { dir: 'docs/agency' } } });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  writeJson(path.join(fixtureDir, 'state.json'), {
    tracker: {
      items: [
        { id: 'ABC-12A', key: 'ABC-12A', title: 'Plan MCP first publish', labels: [], comments: [] }
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

    const created = await client.request('tools/call', {
      name: 'docs.create',
      arguments: { title: 'Spec: ABC-12A', body: 'Spec Status: DRAFT\n\nSummary', status: 'DRAFT' }
    });
    const createdPayload = toolPayload(created);
    const specId = createdPayload.page.id;

    const plan = {
      version: '1.0',
      ticket: { id: 'ABC-12A', key: 'ABC-12A', title: 'Plan MCP first publish', url: null },
      acceptanceCriteria: ['AC-1'],
      filesToTouch: ['src/app.js'],
      steps: [{ id: '1', description: 'Implement', acRefs: ['AC-1'] }]
    };

    const pub = await client.request('tools/call', {
      name: 'plan.publish',
      arguments: { id: 'ABC-12A', spec_id: specId, plan }
    });
    const pubPayload = toolPayload(pub);
    assert.equal(pubPayload.published, true);
    assert.equal(pubPayload.spec.id, specId);

    const get = await client.request('tools/call', { name: 'plan.get', arguments: { id: 'ABC-12A' } });
    const getPayload = toolPayload(get);
    assert.equal(getPayload.found, false);

    const spec = await client.request('tools/call', { name: 'docs.get', arguments: { id: specId } });
    const specPayload = toolPayload(spec);
    assert.match(String(specPayload.page.body || ''), /Execution Plan \(JSON\)/);

    const ticket = await client.request('tools/call', { name: 'tracker.get', arguments: { id: 'ABC-12A' } });
    const ticketPayload = toolPayload(ticket);
    assert.equal(ticketPayload.item.comments.length, 0);
  } finally {
    proc.kill();
  }
});

test('agency mcp: plan.publish rejects ticket mismatch (fake)', async () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), { version: '1.0', tracker: { mode: 'atlassian' } });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  writeJson(path.join(fixtureDir, 'state.json'), {
    tracker: {
      items: [
        { id: 'ABC-13', key: 'ABC-13', title: 'Plan mismatch', labels: [], comments: [] }
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

    const plan = {
      version: '1.0',
      ticket: { id: 'ABC-999', key: 'ABC-999', title: 'Wrong target', url: null },
      acceptanceCriteria: ['AC-1'],
      filesToTouch: ['src/app.js'],
      steps: [{ id: '1', description: 'Implement', acRefs: ['AC-1'] }]
    };

    const res = await client.request('tools/call', { name: 'plan.publish', arguments: { id: 'ABC-13', plan } });
    assert.ok(res.error);
    assert.match(String(res.error.message || ''), /ticket mismatch/);
  } finally {
    proc.kill();
  }
});

test('agency mcp: non-canonical plan comments do not count as execution plan (fake)', async () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), { version: '1.0', tracker: { mode: 'atlassian' } });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  writeJson(path.join(fixtureDir, 'state.json'), {
    tracker: {
      items: [
        {
          id: 'ABC-14',
          key: 'ABC-14',
          title: 'Non canonical plan comment',
          labels: ['ai-state:approved'],
          comments: [
            'Spec: doc-14 docs/agency/doc-14.md',
            'Test Plan: verify this manually {\"foo\":\"bar\"}'
          ]
        }
      ]
    },
    docs: { pages: [] },
    scm: { prs: [] }
  });

  const docsDir = path.join(hostRoot, 'docs', 'agency');
  writeJson(path.join(docsDir, 'doc-14.json'), { id: 'doc-14', title: 'Spec: ABC-14', status: 'APPROVED' });
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, 'doc-14.md'), 'Spec Status: APPROVED\n', 'utf8');

  const proc = spawnAgencyMcp({
    repoRoot,
    env: { AGENCY_HOST_ROOT: hostRoot, AGENCY_INTEGRATION_BACKEND: 'fake', AGENCY_DOCS_BACKEND: 'repo' }
  });
  const client = createClient(proc);

  try {
    await client.request('initialize', { protocolVersion: '2024-11-05' });
    const sum = await client.request('tools/call', { name: 'workflow.summary', arguments: { id: 'ABC-14' } });
    const payload = toolPayload(sum);
    assert.equal(payload.evidence.plan.linked, false);
    assert.ok(payload.missing.includes('execution plan'));
  } finally {
    proc.kill();
  }
});

test('agency mcp: workflow.summary prefers execution plan stored on linked spec (fake)', async () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), { version: '1.0', tracker: { mode: 'atlassian' }, docs: { provider: 'repo', repo: { dir: 'docs/agency' } } });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  writeJson(path.join(fixtureDir, 'state.json'), {
    tracker: {
      items: [
        {
          id: 'ABC-15',
          key: 'ABC-15',
          title: 'Plan stored on spec',
          labels: ['ai-state:approved'],
          comments: ['Spec: doc-15 docs/agency/doc-15.md']
        }
      ]
    },
    docs: { pages: [] },
    scm: { prs: [] }
  });

  const docsDir = path.join(hostRoot, 'docs', 'agency');
  writeJson(path.join(docsDir, 'doc-15.json'), { id: 'doc-15', title: 'Spec: ABC-15', status: 'APPROVED' });
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(
    path.join(docsDir, 'doc-15.md'),
    [
      'Spec Status: APPROVED',
      '',
      '## Summary',
      'Spec body',
      '',
      '## Execution Plan (JSON)',
      '',
      '```json',
      JSON.stringify({
        version: '1.0',
        ticket: { id: 'ABC-15', key: 'ABC-15', title: 'Plan stored on spec', url: null },
        acceptanceCriteria: ['AC-1'],
        filesToTouch: ['src/spec.js'],
        steps: [{ id: '1', description: 'Implement', acRefs: ['AC-1'] }]
      }, null, 2),
      '```'
    ].join('\n'),
    'utf8'
  );

  const proc = spawnAgencyMcp({
    repoRoot,
    env: { AGENCY_HOST_ROOT: hostRoot, AGENCY_INTEGRATION_BACKEND: 'fake', AGENCY_DOCS_BACKEND: 'repo' }
  });
  const client = createClient(proc);

  try {
    await client.request('initialize', { protocolVersion: '2024-11-05' });
    const sum = await client.request('tools/call', { name: 'workflow.summary', arguments: { id: 'ABC-15' } });
    const payload = toolPayload(sum);
    assert.equal(payload.evidence.plan.linked, true);
    assert.equal(payload.evidence.plan.valid, true);
    assert.equal(payload.evidence.plan.ref.marker, 'docs');
    assert.deepEqual(payload.evidence.plan.plan.filesToTouch, ['src/spec.js']);
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
    assert.equal(first.type, 'text');
    const queuePayload = toolPayload(q);
    assert.equal(Array.isArray(queuePayload.items), true);
    assert.equal(queuePayload.items.length, 2);
    assert.ok(queuePayload.items.find((i) => i.ticket?.key === 'ABC-10'));
    const withSpec = queuePayload.items.find((i) => i.ticket?.key === 'ABC-11');
    assert.ok(withSpec?.evidence?.spec, 'Expected evidence.spec for ticket with Spec link');
  } finally {
    proc.kill();
  }
});

test('agency mcp: workflow.gate_status reports PR as n/a when scm is disabled', async () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), {
    version: '1.0',
    tracker: { mode: 'atlassian' },
    docs: { provider: 'repo', repo: { dir: 'docs/agency' } },
    scm: { provider: 'none' }
  });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  writeJson(path.join(fixtureDir, 'state.json'), {
    tracker: {
      items: [
        {
          id: 'ABC-20',
          key: 'ABC-20',
          title: 'SCM disabled workflow test',
          labels: ['ai-state:in-qa'],
          comments: ['Spec: doc-20 docs/agency/doc-20.md']
        }
      ]
    },
    docs: { pages: [] },
    scm: { prs: [] }
  });

  const docsDir = path.join(hostRoot, 'docs', 'agency');
  writeJson(path.join(docsDir, 'doc-20.json'), { id: 'doc-20', title: 'Spec: ABC-20', status: 'APPROVED' });
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, 'doc-20.md'), 'Spec Status: APPROVED\n', 'utf8');

  const proc = spawnAgencyMcp({
    repoRoot,
    env: { AGENCY_HOST_ROOT: hostRoot, AGENCY_INTEGRATION_BACKEND: 'fake', AGENCY_DOCS_BACKEND: 'fake', AGENCY_SCM_BACKEND: 'none' }
  });
  const client = createClient(proc);

  try {
    await client.request('initialize', { protocolVersion: '2024-11-05' });

    const res = await client.request('tools/call', { name: 'workflow.gate_status', arguments: { id: 'ABC-20' } });
    const payload = toolPayload(res);
    assert.equal(payload.lines[1], 'PR: n/a');
    assert.equal(payload.summary.evidence.pr.required, false);
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
    assert.equal(first.type, 'text');
    const gatePayload = toolPayload(res);
    assert.equal(Array.isArray(gatePayload.lines), true);
    assert.equal(gatePayload.lines.length, 5);
    assert.ok(gatePayload.lines[0].startsWith('Spec: '));
    assert.ok(gatePayload.lines[1].startsWith('PR: '));
    assert.ok(gatePayload.lines[2].startsWith('QA: '));
    assert.ok(gatePayload.lines[3].startsWith('Review: '));
    assert.ok(gatePayload.lines[4].startsWith('Next: '));
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
          { type: 'set_labels', add: ['ai-state:verified'], remove: ['ai-state:in-qa'] },
          { type: 'comment', body: 'Some note' }
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
          { type: 'set_labels', add: ['ai-state:verified'], remove: ['ai-state:in-qa'] },
          { type: 'comment', body: 'QA: PASS\nRan: npm test' }
        ]
      }
    });
    assert.ok(!ok.error, `Did not expect error: ${ok.error?.message || ''}`);
    const first = ok.result?.content?.[0];
    assert.equal(first.type, 'text');
    const okPayload = toolPayload(ok);
    assert.equal(okPayload.ok, true);

    const item = await client.request('tools/call', { name: 'tracker.get', arguments: { id: 'ABC-200' } });
    const itemFirst = item.result?.content?.[0];
    assert.equal(itemFirst.type, 'text');
    const itemPayload = toolPayload(item);
    assert.ok(itemPayload.item.labels.includes('ai-state:verified'));
  } finally {
    proc.kill();
  }
});

test('agency mcp: workflow.apply strict mode allows only one final comment action (fake)', async () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), {
    version: '1.0',
    tracker: { mode: 'atlassian' },
    scm: { provider: 'none' }
  });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  writeJson(path.join(fixtureDir, 'state.json'), {
    tracker: {
      items: [
        {
          id: 'ABC-40',
          key: 'ABC-40',
          title: 'Strict workflow apply test',
          labels: ['ai-state:approved'],
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

    const tooMany = await client.request('tools/call', {
      name: 'workflow.apply',
      arguments: {
        id: 'ABC-40',
        strict: true,
        actions: [
          { type: 'comment', body: 'first' },
          { type: 'set_labels', remove: ['ai-state:approved'], add: ['ai-state:in-qa'] },
          { type: 'comment', body: 'second' }
        ]
      }
    });
    assert.match(String(tooMany.error?.message || ''), /only one comment action is allowed/);

    const notLast = await client.request('tools/call', {
      name: 'workflow.apply',
      arguments: {
        id: 'ABC-40',
        strict: true,
        actions: [
          { type: 'comment', body: 'not last' },
          { type: 'set_labels', remove: ['ai-state:approved'], add: ['ai-state:in-qa'] }
        ]
      }
    });
    assert.match(String(notLast.error?.message || ''), /comment action must be the last action/);

    const ok = await client.request('tools/call', {
      name: 'workflow.apply',
      arguments: {
        id: 'ABC-40',
        strict: true,
        actions: [
          { type: 'set_labels', remove: ['ai-state:approved'], add: ['ai-state:in-qa'] },
          { type: 'comment', body: 'single final comment' }
        ]
      }
    });
    const payload = toolPayload(ok);
    assert.equal(payload.ok, true);
  } finally {
    proc.kill();
  }
});

test('agency mcp: workflow.apply accepts labels as alias for set_labels (fake)', async () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), {
    version: '1.0',
    tracker: { mode: 'atlassian' },
    scm: { provider: 'none' }
  });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  writeJson(path.join(fixtureDir, 'state.json'), {
    tracker: {
      items: [
        {
          id: 'ABC-41',
          key: 'ABC-41',
          title: 'Workflow labels alias test',
          labels: ['ai-state:approved'],
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

    const ok = await client.request('tools/call', {
      name: 'workflow.apply',
      arguments: {
        id: 'ABC-41',
        strict: true,
        actions: [
          { type: 'labels', remove: ['ai-state:approved'], add: ['ai-state:in-qa'] },
          { type: 'comment', body: 'single final comment' }
        ]
      }
    });
    const payload = toolPayload(ok);
    assert.equal(payload.ok, true);

    const item = await client.request('tools/call', { name: 'tracker.get', arguments: { id: 'ABC-41' } });
    const itemPayload = toolPayload(item);
    assert.ok(itemPayload.item.labels.includes('ai-state:in-qa'));
    assert.ok(!itemPayload.item.labels.includes('ai-state:approved'));
  } finally {
    proc.kill();
  }
});

test('agency mcp: workflow.apply skips duplicate final comments across retries (fake)', async () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), {
    version: '1.0',
    tracker: { mode: 'atlassian' },
    scm: { provider: 'none' }
  });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  writeJson(path.join(fixtureDir, 'state.json'), {
    tracker: {
      items: [
        {
          id: 'ABC-42',
          key: 'ABC-42',
          title: 'Workflow duplicate comment test',
          labels: ['ai-state:approved'],
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

    const first = await client.request('tools/call', {
      name: 'workflow.apply',
      arguments: {
        id: 'ABC-42',
        strict: true,
        actions: [
          { type: 'labels', remove: ['ai-state:approved'], add: ['ai-state:in-qa'] },
          { type: 'comment', body: 'Implementation Complete:\nFiles changed: src/app.js' }
        ]
      }
    });
    assert.equal(toolPayload(first).ok, true);

    const second = await client.request('tools/call', {
      name: 'workflow.apply',
      arguments: {
        id: 'ABC-42',
        strict: true,
        actions: [
          { type: 'labels', remove: [], add: [] },
          { type: 'comment', body: 'Implementation Complete:\nFiles changed: src/app.js' }
        ]
      }
    });
    const secondPayload = toolPayload(second);
    assert.equal(secondPayload.ok, true);
    assert.equal(secondPayload.results[1].skipped, true);
    assert.equal(secondPayload.results[1].reason, 'duplicate_comment');

    const item = await client.request('tools/call', { name: 'tracker.get', arguments: { id: 'ABC-42' } });
    const itemPayload = toolPayload(item);
    assert.equal(itemPayload.item.comments.length, 1);
    assert.equal(itemPayload.item.comments[0], 'Implementation Complete:\nFiles changed: src/app.js');
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
    assert.equal(dryFirst.type, 'text');
    const dryPayload = toolPayload(dry);
    assert.equal(dryPayload.dry_run, true);
    assert.equal(dryPayload.items.length, 2);
    assert.ok(dryPayload.items.find((d) => d.ticket.key === 'ABC-301' && d.decision === 'approve'));
    assert.ok(dryPayload.items.find((d) => d.ticket.key === 'ABC-302' && d.decision === 'changes_requested'));

    await client.request('tools/call', { name: 'workflow.sync_plan_review', arguments: { dry_run: false } });

    const after1 = await client.request('tools/call', { name: 'tracker.get', arguments: { id: 'ABC-301' } });
    const a1 = toolPayload(after1).item.labels;
    assert.ok(a1.includes('ai-state:approved'));
    assert.ok(!a1.includes('ai-state:plan-review'));

    const after2 = await client.request('tools/call', { name: 'tracker.get', arguments: { id: 'ABC-302' } });
    const a2 = toolPayload(after2).item.labels;
    assert.ok(a2.includes('ai-state:ready-for-plan'));
    assert.ok(!a2.includes('ai-state:plan-review'));
  } finally {
    proc.kill();
  }
});

test('agency mcp: workflow.qa_decide handles pass and fail transitions (fake)', async () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), {
    version: '1.0',
    tracker: { mode: 'atlassian' },
    tms: { provider: 'testrail' }
  });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  writeJson(path.join(fixtureDir, 'state.json'), {
    tracker: {
      items: [
        { id: 'ABC-351', key: 'ABC-351', title: 'QA pass', labels: ['ai-state:in-qa'], comments: [] },
        { id: 'ABC-352', key: 'ABC-352', title: 'QA fail', labels: ['ai-state:in-qa'], comments: [] }
      ]
    },
    docs: { pages: [] },
    scm: { prs: [] },
    tms: { suites: [], cases: [] }
  });

  const proc = spawnAgencyMcp({
    repoRoot,
    env: { AGENCY_HOST_ROOT: hostRoot, AGENCY_INTEGRATION_BACKEND: 'fake', AGENCY_TMS_BACKEND: 'fake', AGENCY_SCM_BACKEND: 'none' }
  });
  const client = createClient(proc);

  try {
    await client.request('initialize', { protocolVersion: '2024-11-05' });

    const pass = await client.request('tools/call', {
      name: 'workflow.qa_decide',
      arguments: { id: 'ABC-351', decision: 'pass', testcases: 'TestRail suite=12 section=34 cases=C1001', comment: 'Automation passed.' }
    });
    assert.ok(!pass.error);
    const passItem = toolPayload(await client.request('tools/call', { name: 'tracker.get', arguments: { id: 'ABC-351' } })).item;
    assert.ok(passItem.labels.includes('ai-state:verified'));
    assert.ok(!passItem.labels.includes('ai-state:in-qa'));
    assert.ok(passItem.comments.some((c) => String(c).includes('QA: PASS')));
    assert.ok(passItem.comments.some((c) => String(c).includes('TestCases: TestRail suite=12 section=34 cases=C1001')));

    const fail = await client.request('tools/call', {
      name: 'workflow.qa_decide',
      arguments: { id: 'ABC-352', decision: 'fail', comment: 'Regression in reconnect flow.' }
    });
    assert.ok(!fail.error);
    const failItem = toolPayload(await client.request('tools/call', { name: 'tracker.get', arguments: { id: 'ABC-352' } })).item;
    assert.ok(failItem.labels.includes('ai-state:approved'));
    assert.ok(!failItem.labels.includes('ai-state:in-qa'));
    assert.equal(failItem.status, 'In Progress');
    assert.ok(failItem.comments.some((c) => String(c).includes('QA: FAIL')));
  } finally {
    proc.kill();
  }
});

test('agency mcp: workflow.review_decide handles pass transition (fake)', async () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), {
    version: '1.0',
    tracker: { mode: 'atlassian' }
  });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  writeJson(path.join(fixtureDir, 'state.json'), {
    tracker: {
      items: [
        { id: 'ABC-361', key: 'ABC-361', title: 'Review pass', labels: ['ai-state:verified'], comments: [] }
      ]
    },
    docs: { pages: [] },
    scm: { prs: [] }
  });

  const proc = spawnAgencyMcp({
    repoRoot,
    env: { AGENCY_HOST_ROOT: hostRoot, AGENCY_INTEGRATION_BACKEND: 'fake', AGENCY_SCM_BACKEND: 'none' }
  });
  const client = createClient(proc);

  try {
    await client.request('initialize', { protocolVersion: '2024-11-05' });
    const res = await client.request('tools/call', {
      name: 'workflow.review_decide',
      arguments: { id: 'ABC-361', decision: 'pass', comment: 'Code quality is acceptable.' }
    });
    assert.ok(!res.error);
    const item = toolPayload(await client.request('tools/call', { name: 'tracker.get', arguments: { id: 'ABC-361' } })).item;
    assert.ok(item.labels.includes('ai-state:reviewed'));
    assert.ok(item.comments.some((c) => String(c).includes('Review: PASS')));
  } finally {
    proc.kill();
  }
});

test('agency mcp: workflow.security_decide handles fail transition (fake)', async () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), {
    version: '1.0',
    tracker: { mode: 'atlassian' },
    workflow: { gates: { security_audit: true } }
  });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  writeJson(path.join(fixtureDir, 'state.json'), {
    tracker: {
      items: [
        { id: 'ABC-371', key: 'ABC-371', title: 'Security fail', labels: ['ai-state:verified'], comments: [] }
      ]
    },
    docs: { pages: [] },
    scm: { prs: [] }
  });

  const proc = spawnAgencyMcp({
    repoRoot,
    env: { AGENCY_HOST_ROOT: hostRoot, AGENCY_INTEGRATION_BACKEND: 'fake', AGENCY_SCM_BACKEND: 'none' }
  });
  const client = createClient(proc);

  try {
    await client.request('initialize', { protocolVersion: '2024-11-05' });
    const res = await client.request('tools/call', {
      name: 'workflow.security_decide',
      arguments: { id: 'ABC-371', decision: 'fail', comment: 'Potential secret exposure.' }
    });
    assert.ok(!res.error);
    const item = toolPayload(await client.request('tools/call', { name: 'tracker.get', arguments: { id: 'ABC-371' } })).item;
    assert.ok(item.labels.includes('ai-state:security-fail'));
    assert.ok(item.labels.includes('ai-state:approved'));
    assert.ok(!item.labels.includes('ai-state:verified'));
    assert.equal(item.status, 'In Progress');
    assert.ok(item.comments.some((c) => String(c).includes('Security: FAIL')));
  } finally {
    proc.kill();
  }
});

test('agency mcp: workflow.release can dry-run and apply (fake)', async () => {
  const hostRoot = mkTempHost();
  writeJson(path.join(hostRoot, '.agency-project.json'), {
    version: '1.0',
    tracker: { mode: 'atlassian' },
    docs: { provider: 'repo', repo: { dir: 'docs/agency' } },
    workflow: { gates: { security_audit: true } }
  });

  const fixtureDir = path.join(hostRoot, '.agency-fixtures');
  writeJson(path.join(fixtureDir, 'state.json'), {
    tracker: {
      items: [
        {
          id: 'ABC-401',
          key: 'ABC-401',
          title: 'Release candidate',
          labels: ['ai-state:verified', 'ai-state:reviewed', 'ai-state:security-pass'],
          comments: []
        }
      ]
    },
    docs: { pages: [] },
    scm: { prs: [] }
  });

  const proc = spawnAgencyMcp({
    repoRoot,
    env: { AGENCY_HOST_ROOT: hostRoot, AGENCY_INTEGRATION_BACKEND: 'fake', AGENCY_DOCS_BACKEND: 'fake', AGENCY_SCM_BACKEND: 'none' }
  });
  const client = createClient(proc);

  try {
    await client.request('initialize', { protocolVersion: '2024-11-05' });

    const dry = await client.request('tools/call', { name: 'workflow.release', arguments: { id: 'ABC-401', dry_run: true } });
    const dryPayload = toolPayload(dry);
    assert.equal(dryPayload.ticket.key, 'ABC-401');
    assert.equal(dryPayload.release_notes.title, 'Release Notes: ABC-401');
    assert.equal(Array.isArray(dryPayload.actions), true);

    const apply = await client.request('tools/call', { name: 'workflow.release', arguments: { id: 'ABC-401', dry_run: false } });
    const applyPayload = toolPayload(apply);
    assert.equal(applyPayload.dry_run, false);

    const item = await client.request('tools/call', { name: 'tracker.get', arguments: { id: 'ABC-401' } });
    const itemPayload = toolPayload(item);
    assert.equal(itemPayload.item.status, 'Done');
    assert.deepEqual(itemPayload.item.labels, []);

    const state = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'state.json'), 'utf8'));
    assert.equal(state.docs.pages.length, 1);
    assert.equal(state.docs.pages[0].title, 'Release Notes: ABC-401');
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
          { type: 'set_labels', add: ['ai-state:verified'], remove: ['ai-state:in-qa'] },
          { type: 'comment', body: 'QA: PASS' }
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
          { type: 'set_labels', add: ['ai-state:verified'], remove: ['ai-state:in-qa'] },
          { type: 'comment', body: 'QA: PASS\nRan: npm test' }
        ]
      }
    });
    assert.ok(!okExisting.error);

    const ok = await client.request('tools/call', {
      name: 'workflow.apply',
      arguments: {
        id: 'ABC-500',
        actions: [
          { type: 'set_labels', add: ['ai-state:verified'], remove: ['ai-state:in-qa'] },
          { type: 'comment', body: 'QA: PASS\nTestCases: TestRail suite=123 section=456 cases=C1001' }
        ]
      }
    });
    assert.ok(!ok.error);
  } finally {
    proc.kill();
  }
});
