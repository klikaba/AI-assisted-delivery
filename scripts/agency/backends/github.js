const cp = require('child_process');

const scm = require('./github.scm');

function runGh(args, options = {}) {
  const res = cp.spawnSync('gh', args, { encoding: 'utf8', ...options });
  if (res.status !== 0) {
    const msg = (res.stderr || res.stdout || '').trim();
    throw new Error(`gh failed: ${msg || `exit=${res.status}`}`);
  }
  return res.stdout;
}

// Notes:
// - This backend is intentionally thin. We keep the capability surface stable,
//   and can iterate on implementation without changing prompts.
// - For reliability, all commands should use JSON output.

function tracker_search({ label, labels, text, limit }) {
  const q = [];
  const want = [...(labels || []), ...(label ? [label] : [])].map(String);
  for (const l of want) q.push(`label:${l}`);
  if (text) q.push(String(text));

  // `gh issue list` supports `--search`, `--label`, and `--json`. Using `--search`
  // is the most flexible and works for multiple labels.
  const search = q.join(' ').trim();
  const json = runGh([
    'issue',
    'list',
    '--limit',
    String(limit || 50),
    ...(search ? ['--search', search] : []),
    '--json',
    'number,title,url,state,labels,body'
  ]);

  const raw = JSON.parse(json);
  const items = raw.map((i) => ({
    id: String(i.number),
    key: null,
    title: i.title || '',
    url: i.url || null,
    status: i.state || null,
    labels: Array.isArray(i.labels) ? i.labels.map((l) => l.name).sort() : [],
    body: i.body || '',
    comments: []
  }));

  return { items };
}

function tracker_get({ id }) {
  const json = runGh([
    'issue',
    'view',
    String(id),
    '--json',
    'number,title,url,state,labels,body,comments'
  ]);
  const i = JSON.parse(json);
  return {
    item: {
      id: String(i.number),
      key: null,
      title: i.title || '',
      url: i.url || null,
      status: i.state || null,
      labels: Array.isArray(i.labels) ? i.labels.map((l) => l.name).sort() : [],
      body: i.body || '',
      comments: Array.isArray(i.comments) ? i.comments.map((c) => c && c.body ? String(c.body) : '').filter(Boolean) : []
    }
  };
}

function tracker_comment({ id, body }) {
  runGh(['issue', 'comment', String(id), '--body', String(body)]);
  return { ok: true };
}

function tracker_update({ id, title, body }) {
  if (title === undefined && body === undefined) {
    throw new Error('tracker.update requires title and/or body');
  }
  const args = ['issue', 'edit', String(id)];
  if (title !== undefined) args.push('--title', String(title));
  if (body !== undefined) args.push('--body', String(body));
  runGh(args);
  return tracker_get({ id });
}

function tracker_transition({ id, status }) {
  // GitHub Issues don't have workflow statuses like Jira; we treat status as a no-op.
  // Clients can implement status via labels/projects; keep the capability stable.
  return { ok: true, note: `github backend ignores transition status="${String(status)}" for issue=${String(id)}` };
}

function tracker_set_labels({ id, add, remove }) {
  const args = ['issue', 'edit', String(id)];
  for (const a of add || []) args.push('--add-label', String(a));
  for (const r of remove || []) args.push('--remove-label', String(r));
  runGh(args);
  return { ok: true };
}

module.exports = {
  id: 'github',
  tracker: {
    search: tracker_search,
    get: tracker_get,
    comment: tracker_comment,
    update: tracker_update,
    transition: tracker_transition,
    set_labels: tracker_set_labels
  },
  scm: {
    pr_create: scm.pr_create,
    pr_get: scm.pr_get,
    pr_comment: scm.pr_comment,
    pr_set_labels: scm.pr_set_labels,
    pr_link_ticket: scm.pr_link_ticket
  },
  docs: {
    // GitHub “docs” are typically markdown in repo or wiki; we’ll add later.
    create() {
      throw new Error('docs.create is not implemented for github backend');
    },
    get() {
      throw new Error('docs.get is not implemented for github backend');
    },
    update() {
      throw new Error('docs.update is not implemented for github backend');
    }
  }
};
