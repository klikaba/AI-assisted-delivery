const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function safeSlug(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function randomId() {
  return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
}

function findHostRoot() {
  if (process.env.AGENCY_HOST_ROOT) return path.resolve(process.env.AGENCY_HOST_ROOT);
  try {
    const root = cp.execSync('git rev-parse --show-toplevel', {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    if (root) return root;
  } catch {
    // ignore
  }
  return path.resolve(__dirname, '..', '..', '..');
}

function loadConfigDocsRepoDir() {
  const envDir = process.env.AGENCY_DOCS_DIR;
  if (envDir) return String(envDir);

  try {
    // eslint-disable-next-line global-require
    const { loadConfig } = require('../../config.js');
    const { config } = loadConfig();
    const dir = config?.docs?.repo?.dir;
    if (dir) return String(dir);
  } catch {
    // ignore
  }

  return 'docs/agency';
}

function docsRootAbs() {
  const hostRoot = findHostRoot();
  const dir = loadConfigDocsRepoDir();
  if (path.isAbsolute(dir)) {
    throw new Error(`AGENCY_DOCS_DIR/docs.repo.dir must be a relative path, got: ${dir}`);
  }
  const resolved = path.resolve(hostRoot, dir);
  const rel = path.relative(hostRoot, resolved);
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) return resolved;
  throw new Error(`AGENCY_DOCS_DIR/docs.repo.dir must stay within host root, got: ${dir}`);
}

function metaPathForId(id) {
  return path.join(docsRootAbs(), `${String(id)}.json`);
}

function bodyPathForId(id) {
  return path.join(docsRootAbs(), `${String(id)}.md`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
}

function ensureExists(filePath, kind) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${kind} not found: ${filePath}`);
  }
}

function normalizeStatus(status) {
  if (status === undefined || status === null || status === '') return 'DRAFT';
  return String(status).toUpperCase();
}

function docs_create({ title, body, status, parentId }) {
  const now = new Date().toISOString();
  const base = `doc-${now.replace(/[-:.TZ]/g, '')}-${safeSlug(title) || 'spec'}-${randomId().slice(0, 8)}`;
  const id = base;

  const meta = {
    id,
    title: String(title || ''),
    status: normalizeStatus(status),
    parentId: parentId ? String(parentId) : null,
    createdAt: now,
    updatedAt: now
  };

  const metaPath = metaPathForId(id);
  const bodyPath = bodyPathForId(id);
  fs.mkdirSync(path.dirname(metaPath), { recursive: true });
  writeJson(metaPath, meta);
  fs.writeFileSync(bodyPath, String(body || ''), 'utf8');

  const relUrl = path.relative(findHostRoot(), bodyPath).split(path.sep).join('/');
  return { page: { ...meta, body: String(body || ''), url: relUrl } };
}

function docs_get({ id }) {
  const docId = String(id || '');
  if (!docId) throw new Error('id is required');

  const metaPath = metaPathForId(docId);
  const bodyPath = bodyPathForId(docId);
  ensureExists(metaPath, 'Doc meta');
  ensureExists(bodyPath, 'Doc body');

  const meta = readJson(metaPath);
  const body = fs.readFileSync(bodyPath, 'utf8');
  const relUrl = path.relative(findHostRoot(), bodyPath).split(path.sep).join('/');
  return { page: { ...meta, body, url: relUrl } };
}

function docs_update({ id, title, body, status }) {
  const docId = String(id || '');
  if (!docId) throw new Error('id is required');

  const metaPath = metaPathForId(docId);
  const bodyPath = bodyPathForId(docId);
  ensureExists(metaPath, 'Doc meta');
  ensureExists(bodyPath, 'Doc body');

  const meta = readJson(metaPath);
  if (title !== undefined) meta.title = String(title);
  if (status !== undefined) meta.status = normalizeStatus(status);
  meta.updatedAt = new Date().toISOString();
  writeJson(metaPath, meta);

  if (body !== undefined) {
    fs.writeFileSync(bodyPath, String(body), 'utf8');
  }

  const relUrl = path.relative(findHostRoot(), bodyPath).split(path.sep).join('/');
  const outBody = body !== undefined ? String(body) : fs.readFileSync(bodyPath, 'utf8');
  return { page: { ...meta, body: outBody, url: relUrl } };
}

module.exports = {
  id: 'repo',
  tracker: {},
  scm: {},
  docs: {
    create: docs_create,
    get: docs_get,
    update: docs_update
  }
};
