#!/usr/bin/env node
/**
 * Local MCP server exposing stable Agency capability tools.
 *
 * This lets agent prompts call tools like `tracker.search` without hard-coding
 * vendor MCP tool names (jira.* / confluence.*) or shelling out to CLIs.
 *
 * Transport: JSON-RPC 2.0 over stdio with Content-Length framing (LSP-style).
 *
 * Supported methods (minimum viable MCP):
 * - initialize
 * - tools/list
 * - tools/call
 *
 * Notes:
 * - This server is intentionally dependency-free.
 * - Backends are selected via the same env/config as `scripts/agency.js`.
 */

const { loadResolvedConfig, loadBackend, selectBackend } = require('./agency/runtime');

function writeStderr(line) {
  process.stderr.write(`${line}\n`);
}

function traceEnabled() {
  return process.env.AGENCY_MCP_TRACE === '1';
}

function debug(msg) {
  if (traceEnabled()) writeStderr(`[agency-mcp] ${msg}`);
}

function encodeMessageContentLength(obj) {
  const json = JSON.stringify(obj);
  const bytes = Buffer.from(json, 'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${bytes.length}\r\n\r\n`, 'utf8'), bytes]);
}

function encodeMessageNewline(obj) {
  return Buffer.from(`${JSON.stringify(obj)}\n`, 'utf8');
}

let outputFraming = null; // 'content-length' | 'newline'

function send(obj) {
  // Default to Content-Length framing unless we detect newline framing from input.
  const framing = outputFraming || 'content-length';
  process.stdout.write(
    framing === 'newline' ? encodeMessageNewline(obj) : encodeMessageContentLength(obj)
  );
}

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id, error };
}

function toolList() {
  // Minimal JSON Schemas: keep stable, don’t overfit.
  const tools = [
    {
      name: 'capabilities.get',
      description: 'Get the current capability surface and selected backends.',
      inputSchema: { type: 'object', additionalProperties: false, properties: {} }
    },
    {
      name: 'tracker.search',
      description: 'Search tracker items by labels and/or text.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          labels: { type: 'array', items: { type: 'string' } },
          text: { type: 'string' },
          jql: { type: 'string' },
          limit: { type: 'number' }
        }
      }
    },
    {
      name: 'tracker.get',
      description: 'Get a tracker item by id/key/number.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['id'],
        properties: { id: { type: 'string' } }
      }
    },
    {
      name: 'tracker.comment',
      description: 'Add a comment to a tracker item.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'body'],
        properties: { id: { type: 'string' }, body: { type: 'string' } }
      }
    },
    {
      name: 'tracker.transition',
      description: 'Transition a tracker item to a status (best-effort depending on backend).',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'status'],
        properties: { id: { type: 'string' }, status: { type: 'string' } }
      }
    },
    {
      name: 'tracker.set_labels',
      description: 'Add/remove labels on a tracker item.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['id'],
        properties: {
          id: { type: 'string' },
          add: { type: 'array', items: { type: 'string' } },
          remove: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    {
      name: 'docs.create',
      description: 'Create a document/page (spec).',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'body'],
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          status: { type: 'string' },
          parentId: { type: 'string' }
        }
      }
    },
    {
      name: 'docs.get',
      description: 'Fetch a document/page by id.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['id'],
        properties: { id: { type: 'string' } }
      }
    },
    {
      name: 'docs.update',
      description: 'Update a document/page by id.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['id'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
          status: { type: 'string' }
        }
      }
    },
    {
      name: 'scm.pr_create',
      description: 'Create a pull request (GitHub via gh when enabled).',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['title'],
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          head: { type: 'string' },
          base: { type: 'string' },
          draft: { type: 'boolean' },
          labels: { type: 'array', items: { type: 'string' } },
          reviewers: { type: 'array', items: { type: 'string' } },
          assignees: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    {
      name: 'scm.pr_get',
      description: 'Get a pull request by number.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['number'],
        properties: { number: { type: 'number' } }
      }
    },
    {
      name: 'scm.pr_comment',
      description: 'Add a comment to a pull request.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['number', 'body'],
        properties: { number: { type: 'number' }, body: { type: 'string' } }
      }
    },
    {
      name: 'scm.pr_set_labels',
      description: 'Add/remove labels on a pull request.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['number'],
        properties: {
          number: { type: 'number' },
          add: { type: 'array', items: { type: 'string' } },
          remove: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    {
      name: 'scm.pr_link_ticket',
      description: 'Link a pull request to a tracker ticket (best-effort).',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['number', 'ticket'],
        properties: { number: { type: 'number' }, ticket: { type: 'string' } }
      }
    }
  ];

  // Compatibility: some MCP clients namespace tool names with the server id.
  // Our server id in generated config is "agency", so we expose both:
  // - tracker.search
  // - agency.tracker.search
  const withAliases = [];
  for (const t of tools) {
    withAliases.push(t);
    withAliases.push({ ...t, name: `agency.${t.name}` });
  }
  return withAliases;
}

function normalizeCallParams(params) {
  // MCP SDK uses { name, arguments }. Be tolerant.
  let name = params?.name;
  const args = params?.arguments || params?.args || {};
  if (typeof name === 'string' && name.startsWith('agency.')) {
    name = name.slice('agency.'.length);
  }
  return { name, args };
}

function hasFn(obj, name) {
  return typeof obj?.[name] === 'function';
}

function computeCapabilities({ mode, config }) {
  const trackerBackendId = selectBackend('tracker', mode, config);
  const docsBackendId = selectBackend('docs', mode, config);
  const scmBackendId = selectBackend('scm', mode, config);

  const trackerBackend = loadBackend('tracker', trackerBackendId);
  const docsBackend = loadBackend('docs', docsBackendId);
  const scmBackend = scmBackendId === 'none' ? null : loadBackend('scm', scmBackendId);

  return {
    version: '1.0',
    mode,
    backends: {
      tracker: trackerBackendId,
      docs: docsBackendId,
      scm: scmBackendId
    },
    tracker: {
      search: hasFn(trackerBackend.tracker, 'search'),
      get: hasFn(trackerBackend.tracker, 'get'),
      comment: hasFn(trackerBackend.tracker, 'comment'),
      transition: hasFn(trackerBackend.tracker, 'transition'),
      set_labels: hasFn(trackerBackend.tracker, 'set_labels')
    },
    docs: {
      create: hasFn(docsBackend.docs, 'create'),
      get: hasFn(docsBackend.docs, 'get'),
      update: hasFn(docsBackend.docs, 'update')
    },
    scm: {
      enabled: scmBackendId !== 'none',
      pr_create: scmBackend ? hasFn(scmBackend.scm, 'pr_create') : false,
      pr_get: scmBackend ? hasFn(scmBackend.scm, 'pr_get') : false,
      pr_comment: scmBackend ? hasFn(scmBackend.scm, 'pr_comment') : false,
      pr_set_labels: scmBackend ? hasFn(scmBackend.scm, 'pr_set_labels') : false,
      pr_link_ticket: scmBackend ? hasFn(scmBackend.scm, 'pr_link_ticket') : false
    }
  };
}

async function callTool(name, args) {
  const { config } = loadResolvedConfig();
  const mode = config?.tracker?.mode || 'standalone';

  if (name === 'capabilities.get') {
    return computeCapabilities({ mode, config });
  }

  if (name.startsWith('tracker.')) {
    const backendId = selectBackend('tracker', mode, config);
    const backend = loadBackend('tracker', backendId);
    const fn = backend.tracker[name.slice('tracker.'.length)];
    if (typeof fn !== 'function') throw new Error(`Tool not implemented: ${name}`);
    return await fn(args || {});
  }

  if (name.startsWith('docs.')) {
    const backendId = selectBackend('docs', mode, config);
    const backend = loadBackend('docs', backendId);
    const fn = backend.docs[name.slice('docs.'.length)];
    if (typeof fn !== 'function') throw new Error(`Tool not implemented: ${name}`);
    return await fn(args || {});
  }

  if (name.startsWith('scm.')) {
    const backendId = selectBackend('scm', mode, config);
    if (backendId === 'none') {
      throw new Error('SCM integration is disabled. Set scm.provider="github" (or AGENCY_SCM_BACKEND=github).');
    }
    const backend = loadBackend('scm', backendId);
    const fn = backend.scm?.[name.slice('scm.'.length)];
    if (typeof fn !== 'function') throw new Error(`Tool not implemented: ${name}`);
    return await fn(args || {});
  }

  throw new Error(`Unknown tool: ${name}`);
}

function wrapToolResult(result) {
  // MCP tool results are returned as "content" blocks.
  // Prefer JSON content for structured consumption.
  return {
    content: [
      {
        type: 'json',
        json: result
      }
    ]
  };
}

class FramedJsonRpc {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.buffer = Buffer.alloc(0);
    this.expectedLength = null;
    this.mode = null; // 'content-length' | 'newline'
    this.partialLine = '';
  }

  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    // Detect framing if unknown.
    if (this.mode === null) {
      const head = this.buffer.slice(0, 64).toString('utf8');
      if (/^\s*Content-Length:/i.test(head)) {
        this.mode = 'content-length';
        outputFraming = 'content-length';
      } else if (/^\s*\{/.test(head) || head.includes('\n')) {
        this.mode = 'newline';
        outputFraming = 'newline';
      }
    }

    if (this.mode === 'newline') {
      const text = this.buffer.toString('utf8');
      this.buffer = Buffer.alloc(0);
      const combined = this.partialLine + text;
      const lines = combined.split('\n');
      this.partialLine = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const msg = JSON.parse(trimmed);
        this.onMessage(msg);
      }
      return;
    }

    // content-length framing (LSP-style)
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (this.expectedLength === null) {
        const headerEnd = this.buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        const headerText = this.buffer.slice(0, headerEnd).toString('utf8');
        const match = /Content-Length:\s*(\d+)/i.exec(headerText);
        if (!match) {
          // If headers aren't present, try newline fallback.
          this.mode = 'newline';
          outputFraming = 'newline';
          return this.push(Buffer.alloc(0));
        }
        this.expectedLength = Number(match[1]);
        this.buffer = this.buffer.slice(headerEnd + 4);
      }

      if (this.buffer.length < this.expectedLength) return;
      const body = this.buffer.slice(0, this.expectedLength).toString('utf8');
      this.buffer = this.buffer.slice(this.expectedLength);
      this.expectedLength = null;
      const msg = JSON.parse(body);
      this.onMessage(msg);
    }
  }
}

async function handleRequest(msg) {
  const { id, method, params } = msg || {};
  debug(`recv method=${String(method)} id=${id === undefined ? '(none)' : String(id)}`);

  // Notifications have no id; ignore.
  const isNotification = id === undefined || id === null;

  try {
    if (method === 'initialize') {
      const result = {
        protocolVersion: params?.protocolVersion || '2024-11-05',
        serverInfo: { name: 'agency', version: '0.1.0' },
        capabilities: {
          tools: {}
        }
      };
      if (!isNotification) send(jsonRpcResult(id, result));
      return;
    }

    if (method === 'initialized') {
      // Some clients send this notification after initialize; ignore.
      return;
    }

    if (method === 'shutdown') {
      // Standard JSON-RPC/LSP shutdown handshake.
      if (!isNotification) send(jsonRpcResult(id, null));
      return;
    }

    if (method === 'exit') {
      process.exit(0);
      return;
    }

    if (method === 'tools/list') {
      const result = { tools: toolList() };
      if (!isNotification) send(jsonRpcResult(id, result));
      return;
    }

    // Optional MCP features. OpenCode attempts to fetch prompts/resources from
    // every configured server; we don't provide prompts/resources here.
    if (method === 'prompts/list') {
      const result = { prompts: [] };
      if (!isNotification) send(jsonRpcResult(id, result));
      return;
    }

    if (method === 'prompts/get') {
      const result = { prompt: null };
      if (!isNotification) send(jsonRpcResult(id, result));
      return;
    }

    if (method === 'resources/list') {
      const result = { resources: [] };
      if (!isNotification) send(jsonRpcResult(id, result));
      return;
    }

    if (method === 'resources/read') {
      const result = { contents: [] };
      if (!isNotification) send(jsonRpcResult(id, result));
      return;
    }

    if (method === 'tools/call') {
      const { name, args } = normalizeCallParams(params);
      if (!name) throw new Error('tools/call requires params.name');
      const res = await callTool(name, args);
      const result = wrapToolResult(res);
      if (!isNotification) send(jsonRpcResult(id, result));
      return;
    }

    // Unknown method: per JSON-RPC.
    if (!isNotification) send(jsonRpcError(id, -32601, `Method not found: ${String(method)}`));
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    debug(`error method=${String(method)}: ${message}`);
    if (!isNotification) send(jsonRpcError(id, -32000, message));
  }
}

function main() {
  const parser = new FramedJsonRpc((msg) => {
    // No parallelism needed; keep ordering deterministic.
    void handleRequest(msg);
  });

  process.stdin.on('data', (chunk) => {
    try {
      parser.push(chunk);
    } catch (err) {
      writeStderr(`agency-mcp fatal: ${err && err.message ? err.message : String(err)}`);
      process.exit(1);
    }
  });
}

main();
