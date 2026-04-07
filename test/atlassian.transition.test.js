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

test('atlassian tracker.set_labels uses incremental Jira label update operations', async () => {
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
  let currentLabels = ['ai-state:approved', 'keep-me'];
  global.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    const method = String(options.method || 'GET');

    if (String(url).startsWith('https://example.atlassian.net/rest/api/3/issue/SCRUM-7') && method === 'GET') {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null },
        text: async () => JSON.stringify({
          key: 'SCRUM-7',
          fields: {
            summary: 'Test issue',
            labels: currentLabels,
            status: { name: 'In Progress' },
            description: null,
            comment: { comments: [] }
          }
        })
      };
    }

    if (String(url).startsWith('https://example.atlassian.net/rest/api/3/issue/SCRUM-7') && method === 'PUT') {
      const payload = JSON.parse(String(options.body));
      for (const op of payload.update?.labels || []) {
        if (op.remove) currentLabels = currentLabels.filter((label) => label !== op.remove);
        if (op.add && !currentLabels.includes(op.add)) currentLabels.push(op.add);
      }
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
    const result = await atlassian.tracker.set_labels({
      id: 'SCRUM-7',
      add: ['ai-state:in-qa', 'ai-state:in-qa'],
      remove: ['ai-state:approved']
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.labels, ['ai-state:in-qa', 'keep-me']);

    const putReq = requests.find((r) => r.options.method === 'PUT');
    assert.ok(putReq);
    const payload = JSON.parse(String(putReq.options.body));
    assert.deepEqual(payload, {
      update: {
        labels: [
          { remove: 'ai-state:approved' },
          { add: 'ai-state:in-qa' }
        ]
      }
    });
  } finally {
    global.fetch = originalFetch;
    process.env.ATLASSIAN_SITE = originalEnv.ATLASSIAN_SITE;
    process.env.ATLASSIAN_EMAIL = originalEnv.ATLASSIAN_EMAIL;
    process.env.ATLASSIAN_API_TOKEN = originalEnv.ATLASSIAN_API_TOKEN;
  }
});

test('atlassian tracker.set_labels verifies labels after update and tolerates stale first readback', async () => {
  const originalEnv = {
    ATLASSIAN_SITE: process.env.ATLASSIAN_SITE,
    ATLASSIAN_EMAIL: process.env.ATLASSIAN_EMAIL,
    ATLASSIAN_API_TOKEN: process.env.ATLASSIAN_API_TOKEN,
    AGENCY_ATLASSIAN_LABEL_VERIFY_ATTEMPTS: process.env.AGENCY_ATLASSIAN_LABEL_VERIFY_ATTEMPTS,
    AGENCY_ATLASSIAN_LABEL_VERIFY_DELAY_MS: process.env.AGENCY_ATLASSIAN_LABEL_VERIFY_DELAY_MS
  };
  const originalFetch = global.fetch;

  process.env.ATLASSIAN_SITE = 'https://example.atlassian.net';
  process.env.ATLASSIAN_EMAIL = 'demo@example.test';
  process.env.ATLASSIAN_API_TOKEN = 'token';
  process.env.AGENCY_ATLASSIAN_LABEL_VERIFY_ATTEMPTS = '3';
  process.env.AGENCY_ATLASSIAN_LABEL_VERIFY_DELAY_MS = '1';

  let getCount = 0;
  let currentLabels = ['keep-me'];
  global.fetch = async (url, options = {}) => {
    const method = String(options.method || 'GET');

    if (String(url).startsWith('https://example.atlassian.net/rest/api/3/issue/SCRUM-8') && method === 'GET') {
      getCount += 1;
      const labels = getCount === 1 ? ['keep-me'] : currentLabels;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null },
        text: async () => JSON.stringify({
          key: 'SCRUM-8',
          fields: {
            summary: 'Test issue',
            labels,
            status: { name: 'To Do' },
            description: null,
            comment: { comments: [] }
          }
        })
      };
    }

    if (String(url).startsWith('https://example.atlassian.net/rest/api/3/issue/SCRUM-8') && method === 'PUT') {
      const payload = JSON.parse(String(options.body));
      for (const op of payload.update?.labels || []) {
        if (op.remove) currentLabels = currentLabels.filter((label) => label !== op.remove);
        if (op.add && !currentLabels.includes(op.add)) currentLabels.push(op.add);
      }
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
    const result = await atlassian.tracker.set_labels({
      id: 'SCRUM-8',
      add: ['ai-state:ready-for-plan'],
      remove: []
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.labels, ['ai-state:ready-for-plan', 'keep-me']);
    assert.ok(getCount >= 2);
  } finally {
    global.fetch = originalFetch;
    process.env.ATLASSIAN_SITE = originalEnv.ATLASSIAN_SITE;
    process.env.ATLASSIAN_EMAIL = originalEnv.ATLASSIAN_EMAIL;
    process.env.ATLASSIAN_API_TOKEN = originalEnv.ATLASSIAN_API_TOKEN;
    process.env.AGENCY_ATLASSIAN_LABEL_VERIFY_ATTEMPTS = originalEnv.AGENCY_ATLASSIAN_LABEL_VERIFY_ATTEMPTS;
    process.env.AGENCY_ATLASSIAN_LABEL_VERIFY_DELAY_MS = originalEnv.AGENCY_ATLASSIAN_LABEL_VERIFY_DELAY_MS;
  }
});
