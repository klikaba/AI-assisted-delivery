const fs = require('fs');
const path = require('path');

function stripWrappingQuotes(value) {
  const raw = String(value || '').trim();
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }
  return raw;
}

function parseEnvFile(content) {
  const out = {};
  const lines = String(content || '').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = stripWrappingQuotes(trimmed.slice(idx + 1));
    if (!key) continue;
    out[key] = value;
  }
  return out;
}

function uniquePaths(paths) {
  const seen = new Set();
  const out = [];
  for (const p of paths) {
    if (!p) continue;
    const resolved = path.resolve(p);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    out.push(resolved);
  }
  return out;
}

function candidateRoots() {
  return uniquePaths([
    process.env.AGENCY_HOST_ROOT,
    process.cwd(),
    path.resolve(__dirname, '..')
  ]);
}

function loadEnvFiles() {
  const loaded = [];
  for (const root of candidateRoots()) {
    for (const name of ['.env.local', '.env']) {
      const filePath = path.join(root, name);
      if (!fs.existsSync(filePath)) continue;
      const parsed = parseEnvFile(fs.readFileSync(filePath, 'utf8'));
      for (const [key, value] of Object.entries(parsed)) {
        if (process.env[key] === undefined || process.env[key] === '') {
          process.env[key] = value;
        }
      }
      loaded.push(filePath);
    }
  }
  return loaded;
}

module.exports = {
  loadEnvFiles
};
