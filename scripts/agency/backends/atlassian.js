function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

function normalizeBaseUrl(url) {
  return String(url).replace(/\/+$/, '');
}

function getAtlassianBases() {
  const site = process.env.ATLASSIAN_SITE ? normalizeBaseUrl(process.env.ATLASSIAN_SITE) : null;
  const jiraBase = normalizeBaseUrl(process.env.JIRA_BASE_URL || site || '');
  const confluenceBase = normalizeBaseUrl(process.env.CONFLUENCE_BASE_URL || (site ? `${site}/wiki` : ''));

  if (!jiraBase) throw new Error('Set ATLASSIAN_SITE or JIRA_BASE_URL for the Atlassian backend');
  if (!confluenceBase) throw new Error('Set ATLASSIAN_SITE or CONFLUENCE_BASE_URL for the Atlassian backend');

  return { jiraBase, confluenceBase };
}

function getAuthHeader() {
  const email = requireEnv('ATLASSIAN_EMAIL');
  const token = requireEnv('ATLASSIAN_API_TOKEN');
  const basic = Buffer.from(`${email}:${token}`, 'utf8').toString('base64');
  return `Basic ${basic}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function truncate(s, max) {
  const str = String(s || '');
  if (str.length <= max) return str;
  return `${str.slice(0, max)}…`;
}

function htmlEscape(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeSpecStatus(status) {
  if (status === undefined || status === null || status === '') return 'DRAFT';
  return String(status).toUpperCase();
}

function extractSpecStatusFromStorage(html) {
  const raw = String(html || '');
  // We intentionally keep this permissive: users may format it as plain text,
  // bold text, or inside a table.
  //
  // Examples:
  // - Spec Status: APPROVED
  // - <strong>Spec Status:</strong> APPROVED
  const m = /Spec\s*Status\s*:(?:\s|<[^>]+>)*([A-Z][A-Z _-]{0,48})/i.exec(raw);
  if (!m) return null;
  return normalizeSpecStatus(m[1]);
}

function renderStorageHtml({ body, specStatus }) {
  const status = normalizeSpecStatus(specStatus);
  const statusHtml = `<p><strong>Spec Status:</strong> ${htmlEscape(status)}</p>`;
  const contentHtml = String(body || '').includes('\n')
    ? `<pre>${htmlEscape(body)}</pre>`
    : `<p>${htmlEscape(body)}</p>`;
  return `${statusHtml}\n${contentHtml}`;
}

function updateSpecStatusInStorage(existingHtml, specStatus) {
  const status = normalizeSpecStatus(specStatus);
  const statusHtml = `<p><strong>Spec Status:</strong> ${htmlEscape(status)}</p>`;
  const raw = String(existingHtml || '');

  // Replace in common cases.
  const replaced = raw.replace(
    /(Spec\s*Status\s*:(?:\s|<[^>]+>)*)([A-Za-z][A-Za-z _-]{0,48})/i,
    (_, prefix) => `${prefix}${status}`
  );
  if (replaced !== raw) return replaced;

  // Otherwise prepend.
  return `${statusHtml}\n${raw}`;
}

function toAdfTextDoc(text) {
  // Minimal Atlassian Document Format wrapper for plain text.
  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: String(text) }]
      }
    ]
  };
}

async function atlassianFetch(url, { method = 'GET', headers = {}, body } = {}) {
  const auth = getAuthHeader();
  const maxRetries = clamp(Number(process.env.AGENCY_ATLASSIAN_RETRIES || 4), 0, 10);
  const timeoutMs = clamp(Number(process.env.AGENCY_ATLASSIAN_TIMEOUT_MS || 30_000), 1_000, 120_000);

  // Retry loop for transient issues (rate limits and server errors).
  // eslint-disable-next-line no-plusplus
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: auth,
          Accept: 'application/json',
          ...headers
        },
        body,
        signal: controller.signal
      });

      const retryAfter = res.headers.get('retry-after');
      const text = await res.text();

      if (res.ok) {
        if (!text) return null;
        try {
          return JSON.parse(text);
        } catch {
          // Some Atlassian endpoints can return non-JSON. Preserve raw.
          return { _raw: text };
        }
      }

      const status = res.status;
      const shouldRetry = status === 429 || (status >= 500 && status <= 599);
      if (!shouldRetry || attempt === maxRetries) {
        throw new Error(
          `${method} ${url} failed: HTTP ${status} ${res.statusText}${text ? `: ${truncate(text, 800)}` : ''}`
        );
      }

      // Backoff: Retry-After if present, otherwise exponential with jitter.
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

  throw new Error(`${method} ${url} failed`);
}

function itemUrl(jiraBase, key) {
  return `${jiraBase}/browse/${encodeURIComponent(String(key))}`;
}

function normalizeIssue(jiraBase, issue) {
  const fields = issue.fields || {};
  const labels = Array.isArray(fields.labels) ? fields.labels.map(String).sort() : [];
  const status = fields.status && fields.status.name ? String(fields.status.name) : null;
  const title = fields.summary ? String(fields.summary) : '';

  // Jira description is in Atlassian Document Format for Cloud; we keep it as JSON string for now.
  const body = fields.description ? JSON.stringify(fields.description) : '';

  return {
    id: String(issue.id || issue.key),
    key: issue.key ? String(issue.key) : null,
    title,
    url: issue.key ? itemUrl(jiraBase, issue.key) : null,
    status,
    labels,
    body,
    comments: []
  };
}

// ---- Tracker capability surface (Atlassian / Jira) ----

async function tracker_search({ labels, text, jql, limit }) {
  const { jiraBase } = getAtlassianBases();
  const wants = (labels || []).map(String).filter(Boolean);
  const wantedLimit = clamp(Number(limit || 50), 1, 500);

  let q = String(jql || '').trim();
  if (!q) {
    const parts = [];
    for (const l of wants) parts.push(`labels = "${l.replaceAll('"', '\\"')}"`);
    if (text) parts.push(`text ~ "${String(text).replaceAll('"', '\\"')}"`);
    q = parts.length > 0 ? parts.join(' AND ') : 'ORDER BY updated DESC';
  }

  const results = [];
  let startAt = 0;
  const pageSize = clamp(Number(process.env.AGENCY_ATLASSIAN_PAGE_SIZE || 50), 1, 100);

  while (results.length < wantedLimit) {
    const url = new URL(`${jiraBase}/rest/api/3/search`);
    url.searchParams.set('jql', q);
    url.searchParams.set('startAt', String(startAt));
    url.searchParams.set('maxResults', String(Math.min(pageSize, wantedLimit - results.length)));
    url.searchParams.set('fields', 'summary,labels,status,description');

    // eslint-disable-next-line no-await-in-loop
    const data = await atlassianFetch(url.toString());
    const issues = Array.isArray(data.issues) ? data.issues : [];
    for (const issue of issues) {
      results.push(normalizeIssue(jiraBase, issue));
      if (results.length >= wantedLimit) break;
    }
    if (issues.length === 0) break;
    startAt += issues.length;
    const total = Number(data.total);
    if (Number.isFinite(total) && startAt >= total) break;
  }

  return { items: results };
}

async function tracker_get({ id }) {
  const { jiraBase } = getAtlassianBases();
  const url = new URL(`${jiraBase}/rest/api/3/issue/${encodeURIComponent(String(id))}`);
  url.searchParams.set('fields', 'summary,labels,status,description');
  const issue = await atlassianFetch(url.toString());
  return { item: normalizeIssue(jiraBase, issue) };
}

async function tracker_comment({ id, body }) {
  const { jiraBase } = getAtlassianBases();
  const url = `${jiraBase}/rest/api/3/issue/${encodeURIComponent(String(id))}/comment`;
  await atlassianFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: toAdfTextDoc(body) })
  });
  return { ok: true };
}

async function tracker_set_labels({ id, add, remove }) {
  const { jiraBase } = getAtlassianBases();
  const current = await tracker_get({ id });
  const set = new Set((current.item.labels || []).map(String));
  for (const a of add || []) set.add(String(a));
  for (const r of remove || []) set.delete(String(r));
  const labels = Array.from(set).sort();

  const url = `${jiraBase}/rest/api/3/issue/${encodeURIComponent(String(id))}`;
  await atlassianFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { labels } })
  });
  return { ok: true, labels };
}

async function tracker_transition({ id, status }) {
  const { jiraBase } = getAtlassianBases();
  const desired = String(status);
  const url = `${jiraBase}/rest/api/3/issue/${encodeURIComponent(String(id))}/transitions`;

  const available = await atlassianFetch(url);
  const transitions = Array.isArray(available.transitions) ? available.transitions : [];
  const match = transitions.find((t) => String(t.name) === desired || String(t.to?.name || '') === desired);
  if (!match) {
    return { ok: false, note: `No matching transition found for status="${desired}"` };
  }

  await atlassianFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transition: { id: match.id } })
  });

  return { ok: true };
}

// ---- Docs capability surface (Atlassian / Confluence) ----

async function docs_create({ title, body, status, parentId }) {
  const { confluenceBase } = getAtlassianBases();
  const spaceKey = requireEnv('CONFLUENCE_SPACE_KEY');

  const specStatus = normalizeSpecStatus(status);
  const confluenceStatus = specStatus === 'DRAFT' ? 'draft' : 'current';
  const htmlBody = renderStorageHtml({ body, specStatus });

  const payload = {
    type: 'page',
    title: String(title || ''),
    space: { key: spaceKey },
    status: confluenceStatus,
    body: {
      storage: {
        representation: 'storage',
        value: htmlBody
      }
    }
  };

  if (parentId) {
    payload.ancestors = [{ id: String(parentId) }];
  }

  const data = await atlassianFetch(`${confluenceBase}/rest/api/content`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const pageId = String(data.id);
  return {
    page: {
      id: pageId,
      title: data.title || '',
      body: htmlBody,
      status: specStatus,
      parentId: parentId ? String(parentId) : null,
      url: data._links?.base && data._links?.webui ? `${data._links.base}${data._links.webui}` : null
    }
  };
}

async function docs_get({ id }) {
  const { confluenceBase } = getAtlassianBases();
  const data = await atlassianFetch(
    `${confluenceBase}/rest/api/content/${encodeURIComponent(String(id))}?expand=body.storage,version,_links`
  );

  const storage = data.body?.storage?.value || '';
  const specStatus = extractSpecStatusFromStorage(storage);
  const fallback = String(data.status || '').toUpperCase();

  return {
    page: {
      id: String(data.id),
      title: data.title || '',
      body: storage,
      status: specStatus || (fallback === 'DRAFT' ? 'DRAFT' : 'UNKNOWN'),
      parentId: null,
      url: data._links?.base && data._links?.webui ? `${data._links.base}${data._links.webui}` : null,
      _version: data.version?.number
    }
  };
}

async function docs_update({ id, title, body, status }) {
  const { confluenceBase } = getAtlassianBases();
  const existing = await docs_get({ id });
  const currentVersion = Number(existing.page._version || 1);

  const nextSpecStatus = status !== undefined ? normalizeSpecStatus(status) : normalizeSpecStatus(existing.page.status);
  const confluenceStatus = nextSpecStatus === 'DRAFT' ? 'draft' : 'current';
  const rawBody = body !== undefined ? String(body) : null;
  const htmlBody = body !== undefined
    ? renderStorageHtml({ body: rawBody, specStatus: nextSpecStatus })
    : updateSpecStatusInStorage(existing.page.body, nextSpecStatus);

  const payload = {
    id: String(id),
    type: 'page',
    title: title !== undefined ? String(title) : existing.page.title,
    status: confluenceStatus,
    version: { number: currentVersion + 1 },
    body: {
      storage: {
        representation: 'storage',
        value: htmlBody
      }
    }
  };

  const data = await atlassianFetch(`${confluenceBase}/rest/api/content/${encodeURIComponent(String(id))}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  return {
    page: {
      id: String(data.id),
      title: data.title || '',
      body: htmlBody,
      status: nextSpecStatus,
      parentId: null,
      url: data._links?.base && data._links?.webui ? `${data._links.base}${data._links.webui}` : null
    }
  };
}

module.exports = {
  id: 'atlassian',
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
  }
};
