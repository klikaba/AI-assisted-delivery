const fs = require('fs');
const path = require('path');

function getFixtureRoot() {
  if (process.env.AGENCY_FIXTURE_DIR) return path.resolve(process.env.AGENCY_FIXTURE_DIR);

  // If a host root override exists, prefer fixtures under it for hermetic tests.
  const hostRoot = process.env.AGENCY_HOST_ROOT ? path.resolve(process.env.AGENCY_HOST_ROOT) : null;
  if (hostRoot) return path.join(hostRoot, '.agency-fixtures');

  // Fallback: no fixtures.
  return null;
}

function ensureFixtureRoot() {
  const root = getFixtureRoot();
  if (!root) {
    throw new Error('Fake backend requires AGENCY_FIXTURE_DIR or AGENCY_HOST_ROOT (fixtures under <host>/.agency-fixtures)');
  }
  if (!fs.existsSync(root)) {
    throw new Error(`Fixture directory does not exist: ${root}`);
  }
  return root;
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n');
}

function loadState() {
  const root = ensureFixtureRoot();
  const statePath = path.join(root, 'state.json');
  if (!fs.existsSync(statePath)) {
    // Default empty state.
    return { tracker: { items: [] }, docs: { pages: [] }, scm: { prs: [] } };
  }
  const state = readJson(statePath);
  // Backwards compatibility for older fixtures.
  if (!state.scm) state.scm = { prs: [] };
  if (!Array.isArray(state.scm.prs)) state.scm.prs = [];
  return state;
}

function saveState(state) {
  const root = ensureFixtureRoot();
  writeJson(path.join(root, 'state.json'), state);
}

function toLabelSet(labels) {
  const set = new Set();
  for (const l of labels || []) set.add(String(l));
  return set;
}

function normalizeItem(item) {
  return {
    id: String(item.id),
    key: item.key ? String(item.key) : null,
    title: String(item.title || ''),
    url: item.url ? String(item.url) : null,
    status: item.status ? String(item.status) : null,
    labels: Array.from(toLabelSet(item.labels)).sort(),
    body: item.body ? String(item.body) : '',
    comments: Array.isArray(item.comments) ? item.comments.map(String) : []
  };
}

function findItem(state, idOrKey) {
  const needle = String(idOrKey);
  return state.tracker.items.find((i) => String(i.id) === needle || String(i.key || '') === needle);
}

// ---- Tracker capability surface (fake) ----

function tracker_search({ label, labels, text }) {
  const state = loadState();
  const want = new Set([...(labels || []), ...(label ? [label] : [])].map(String));

  const out = state.tracker.items
    .map(normalizeItem)
    .filter((i) => {
      if (want.size > 0) {
        for (const w of want) {
          if (!i.labels.includes(w)) return false;
        }
      }
      if (text) {
        const t = String(text).toLowerCase();
        if (!i.title.toLowerCase().includes(t) && !i.body.toLowerCase().includes(t)) return false;
      }
      return true;
    });

  return { items: out };
}

function tracker_get({ id }) {
  const state = loadState();
  const item = findItem(state, id);
  if (!item) throw new Error(`Item not found: ${id}`);
  return { item: normalizeItem(item) };
}

function tracker_comment({ id, body }) {
  const state = loadState();
  const item = findItem(state, id);
  if (!item) throw new Error(`Item not found: ${id}`);
  item.comments = Array.isArray(item.comments) ? item.comments : [];
  item.comments.push(String(body));
  saveState(state);
  return { ok: true };
}

function tracker_transition({ id, status }) {
  const state = loadState();
  const item = findItem(state, id);
  if (!item) throw new Error(`Item not found: ${id}`);
  item.status = String(status);
  saveState(state);
  return { ok: true };
}

function tracker_set_labels({ id, add, remove }) {
  const state = loadState();
  const item = findItem(state, id);
  if (!item) throw new Error(`Item not found: ${id}`);
  const set = toLabelSet(item.labels);
  for (const a of add || []) set.add(String(a));
  for (const r of remove || []) set.delete(String(r));
  item.labels = Array.from(set);
  saveState(state);
  return { ok: true, labels: Array.from(set).sort() };
}

// ---- Docs capability surface (fake) ----

function docs_create({ title, body, status, parentId }) {
  const state = loadState();
  const id = `page-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const page = {
    id,
    title: String(title || ''),
    body: String(body || ''),
    status: status ? String(status) : 'DRAFT',
    parentId: parentId ? String(parentId) : null,
    url: `https://fake.local/docs/${id}`
  };
  state.docs.pages.push(page);
  saveState(state);
  return { page };
}

function docs_get({ id }) {
  const state = loadState();
  const page = state.docs.pages.find((p) => String(p.id) === String(id));
  if (!page) throw new Error(`Page not found: ${id}`);
  return { page };
}

function docs_update({ id, title, body, status }) {
  const state = loadState();
  const page = state.docs.pages.find((p) => String(p.id) === String(id));
  if (!page) throw new Error(`Page not found: ${id}`);
  if (title !== undefined) page.title = String(title);
  if (body !== undefined) page.body = String(body);
  if (status !== undefined) page.status = String(status);
  saveState(state);
  return { page };
}

// ---- SCM capability surface (fake) ----

function normalizePr(pr) {
  return {
    number: Number(pr.number),
    title: String(pr.title || ''),
    url: pr.url ? String(pr.url) : null,
    state: pr.state ? String(pr.state) : null,
    body: pr.body ? String(pr.body) : '',
    head: pr.head ? String(pr.head) : null,
    base: pr.base ? String(pr.base) : null,
    draft: Boolean(pr.draft),
    labels: Array.from(toLabelSet(pr.labels)).sort(),
    comments: Array.isArray(pr.comments) ? pr.comments.map(String) : [],
    linkedTickets: Array.isArray(pr.linkedTickets) ? pr.linkedTickets.map(String) : []
  };
}

function findPr(state, number) {
  const n = Number(number);
  return state.scm.prs.find((p) => Number(p.number) === n);
}

function scm_pr_create({ title, body, head, base, draft, labels, reviewers, assignees }) {
  void reviewers;
  void assignees;

  const state = loadState();
  const max = state.scm.prs.reduce((m, p) => Math.max(m, Number(p.number) || 0), 0);
  const number = max + 1;
  const pr = {
    number,
    title: String(title || ''),
    body: String(body || ''),
    head: head ? String(head) : null,
    base: base ? String(base) : null,
    draft: Boolean(draft),
    labels: Array.isArray(labels) ? labels.map(String) : [],
    comments: [],
    linkedTickets: [],
    url: `https://fake.local/pr/${number}`,
    state: 'OPEN'
  };
  state.scm.prs.push(pr);
  saveState(state);
  return { pr: normalizePr(pr) };
}

function scm_pr_get({ number }) {
  const state = loadState();
  const pr = findPr(state, number);
  if (!pr) throw new Error(`PR not found: ${number}`);
  return { pr: normalizePr(pr) };
}

function scm_pr_comment({ number, body }) {
  const state = loadState();
  const pr = findPr(state, number);
  if (!pr) throw new Error(`PR not found: ${number}`);
  pr.comments = Array.isArray(pr.comments) ? pr.comments : [];
  pr.comments.push(String(body));
  saveState(state);
  return { ok: true };
}

function scm_pr_set_labels({ number, add, remove }) {
  const state = loadState();
  const pr = findPr(state, number);
  if (!pr) throw new Error(`PR not found: ${number}`);
  const set = toLabelSet(pr.labels);
  for (const a of add || []) set.add(String(a));
  for (const r of remove || []) set.delete(String(r));
  pr.labels = Array.from(set);
  saveState(state);
  return { ok: true, labels: Array.from(set).sort() };
}

function scm_pr_link_ticket({ number, ticket }) {
  const state = loadState();
  const pr = findPr(state, number);
  if (!pr) throw new Error(`PR not found: ${number}`);
  pr.linkedTickets = Array.isArray(pr.linkedTickets) ? pr.linkedTickets : [];
  pr.linkedTickets.push(String(ticket));
  pr.comments = Array.isArray(pr.comments) ? pr.comments : [];
  pr.comments.push(`Agency link: ${String(ticket)}`);
  saveState(state);
  return { ok: true };
}

module.exports = {
  id: 'fake',
  tracker: {
    search: tracker_search,
    get: tracker_get,
    comment: tracker_comment,
    transition: tracker_transition,
    set_labels: tracker_set_labels
  },
  docs: {
    create: docs_create,
    get: docs_get,
    update: docs_update
  },
  scm: {
    pr_create: scm_pr_create,
    pr_get: scm_pr_get,
    pr_comment: scm_pr_comment,
    pr_set_labels: scm_pr_set_labels,
    pr_link_ticket: scm_pr_link_ticket
  }
};
