const fs = require('fs');
const path = require('path');

function traceEnabled() {
  return process.env.AGENCY_TRACE === '1' || process.env.AGENCY_TRACE_DIR;
}

function getTraceDir() {
  if (process.env.AGENCY_TRACE_DIR) return path.resolve(process.env.AGENCY_TRACE_DIR);
  const hostRoot = process.env.AGENCY_HOST_ROOT ? path.resolve(process.env.AGENCY_HOST_ROOT) : null;
  if (hostRoot) return path.join(hostRoot, '.agency-traces');
  return null;
}

function writeTrace(name, payload) {
  if (!traceEnabled()) return null;
  const dir = getTraceDir();
  if (!dir) return null;
  if (!payload || payload.ok !== true) return null;
  if (payload.message && /No tickets found|No releasable tickets found/.test(payload.message)) return null;
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`;
  const fullPath = path.join(dir, filename);
  fs.writeFileSync(fullPath, JSON.stringify(payload, null, 2) + '\n');
  return fullPath;
}

module.exports = { writeTrace };
