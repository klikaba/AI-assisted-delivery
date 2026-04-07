const assert = require('node:assert/strict');
const { test } = require('node:test');

const atlassian = require('../scripts/agency/backends/atlassian');

test('atlassian transition name normalization is case-insensitive and whitespace-stable', () => {
  assert.equal(atlassian.__private.normalizeTransitionName('Selected for Development'), 'selected for development');
  assert.equal(atlassian.__private.normalizeTransitionName('  Selected   For   Development  '), 'selected for development');
  assert.equal(atlassian.__private.normalizeTransitionName('IN QA'), 'in qa');
});

test('atlassian tracker.transition matches target status ignoring case', async () => {
  const originalEnv = {
    ATLASSIAN_SITE: process.env.ATLASSIAN_SITE,
    ATLASSIAN_EMAIL: process.env.ATLASSIAN_EMAIL,
    ATLASSIAN_API_TOKEN: process.env.ATLASSIAN_API_TOKEN
  };
  const originalFetch = global.fetch;

  process.env.ATLASSIAN_SITE = 'https://example.atlassian.net';
  process.env.ATLASSIAN_EMAIL = 'demo@example.test';
  process.env.ATLASSIAN_API_TOKEN = 'token';

  const requests = [];
  global.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    const method = String(options.method || 'GET');

    if (String(url).endsWith('/rest/api/3/issue/SCRUM-7/transitions') && method === 'GET') {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null },
        text: async () => JSON.stringify({
          transitions: [
            { id: '11', name: 'Move to selected', to: { name: 'Selected For Development' } }
          ]
        })
      };
    }

    if (String(url).endsWith('/rest/api/3/issue/SCRUM-7/transitions') && method === 'POST') {
      return {
        ok: true,
        status: 204,
        statusText: 'No Content',
        headers: { get: () => null },
        text: async () => ''
      };
    }

    throw new Error(`Unexpected fetch: ${String(url)} ${method}`);
  };

  try {
    const result = await atlassian.tracker.transition({ id: 'SCRUM-7', status: 'Selected for Development' });
    assert.equal(result.ok, true);

    const postReq = requests.find((r) => r.options.method === 'POST');
    assert.ok(postReq);
    const payload = JSON.parse(String(postReq.options.body));
    assert.equal(payload.transition.id, '11');
  } finally {
    global.fetch = originalFetch;
    process.env.ATLASSIAN_SITE = originalEnv.ATLASSIAN_SITE;
    process.env.ATLASSIAN_EMAIL = originalEnv.ATLASSIAN_EMAIL;
    process.env.ATLASSIAN_API_TOKEN = originalEnv.ATLASSIAN_API_TOKEN;
  }
});
