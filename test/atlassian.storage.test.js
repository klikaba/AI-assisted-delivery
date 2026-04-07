const assert = require('node:assert/strict');
const { test } = require('node:test');

const atlassian = require('../scripts/agency/backends/atlassian');

test('atlassian storage HTML renders headings, bullets, and code blocks while preserving spec status', () => {
  const body = [
    '# Summary',
    'Reconnect escalation is currently manual.',
    '',
    '## Scope',
    '- Escalate reconnecting beds after threshold',
    '- Highlight escalated rows in the queue',
    '',
    '```json',
    '{',
    '  "thresholdMinutes": 15',
    '}',
    '```'
  ].join('\n');

  const html = atlassian.__private.renderStorageHtml({ body, specStatus: 'APPROVED' });
  assert.match(html, /<h2>Approval Gate<\/h2>/);
  assert.match(html, /ac:structured-macro ac:name="panel"/);
  assert.match(html, /ac:parameter ac:name="bgColor">#E3FCEF<\/ac:parameter>/);
  assert.match(html, /<strong>Spec Status:<\/strong>\s*APPROVED/);
  assert.match(html, /<h1>Summary<\/h1>/);
  assert.match(html, /<h2>Scope<\/h2>/);
  assert.match(html, /<ul><li>Escalate reconnecting beds after threshold<\/li><li>Highlight escalated rows in the queue<\/li><\/ul>/);
  assert.match(html, /ac:structured-macro ac:name="code"/);
  assert.match(html, /ac:parameter ac:name="language">json<\/ac:parameter>/);
  assert.equal(atlassian.__private.extractSpecStatusFromStorage(html), 'APPROVED');
});

test('atlassian storage HTML escapes CDATA terminators inside code blocks', () => {
  const html = atlassian.__private.renderStorageHtml({
    body: ['```xml', '<tag>]]></tag>', '```'].join('\n'),
    specStatus: 'DRAFT'
  });

  assert.match(html, /<!\[CDATA\[/);
  assert.match(html, /]]><\/ac:plain-text-body>/);
  assert.match(html, /]]]]><!\[CDATA\[>/);
});

test('atlassian docs create and update send formatted storage HTML payloads', async () => {
  const originalEnv = {
    ATLASSIAN_SITE: process.env.ATLASSIAN_SITE,
    ATLASSIAN_EMAIL: process.env.ATLASSIAN_EMAIL,
    ATLASSIAN_API_TOKEN: process.env.ATLASSIAN_API_TOKEN,
    CONFLUENCE_SPACE_KEY: process.env.CONFLUENCE_SPACE_KEY
  };
  const originalFetch = global.fetch;

  process.env.ATLASSIAN_SITE = 'https://example.atlassian.net';
  process.env.ATLASSIAN_EMAIL = 'demo@example.test';
  process.env.ATLASSIAN_API_TOKEN = 'token';
  process.env.CONFLUENCE_SPACE_KEY = 'SD';

  const requests = [];
  global.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });

    if (String(url).endsWith('/rest/api/content') && options.method === 'POST') {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null },
        text: async () => JSON.stringify({
          id: '1001',
          title: 'Spec: SCRUM-7',
          _links: { base: 'https://example.atlassian.net/wiki', webui: '/spaces/SD/pages/1001' }
        })
      };
    }

    if (String(url).includes('/rest/api/content/1001?expand=body.storage,version,_links') && (!options.method || options.method === 'GET')) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null },
        text: async () => JSON.stringify({
          id: '1001',
          title: 'Spec: SCRUM-7',
          status: 'current',
          version: { number: 1 },
          body: {
            storage: {
              value: '<p><strong>Spec Status:</strong> DRAFT</p><p>Old body</p>'
            }
          },
          _links: { base: 'https://example.atlassian.net/wiki', webui: '/spaces/SD/pages/1001' }
        })
      };
    }

    if (String(url).endsWith('/rest/api/content/1001') && options.method === 'PUT') {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null },
        text: async () => JSON.stringify({
          id: '1001',
          title: 'Spec: SCRUM-7',
          _links: { base: 'https://example.atlassian.net/wiki', webui: '/spaces/SD/pages/1001' }
        })
      };
    }

    throw new Error(`Unexpected fetch: ${String(url)} ${String(options.method || 'GET')}`);
  };

  try {
    await atlassian.docs.create({
      title: 'Spec: SCRUM-7',
      status: 'DRAFT',
      body: ['# Summary', '- one', '```json', '{ "a": 1 }', '```'].join('\n')
    });

    await atlassian.docs.update({
      id: '1001',
      status: 'APPROVED',
      body: ['## Updated', '<x>]]></x>', '```xml', '<x>]]></x>', '```'].join('\n')
    });

    const createReq = requests.find((r) => r.url.endsWith('/rest/api/content') && r.options.method === 'POST');
    const createPayload = JSON.parse(String(createReq.options.body));
    const createHtml = createPayload.body.storage.value;
    assert.match(createHtml, /<h1>Summary<\/h1>/);
    assert.match(createHtml, /<ul><li>one<\/li><\/ul>/);
    assert.match(createHtml, /ac:parameter ac:name="language">json<\/ac:parameter>/);

    const updateReq = requests.find((r) => r.url.endsWith('/rest/api/content/1001') && r.options.method === 'PUT');
    const updatePayload = JSON.parse(String(updateReq.options.body));
    const updateHtml = updatePayload.body.storage.value;
    assert.match(updateHtml, /<h2>Approval Gate<\/h2>/);
    assert.match(updateHtml, /ac:structured-macro ac:name="panel"/);
    assert.match(updateHtml, /<strong>Spec Status:<\/strong>\s*APPROVED/);
    assert.match(updateHtml, /<h2>Updated<\/h2>/);
    assert.match(updateHtml, /ac:parameter ac:name="language">xml<\/ac:parameter>/);
    assert.match(updateHtml, /]]]]><!\[CDATA\[>/);
  } finally {
    global.fetch = originalFetch;
    process.env.ATLASSIAN_SITE = originalEnv.ATLASSIAN_SITE;
    process.env.ATLASSIAN_EMAIL = originalEnv.ATLASSIAN_EMAIL;
    process.env.ATLASSIAN_API_TOKEN = originalEnv.ATLASSIAN_API_TOKEN;
    process.env.CONFLUENCE_SPACE_KEY = originalEnv.CONFLUENCE_SPACE_KEY;
  }
});
