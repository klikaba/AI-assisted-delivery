#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const root = __dirname;
const publicDir = path.join(root, 'public');
const dataPath = path.join(root, 'data', 'devices.json');

const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8'
};

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type || 'text/plain; charset=utf-8' });
  res.end(body);
}

function safePathname(urlPath, baseDir) {
  const pathname = urlPath === '/' ? '/index.html' : urlPath;
  const normalized = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  return path.join(baseDir, normalized);
}

function readDevices() {
  return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
}

function createServer() {
  return http.createServer((req, res) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (requestUrl.pathname === '/api/devices') {
      send(res, 200, JSON.stringify(readDevices()), 'application/json; charset=utf-8');
      return;
    }

    const filePath = safePathname(requestUrl.pathname, publicDir);
    if (!filePath.startsWith(publicDir)) {
      send(res, 403, 'Forbidden');
      return;
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      send(res, 404, 'Not found');
      return;
    }

    const ext = path.extname(filePath);
    send(res, 200, fs.readFileSync(filePath), types[ext] || 'application/octet-stream');
  });
}

module.exports = { createServer };

if (require.main === module) {
  const preferredPort = Number(process.env.PORT || 4173);
  const host = process.env.HOST || '0.0.0.0';
  const strictPort = process.env.SLEEPOPS_STRICT_PORT === '1';
  const server = createServer();

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE' && preferredPort !== 0 && !strictPort) {
      process.stderr.write(
        `Port ${preferredPort} is already in use. Falling back to a random available port.\n`
      );
      server.listen(0, host);
      return;
    }

    throw error;
  });

  server.listen(preferredPort, host, () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : preferredPort;
    const listenHost = typeof address === 'object' && address ? address.address : host;
    process.stdout.write(`SleepOps Console listening on http://${listenHost}:${port}\n`);
  });
}
