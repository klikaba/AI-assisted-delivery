import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createServer } = require('../server.js');

test('server exposes the demo shell, browser modules, favicon, and device API', async () => {
  const server = createServer();

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const [html, appModule, sharedModule, favicon, devices] = await Promise.all([
      fetch(`${baseUrl}/`),
      fetch(`${baseUrl}/app.mjs`),
      fetch(`${baseUrl}/lib/device-health.mjs`),
      fetch(`${baseUrl}/favicon.svg`),
      fetch(`${baseUrl}/api/devices`)
    ]);

    assert.equal(html.status, 200);
    assert.match(await html.text(), /SleepOps Console/);

    assert.equal(appModule.status, 200);
    assert.match(await appModule.text(), /renderSummary/);

    assert.equal(sharedModule.status, 200);
    assert.match(await sharedModule.text(), /escapeHtml/);

    assert.equal(favicon.status, 200);
    assert.match(favicon.headers.get('content-type') || '', /image\/svg\+xml/);
    assert.match(await favicon.text(), /<svg/);

    assert.equal(devices.status, 200);
    const payload = await devices.json();
    assert.ok(Array.isArray(payload));
    assert.ok(payload.length > 0);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
