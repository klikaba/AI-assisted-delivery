const cp = require('child_process');
const path = require('path');

function encode(obj) {
  const json = JSON.stringify(obj);
  const buf = Buffer.from(json, 'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${buf.length}\r\n\r\n`, 'utf8'), buf]);
}

function createClient(proc) {
  let buffer = Buffer.alloc(0);
  let expectedLength = null;
  const queue = [];
  const waiters = [];

  function pumpWaiters() {
    while (queue.length > 0 && waiters.length > 0) {
      const msg = queue.shift();
      const waiter = waiters.shift();
      waiter.resolve(msg);
    }
  }

  function parse() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (expectedLength === null) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) break;
        const headerText = buffer.slice(0, headerEnd).toString('utf8');
        const m = /Content-Length:\s*(\d+)/i.exec(headerText);
        if (!m) throw new Error('Missing Content-Length in response');
        expectedLength = Number(m[1]);
        buffer = buffer.slice(headerEnd + 4);
      }
      if (buffer.length < expectedLength) break;
      const body = buffer.slice(0, expectedLength).toString('utf8');
      buffer = buffer.slice(expectedLength);
      expectedLength = null;
      queue.push(JSON.parse(body));
    }
    pumpWaiters();
  }

  proc.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    parse();
  });

  function request(method, params) {
    const id = Math.random().toString(16).slice(2);
    proc.stdin.write(encode({ jsonrpc: '2.0', id, method, params }));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 5000);
      waiters.push({
        resolve: (msg) => {
          clearTimeout(timeout);
          resolve(msg);
        }
      });
    });
  }

  return { request };
}

function spawnAgencyMcp({ repoRoot, env }) {
  const script = path.join(repoRoot, 'scripts', 'agency-mcp.js');
  const proc = cp.spawn(process.execPath, [script], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  return proc;
}

module.exports = { spawnAgencyMcp, createClient };

