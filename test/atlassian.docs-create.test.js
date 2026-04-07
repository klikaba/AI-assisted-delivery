const assert = require('node:assert/strict');
const { test } = require('node:test');

const atlassian = require('../scripts/agency/backends/atlassian');

test('atlassian docs.create falls back to space root when parentId is invalid', async () => {
  const originalEnv = {
    ATLASSIAN_SITE: process.env.ATLASSIAN_SITE,
    CONFLUENCE_BASE_URL: process.env.CONFLUENCE_BASE_URL,
    CONFLUENCE_SPACE_KEY: process.env.CONFLUENCE_SPACE_KEY,
    ATLASSIAN_EMAIL: process.env.ATLASSIAN_EMAIL,
    ATLASSIAN_API_TOKEN: process.env.ATLASSIAN_API_TOKEN
  };
  const originalFetch = global.fetch;

  process.env.ATLASSIAN_SITE = 'https://example.atlassian.net';
  process.env.CONFLUENCE_BASE_URL = 'https://example.atlassian.net/wiki';
  process.env.CONFLUENCE_SPACE_KEY = 'SD';
  process.env.ATLASSIAN_EMAIL = 'demo@example.test';
  process.env.ATLASSIAN_API_TOKEN = 'token';

  const requests = [];
  let createAttempt = 0;
  global.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    const method = String(options.method || 'GET');

    if (String(url) === 'https://example.atlassian.net/wiki/rest/api/content/123456' && method === 'GET') {
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: { get: () => null },
        text: async () => JSON.stringify({
          statusCode: 404,
          message: 'No content found'
        })
      };
    }

    if (String(url) === 'https://example.atlassian.net/wiki/rest/api/content' && method === 'POST') {
      createAttempt += 1;
      if (createAttempt === 1) {
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          headers: { get: () => null },
          text: async () => JSON.stringify({
            statusCode: 404,
            data: { authorized: true, valid: true, errors: [], successful: true },
            message: 'com.atlassian.confluence.api.service.exceptions.api.NotFoundException: The parent ID specified does not exist, or user does not have permissions'
          })
        };
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null },
        text: async () => JSON.stringify({
          id: '9001',
          title: 'Recovered Spec',
          _links: { base: 'https://example.atlassian.net/wiki', webui: '/spaces/SD/pages/9001/Recovered+Spec' }
        })
      };
    }

    throw new Error(`Unexpected fetch: ${String(url)} ${method}`);
  };

  try {
    const result = await atlassian.docs.create({
      title: 'Recovered Spec',
      body: 'Spec body',
      status: 'DRAFT',
        parentId: '123456'
    });

    assert.equal(result.page.id, '9001');
    assert.equal(result.page.parentId, null);
    assert.equal(createAttempt, 2);

    const postRequests = requests.filter((r) => String(r.options.method || 'GET') === 'POST');
    const firstPayload = JSON.parse(String(postRequests[0].options.body));
    const secondPayload = JSON.parse(String(postRequests[1].options.body));
    assert.deepEqual(firstPayload.ancestors, [{ id: '123456' }]);
    assert.equal(secondPayload.ancestors, undefined);
  } finally {
    global.fetch = originalFetch;
    process.env.ATLASSIAN_SITE = originalEnv.ATLASSIAN_SITE;
    process.env.CONFLUENCE_BASE_URL = originalEnv.CONFLUENCE_BASE_URL;
    process.env.CONFLUENCE_SPACE_KEY = originalEnv.CONFLUENCE_SPACE_KEY;
    process.env.ATLASSIAN_EMAIL = originalEnv.ATLASSIAN_EMAIL;
    process.env.ATLASSIAN_API_TOKEN = originalEnv.ATLASSIAN_API_TOKEN;
  }
});

test('atlassian docs.create does not fall back to space root on parent permission failure', async () => {
  const originalEnv = {
    ATLASSIAN_SITE: process.env.ATLASSIAN_SITE,
    CONFLUENCE_BASE_URL: process.env.CONFLUENCE_BASE_URL,
    CONFLUENCE_SPACE_KEY: process.env.CONFLUENCE_SPACE_KEY,
    ATLASSIAN_EMAIL: process.env.ATLASSIAN_EMAIL,
    ATLASSIAN_API_TOKEN: process.env.ATLASSIAN_API_TOKEN
  };
  const originalFetch = global.fetch;

  process.env.ATLASSIAN_SITE = 'https://example.atlassian.net';
  process.env.CONFLUENCE_BASE_URL = 'https://example.atlassian.net/wiki';
  process.env.CONFLUENCE_SPACE_KEY = 'SD';
  process.env.ATLASSIAN_EMAIL = 'demo@example.test';
  process.env.ATLASSIAN_API_TOKEN = 'token';

  let createAttempt = 0;
  global.fetch = async (url, options = {}) => {
    const method = String(options.method || 'GET');

    if (String(url) === 'https://example.atlassian.net/wiki/rest/api/content/guarded-parent' && method === 'GET') {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null },
        text: async () => JSON.stringify({ id: 'guarded-parent', title: 'Guarded Parent' })
      };
    }

    if (String(url) === 'https://example.atlassian.net/wiki/rest/api/content' && method === 'POST') {
      createAttempt += 1;
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: { get: () => null },
        text: async () => JSON.stringify({
          statusCode: 404,
          data: { authorized: true, valid: true, errors: [], successful: true },
          message: 'com.atlassian.confluence.api.service.exceptions.api.NotFoundException: The parent ID specified does not exist, or user does not have permissions'
        })
      };
    }

    throw new Error(`Unexpected fetch: ${String(url)} ${method}`);
  };

  try {
    await assert.rejects(
      () => atlassian.docs.create({
        title: 'Should Fail',
        body: 'Spec body',
        status: 'DRAFT',
        parentId: 'guarded-parent'
      }),
      /parent ID specified does not exist|NotFoundException/i
    );
    assert.equal(createAttempt, 1);
  } finally {
    global.fetch = originalFetch;
    process.env.ATLASSIAN_SITE = originalEnv.ATLASSIAN_SITE;
    process.env.CONFLUENCE_BASE_URL = originalEnv.CONFLUENCE_BASE_URL;
    process.env.CONFLUENCE_SPACE_KEY = originalEnv.CONFLUENCE_SPACE_KEY;
    process.env.ATLASSIAN_EMAIL = originalEnv.ATLASSIAN_EMAIL;
    process.env.ATLASSIAN_API_TOKEN = originalEnv.ATLASSIAN_API_TOKEN;
  }
});

test('atlassian docs.create ignores non-numeric parentId values before sending payload', async () => {
  const originalEnv = {
    ATLASSIAN_SITE: process.env.ATLASSIAN_SITE,
    CONFLUENCE_BASE_URL: process.env.CONFLUENCE_BASE_URL,
    CONFLUENCE_SPACE_KEY: process.env.CONFLUENCE_SPACE_KEY,
    ATLASSIAN_EMAIL: process.env.ATLASSIAN_EMAIL,
    ATLASSIAN_API_TOKEN: process.env.ATLASSIAN_API_TOKEN
  };
  const originalFetch = global.fetch;

  process.env.ATLASSIAN_SITE = 'https://example.atlassian.net';
  process.env.CONFLUENCE_BASE_URL = 'https://example.atlassian.net/wiki';
  process.env.CONFLUENCE_SPACE_KEY = 'SD';
  process.env.ATLASSIAN_EMAIL = 'demo@example.test';
  process.env.ATLASSIAN_API_TOKEN = 'token';

  const requests = [];
  global.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    const method = String(options.method || 'GET');

    if (String(url) === 'https://example.atlassian.net/wiki/rest/api/content' && method === 'POST') {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null },
        text: async () => JSON.stringify({
          id: '9002',
          title: 'Root Spec',
          _links: { base: 'https://example.atlassian.net/wiki', webui: '/spaces/SD/pages/9002/Root+Spec' }
        })
      };
    }

    throw new Error(`Unexpected fetch: ${String(url)} ${method}`);
  };

  try {
    const result = await atlassian.docs.create({
      title: 'Root Spec',
      body: 'Spec body',
      status: 'DRAFT',
      parentId: 'https://example.atlassian.net/wiki/spaces/SD/pages/1234/Parent'
    });

    assert.equal(result.page.id, '9002');
    assert.equal(result.page.parentId, null);

    const payload = JSON.parse(String(requests[0].options.body));
    assert.equal(payload.ancestors, undefined);
  } finally {
    global.fetch = originalFetch;
    process.env.ATLASSIAN_SITE = originalEnv.ATLASSIAN_SITE;
    process.env.CONFLUENCE_BASE_URL = originalEnv.CONFLUENCE_BASE_URL;
    process.env.CONFLUENCE_SPACE_KEY = originalEnv.CONFLUENCE_SPACE_KEY;
    process.env.ATLASSIAN_EMAIL = originalEnv.ATLASSIAN_EMAIL;
    process.env.ATLASSIAN_API_TOKEN = originalEnv.ATLASSIAN_API_TOKEN;
  }
});
