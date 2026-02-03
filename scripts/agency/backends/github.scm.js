const cp = require('child_process');

function runGh(args, options = {}) {
  // Always disable interactive prompts. In an agent/tool-call context, prompting
  // would deadlock the run. Callers must provide required flags (e.g. base/head)
  // or ensure repo state supports non-interactive behavior.
  const env = { ...process.env, GH_PROMPT_DISABLED: '1', ...(options.env || {}) };
  const res = cp.spawnSync('gh', args, { encoding: 'utf8', ...options, env });
  if (res.status !== 0) {
    const msg = (res.stderr || res.stdout || '').trim();
    throw new Error(`gh failed: ${msg || `exit=${res.status}`}`);
  }
  return res.stdout;
}

function coerceStringArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String);
  return [String(v)];
}

function pr_create({ title, body, head, base, draft, labels, reviewers, assignees }) {
  const args = [
    'pr',
    'create',
    '--title',
    String(title),
    '--body',
    String(body || '')
  ];
  if (head) args.push('--head', String(head));
  if (base) args.push('--base', String(base));
  if (draft) args.push('--draft');

  // `gh pr create` doesn't reliably support JSON output; create then fetch.
  // We rely on `--json/--jq` in `gh pr view` for structured data.
  const url = runGh(args).trim();
  if (!url) {
    throw new Error(
      [
        'gh pr create returned empty output.',
        'This can happen when gh cannot create a PR non-interactively.',
        'Provide explicit "head" and "base" (branches), or ensure the repo has an upstream and there are commits to propose.'
      ].join(' ')
    );
  }

  const json = runGh([
    'pr',
    'view',
    url,
    '--json',
    'number,title,url,state,body,headRefName,baseRefName,isDraft,labels,reviewRequests,assignees'
  ]);
  const pr = JSON.parse(json);
  const number = Number(pr.number);

  // Apply metadata after creation.
  // Reviewers/assignees are best-effort; gh will error if invalid, so keep it optional.
  const addLabels = coerceStringArray(labels);
  if (addLabels.length > 0) {
    runGh(['pr', 'edit', String(number), ...addLabels.flatMap((l) => ['--add-label', l])]);
  }

  const addReviewers = coerceStringArray(reviewers);
  if (addReviewers.length > 0) {
    runGh(['pr', 'edit', String(number), ...addReviewers.flatMap((r) => ['--add-reviewer', r])]);
  }

  const addAssignees = coerceStringArray(assignees);
  if (addAssignees.length > 0) {
    runGh(['pr', 'edit', String(number), ...addAssignees.flatMap((a) => ['--add-assignee', a])]);
  }

  // Re-fetch final shape.
  const json2 = runGh([
    'pr',
    'view',
    String(number),
    '--json',
    'number,title,url,state,body,headRefName,baseRefName,isDraft,labels,reviewRequests,assignees'
  ]);
  const pr2 = JSON.parse(json2);

  return {
    pr: {
      number: Number(pr2.number),
      title: pr2.title || '',
      url: pr2.url || url || null,
      state: pr2.state || null,
      body: pr2.body || '',
      head: pr2.headRefName || null,
      base: pr2.baseRefName || null,
      draft: Boolean(pr2.isDraft),
      labels: Array.isArray(pr2.labels) ? pr2.labels.map((l) => l.name).sort() : []
    }
  };
}

function pr_get({ number }) {
  const n = Number(number);
  if (!Number.isFinite(n)) throw new Error('scm.pr_get requires a numeric "number"');

  const json = runGh([
    'pr',
    'view',
    String(n),
    '--json',
    'number,title,url,state,body,headRefName,baseRefName,isDraft,labels'
  ]);
  const pr = JSON.parse(json);
  return {
    pr: {
      number: Number(pr.number),
      title: pr.title || '',
      url: pr.url || null,
      state: pr.state || null,
      body: pr.body || '',
      head: pr.headRefName || null,
      base: pr.baseRefName || null,
      draft: Boolean(pr.isDraft),
      labels: Array.isArray(pr.labels) ? pr.labels.map((l) => l.name).sort() : []
    }
  };
}

function pr_comment({ number, body }) {
  const n = Number(number);
  if (!Number.isFinite(n)) throw new Error('scm.pr_comment requires a numeric "number"');
  runGh(['pr', 'comment', String(n), '--body', String(body)]);
  return { ok: true };
}

function pr_set_labels({ number, add, remove }) {
  const n = Number(number);
  if (!Number.isFinite(n)) throw new Error('scm.pr_set_labels requires a numeric "number"');

  const args = ['pr', 'edit', String(n)];
  for (const a of coerceStringArray(add)) args.push('--add-label', a);
  for (const r of coerceStringArray(remove)) args.push('--remove-label', r);
  runGh(args);
  return { ok: true };
}

function pr_link_ticket({ number, ticket }) {
  const n = Number(number);
  if (!Number.isFinite(n)) throw new Error('scm.pr_link_ticket requires a numeric "number"');
  const t = String(ticket);
  // Best-effort: comment with a stable marker that can be searched/parsed later.
  runGh(['pr', 'comment', String(n), '--body', `Agency link: ${t}`]);
  return { ok: true };
}

module.exports = {
  pr_create,
  pr_get,
  pr_comment,
  pr_set_labels,
  pr_link_ticket
};
