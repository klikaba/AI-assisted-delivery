const fs = require('fs');
const path = require('path');

function normalizeTracePayload(payload) {
  // Keep only stable, low-noise parts of the trace.
  // We intentionally ignore dynamic values like IDs/URLs.
  const trace = (payload.trace || []).map((entry) => ({
    op: entry.op,
    args: entry.args ? Object.keys(entry.args).sort() : []
  }));
  return {
    ok: payload.ok,
    mode: payload.mode,
    execute: payload.execute,
    trace
  };
}

function writeTraceSnapshot(snapshotPath, payload) {
  const normalized = normalizeTracePayload(payload);
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(snapshotPath, JSON.stringify(normalized, null, 2) + '\n');
}

function readTraceSnapshot(snapshotPath) {
  return JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
}

function assertTraceSnapshot(actualPayload, expectedSnapshot) {
  const normalized = normalizeTracePayload(actualPayload);
  return { normalized, expected: expectedSnapshot };
}

module.exports = {
  normalizeTracePayload,
  writeTraceSnapshot,
  readTraceSnapshot,
  assertTraceSnapshot
};

