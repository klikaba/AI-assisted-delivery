const cp = require('child_process');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function linearAuthHeader() {
  // Linear supports:
  // - Personal API keys: Authorization: <API_KEY>
  // - OAuth access tokens: Authorization: Bearer <ACCESS_TOKEN>
  //
  // Prefer explicit access token if present.
  const accessToken = process.env.LINEAR_ACCESS_TOKEN;
  if (accessToken) return `Bearer ${accessToken}`;
  const apiKey = requireEnv('LINEAR_API_KEY');
  return apiKey;
}

async function linearFetch({ query, variables }) {
  const endpoint = 'https://api.linear.app/graphql';
  const maxRetries = clamp(Number(process.env.AGENCY_LINEAR_RETRIES || 4), 0, 10);
  const timeoutMs = clamp(Number(process.env.AGENCY_LINEAR_TIMEOUT_MS || 30_000), 1_000, 120_000);

  // eslint-disable-next-line no-plusplus
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: linearAuthHeader()
        },
        body: JSON.stringify({ query, variables: variables || {} }),
        signal: controller.signal
      });

      const retryAfter = res.headers.get('retry-after');
      const text = await res.text();

      // Linear GraphQL can return errors with 200; parse JSON first.
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (res.ok) {
        if (json && Array.isArray(json.errors) && json.errors.length > 0) {
          const msg = json.errors.map((e) => e.message).filter(Boolean).join('; ') || 'Linear GraphQL error';
          throw new Error(msg);
        }
        return json?.data || null;
      }

      const status = res.status;
      const shouldRetry = status === 429 || (status >= 500 && status <= 599);
      if (!shouldRetry || attempt === maxRetries) {
        const msg = (json && Array.isArray(json.errors) && json.errors[0]?.message) ? json.errors[0].message : text;
        throw new Error(`Linear request failed: HTTP ${status} ${res.statusText}${msg ? `: ${String(msg).slice(0, 800)}` : ''}`);
      }

      let delayMs = 0;
      if (retryAfter) {
        const seconds = Number(retryAfter);
        if (Number.isFinite(seconds) && seconds > 0) delayMs = seconds * 1000;
      }
      if (!delayMs) {
        const base = 500 * (2 ** attempt);
        const jitter = Math.floor(Math.random() * 250);
        delayMs = clamp(base + jitter, 250, 10_000);
      }
      await sleep(delayMs);
      continue;
    } catch (err) {
      const isAbort = err && err.name === 'AbortError';
      const isNetwork = err && String(err.message || '').includes('fetch');
      if ((isAbort || isNetwork) && attempt < maxRetries) {
        const base = 500 * (2 ** attempt);
        const jitter = Math.floor(Math.random() * 250);
        await sleep(clamp(base + jitter, 250, 10_000));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error('Linear request failed');
}

function normalizeIssue(issue) {
  const labels = issue?.labels?.nodes || [];
  return {
    id: String(issue.id),
    key: issue.identifier ? String(issue.identifier) : null,
    title: String(issue.title || ''),
    url: issue.url ? String(issue.url) : null,
    status: issue.state?.name ? String(issue.state.name) : null,
    labels: labels.map((l) => String(l.name)).sort(),
    body: issue.description ? String(issue.description) : '',
    comments: []
  };
}

async function issueByIdOrIdentifier(idOrKey) {
  const needle = String(idOrKey || '').trim();
  if (!needle) throw new Error('id is required');

  // Heuristic: Linear UUIDs contain hyphens and are longer than identifiers.
  const looksUuid = needle.includes('-') && needle.length > 20;
  if (looksUuid) {
    const data = await linearFetch({
      query: `
        query IssueById($id: String!) {
          issue(id: $id) {
            id
            identifier
            title
            url
            description
            state { id name }
            team { id name states { nodes { id name } } }
            labels { nodes { id name } }
          }
        }
      `,
      variables: { id: needle }
    });
    if (!data?.issue) throw new Error(`Item not found: ${needle}`);
    return data.issue;
  }

  // Fallback: search by identifier.
  const data = await linearFetch({
    query: `
      query IssueByIdentifier($identifier: String!) {
        issues(filter: { identifier: { eq: $identifier } }, first: 1) {
          nodes {
            id
            identifier
            title
            url
            description
            state { id name }
            team { id name states { nodes { id name } } }
            labels { nodes { id name } }
          }
        }
      }
    `,
    variables: { identifier: needle }
  });
  const issue = data?.issues?.nodes?.[0] || null;
  if (!issue) throw new Error(`Item not found: ${needle}`);
  return issue;
}

async function tracker_search({ label, labels, text, limit }) {
  const want = [...(labels || []), ...(label ? [label] : [])].map(String).filter(Boolean);
  const first = clamp(Number(limit || 50), 1, 250);

  const andClauses = [];
  for (const l of want) {
    andClauses.push({ labels: { name: { eq: l } } });
  }

  const t = text ? String(text).trim() : '';
  if (t) {
    andClauses.push({
      or: [
        { title: { containsIgnoreCase: t } },
        { description: { containsIgnoreCase: t } }
      ]
    });
  }

  const filter = andClauses.length > 0 ? { and: andClauses } : null;

  const data = await linearFetch({
    query: `
      query SearchIssues($first: Int!, $filter: IssueFilter) {
        issues(first: $first, filter: $filter) {
          nodes {
            id
            identifier
            title
            url
            description
            state { name }
            labels { nodes { name } }
          }
        }
      }
    `,
    variables: { first, filter }
  });

  const items = (data?.issues?.nodes || []).map(normalizeIssue);
  return { items };
}

async function tracker_get({ id }) {
  const issue = await issueByIdOrIdentifier(id);
  return { item: normalizeIssue(issue) };
}

async function tracker_comment({ id, body }) {
  const issue = await issueByIdOrIdentifier(id);
  await linearFetch({
    query: `
      mutation CreateComment($input: CommentCreateInput!) {
        commentCreate(input: $input) {
          success
        }
      }
    `,
    variables: { input: { issueId: String(issue.id), body: String(body || '') } }
  });
  return { ok: true };
}

const labelIdCache = new Map(); // name -> id

async function resolveLabelIdByName(name) {
  const key = String(name);
  if (labelIdCache.has(key)) return labelIdCache.get(key);
  const data = await linearFetch({
    query: `
      query LabelByName($name: String!) {
        issueLabels(filter: { name: { eq: $name } }, first: 1) {
          nodes { id name }
        }
      }
    `,
    variables: { name: key }
  });
  const label = data?.issueLabels?.nodes?.[0] || null;
  if (!label?.id) {
    throw new Error(
      `Label not found in Linear: ${key}. ` +
      'Create the required workflow labels (e.g., ai-state:ready-for-plan) in Linear Workspace Settings → Labels.'
    );
  }
  labelIdCache.set(key, String(label.id));
  return String(label.id);
}

async function tracker_set_labels({ id, add, remove }) {
  const issue = await issueByIdOrIdentifier(id);
  const current = issue.labels?.nodes || [];
  const set = new Map(current.map((l) => [String(l.name), String(l.id)]));

  for (const r of remove || []) {
    set.delete(String(r));
  }
  for (const a of add || []) {
    const name = String(a);
    const labelId = await resolveLabelIdByName(name);
    set.set(name, labelId);
  }

  const labelIds = Array.from(set.values());
  await linearFetch({
    query: `
      mutation UpdateIssueLabels($id: String!, $labelIds: [String!]!) {
        issueUpdate(id: $id, input: { labelIds: $labelIds }) {
          success
        }
      }
    `,
    variables: { id: String(issue.id), labelIds }
  });

  return { ok: true, labels: Array.from(set.keys()).sort() };
}

async function tracker_transition({ id, status }) {
  const desired = String(status || '').trim();
  if (!desired) throw new Error('status is required');

  const issue = await issueByIdOrIdentifier(id);
  const states = issue.team?.states?.nodes || [];
  const match = states.find((s) => String(s.name || '').toLowerCase() === desired.toLowerCase());
  if (!match) {
    return { ok: false, note: `No matching Linear workflow state found for status="${desired}"` };
  }

  await linearFetch({
    query: `
      mutation UpdateIssueState($id: String!, $stateId: String!) {
        issueUpdate(id: $id, input: { stateId: $stateId }) {
          success
        }
      }
    `,
    variables: { id: String(issue.id), stateId: String(match.id) }
  });

  return { ok: true };
}

function checkLinearCliHint() {
  // Linear doesn't require a CLI, but some teams might have scripts. This is a no-op.
  // Keep as a placeholder to mirror other backends' patterns.
  void cp;
}

module.exports = {
  id: 'linear',
  tracker: {
    search: tracker_search,
    get: tracker_get,
    comment: tracker_comment,
    transition: tracker_transition,
    set_labels: tracker_set_labels
  },
  docs: {},
  scm: {},
  _internal: {
    checkLinearCliHint
  }
};
