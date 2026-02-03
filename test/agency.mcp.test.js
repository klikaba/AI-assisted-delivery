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
    assert.ok(tools.find((t) => t.name === 'tracker.search'));
    assert.ok(tools.find((t) => t.name === 'agency.tracker.search'));
    assert.ok(tools.find((t) => t.name === 'docs.create'));
    assert.ok(tools.find((t) => t.name === 'agency.docs.create'));
    assert.ok(tools.find((t) => t.name === 'scm.pr_create'));
    assert.ok(tools.find((t) => t.name === 'agency.scm.pr_create'));

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
