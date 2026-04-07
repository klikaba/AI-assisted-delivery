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

function formatFetchError(err) {
  const message = err && err.message ? err.message : String(err);
  const cause = err && err.cause && err.cause.message ? ` (${err.cause.message})` : '';
  return `${message}${cause}`;
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

function escapeCdata(text) {
  return String(text || '').replaceAll(']]>', ']]]]><![CDATA[>');
}

function renderStorageCodeBlock(code, language) {
  const languageParam = language ? `<ac:parameter ac:name="language">${htmlEscape(String(language))}</ac:parameter>` : '';
  return `<ac:structured-macro ac:name="code">${languageParam}<ac:plain-text-body><![CDATA[${escapeCdata(code)}]]></ac:plain-text-body></ac:structured-macro>`;
}

function renderStorageBodyHtml(body) {
  const raw = String(body || '').replace(/\r\n/g, '\n');
  const lines = raw.split('\n');
  const blocks = [];
  let i = 0;

  const isBlank = (line) => /^\s*$/.test(line);
  const isBullet = (line) => /^\s*[-*]\s+/.test(line);
  const isFence = (line) => /^\s*```/.test(line);
  const headingMatch = (line) => /^(\#{1,6})\s+(.+?)\s*$/.exec(line);

  while (i < lines.length) {
    if (isBlank(lines[i])) {
      i += 1;
      continue;
    }

    if (isFence(lines[i])) {
      const first = lines[i].trim();
      const language = first.slice(3).trim() || undefined;
      i += 1;
      const code = [];
      while (i < lines.length && !isFence(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      if (i < lines.length && isFence(lines[i])) i += 1;
      blocks.push(renderStorageCodeBlock(code.join('\n'), language));
      continue;
    }

    const heading = headingMatch(lines[i]);
    if (heading) {
      const level = Math.min(6, heading[1].length);
      blocks.push(`<h${level}>${htmlEscape(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (isBullet(lines[i])) {
      const items = [];
      let current = null;
      while (i < lines.length && !isBlank(lines[i]) && !isFence(lines[i]) && !headingMatch(lines[i])) {
        const line = lines[i];
        if (isBullet(line)) {
          if (current !== null) items.push(current);
          current = line.replace(/^\s*[-*]\s+/, '');
        } else if (current !== null) {
          current += `\n${line.trim()}`;
        } else {
          current = line.trim();
        }
        i += 1;
      }
      if (current !== null) items.push(current);
      blocks.push(`<ul>${items.map((item) => `<li>${htmlEscape(item).replaceAll('\n', '<br />')}</li>`).join('')}</ul>`);
      continue;
    }

    const paragraph = [];
    while (i < lines.length && !isBlank(lines[i]) && !isFence(lines[i]) && !isBullet(lines[i]) && !headingMatch(lines[i])) {
      paragraph.push(lines[i]);
      i += 1;
    }
    blocks.push(`<p>${htmlEscape(paragraph.join('\n')).replaceAll('\n', '<br />')}</p>`);
  }

  if (blocks.length === 0) return '<p></p>';
  return blocks.join('\n');
}

function renderStorageStatusBanner(specStatus) {
  const status = normalizeSpecStatus(specStatus);
  const palette = {
    APPROVED: { bg: '#E3FCEF', border: '#36B37E' },
    'CHANGES REQUESTED': { bg: '#FFEBE6', border: '#DE350B' },
    CHANGES_REQUESTED: { bg: '#FFEBE6', border: '#DE350B' },
    DRAFT: { bg: '#DEEBFF', border: '#4C9AFF' }
  };
  const colors = palette[status] || { bg: '#F4F5F7', border: '#7A869A' };
  const statusText = `<p><strong>Spec Status:</strong> ${htmlEscape(status)}</p>`;
  return [
    '<h2>Approval Gate</h2>',
    `<ac:structured-macro ac:name="panel">`,
    `<ac:parameter ac:name="bgColor">${colors.bg}</ac:parameter>`,
    `<ac:parameter ac:name="borderColor">${colors.border}</ac:parameter>`,
    `<ac:rich-text-body>${statusText}</ac:rich-text-body>`,
    '</ac:structured-macro>'
  ].join('');
}

function renderStorageHtml({ body, specStatus }) {
  const statusHtml = renderStorageStatusBanner(specStatus);
  const contentHtml = renderStorageBodyHtml(body);
  return `${statusHtml}\n${contentHtml}`;
}

function updateSpecStatusInStorage(existingHtml, specStatus) {
  const status = normalizeSpecStatus(specStatus);
  const statusHtml = renderStorageStatusBanner(status);
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

function coerceAdfDoc(value) {
  if (value && typeof value === 'object' && value.type === 'doc' && Array.isArray(value.content)) {
    return value;
  }

  if (typeof value !== 'string') return toAdfTextDoc(String(value ?? ''));

  const raw = value.trim();
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.type === 'doc' && Array.isArray(parsed.content)) {
        return parsed;
      }
    } catch {
      // Fall through to plain text wrapping.
    }
  }

  return toAdfTextDoc(value);
}

function coerceStorageSourceBody(value) {
  if (value && typeof value === 'object' && value.type === 'doc' && Array.isArray(value.content)) {
    return adfToText(value);
  }

  if (typeof value !== 'string') return String(value ?? '');

  const raw = value.trim();
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.type === 'doc' && Array.isArray(parsed.content)) {
        return adfToText(parsed);
      }
    } catch {
      // Fall through to plain text.
    }
  }

  return value;
}

function toAdfInlineText(text) {
  const value = String(text || '');
  if (!value) return [];

  const parts = [];
  const lines = value.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line) parts.push({ type: 'text', text: line });
    if (i < lines.length - 1) parts.push({ type: 'hardBreak' });
  }
  return parts;
}

function toAdfParagraph(text) {
  return { type: 'paragraph', content: toAdfInlineText(text) };
}

function toAdfBulletList(items) {
  return {
    type: 'bulletList',
    content: items.map((item) => ({
      type: 'listItem',
      content: [toAdfParagraph(item)]
    }))
  };
}

function toAdfCodeBlock(text, language) {
  const attrs = {};
  if (language) attrs.language = String(language);
  return {
    type: 'codeBlock',
    attrs,
    content: [{ type: 'text', text: String(text || '') }]
  };
}

function toAdfCommentDoc(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n');
  const lines = raw.split('\n');
  const content = [];
  let i = 0;

  const isBlank = (line) => /^\s*$/.test(line);
  const isBullet = (line) => /^\s*[-*]\s+/.test(line);
  const isFence = (line) => /^\s*```/.test(line);

  while (i < lines.length) {
    if (isBlank(lines[i])) {
      i += 1;
      continue;
    }

    if (isFence(lines[i])) {
      const first = lines[i].trim();
      const language = first.slice(3).trim() || undefined;
      i += 1;
      const body = [];
      while (i < lines.length && !isFence(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      if (i < lines.length && isFence(lines[i])) i += 1;
      content.push(toAdfCodeBlock(body.join('\n'), language));
      continue;
    }

    if (isBullet(lines[i])) {
      const items = [];
      let current = null;
      while (i < lines.length && !isBlank(lines[i])) {
        const line = lines[i];
        if (isBullet(line)) {
          if (current !== null) items.push(current);
          current = line.replace(/^\s*[-*]\s+/, '');
        } else if (current !== null) {
          current += `\n${line.trim()}`;
        } else {
          current = line.trim();
        }
        i += 1;
      }
      if (current !== null) items.push(current);
      content.push(toAdfBulletList(items));
      continue;
    }

    const paragraph = [];
    while (i < lines.length && !isBlank(lines[i]) && !isFence(lines[i]) && !isBullet(lines[i])) {
      paragraph.push(lines[i]);
      i += 1;
    }
    content.push(toAdfParagraph(paragraph.join('\n')));
  }

  if (content.length === 0) return toAdfTextDoc('');
  return { type: 'doc', version: 1, content };
}

function adfToText(node) {
  const parts = [];

  function walk(n) {
    if (!n) return;
    if (typeof n === 'string') {
      parts.push(n);
      return;
    }
    if (typeof n !== 'object') return;

    if (n.type === 'text' && typeof n.text === 'string') {
      parts.push(n.text);
      return;
    }
    if (n.type === 'hardBreak') {
      parts.push('\n');
      return;
    }

    if (n.type === 'codeBlock' && Array.isArray(n.content)) {
      for (const c of n.content) walk(c);
      parts.push('\n');
      return;
    }

    const isBlock = n.type === 'paragraph' || n.type === 'heading' || n.type === 'listItem' || n.type === 'codeBlock';
    const before = parts.length;
    if (Array.isArray(n.content)) {
      for (const c of n.content) walk(c);
    }
    if (isBlock && parts.length > before) parts.push('\n');
  }

  walk(node);
  return parts
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
      throw new Error(`${method} ${url} failed: ${formatFetchError(err)}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`${method} ${url} failed`);
}

function itemUrl(jiraBase, key) {
  return `${jiraBase}/browse/${encodeURIComponent(String(key))}`;
}

function normalizeTransitionName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizeIssue(jiraBase, issue) {
  const fields = issue.fields || {};
  const labels = Array.isArray(fields.labels) ? fields.labels.map(String).sort() : [];
  const status = fields.status && fields.status.name ? String(fields.status.name) : null;
  const title = fields.summary ? String(fields.summary) : '';
  const body = fields.description ? adfToText(fields.description) : '';

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

async function tracker_comments({ id, limit }) {
  const { jiraBase } = getAtlassianBases();
  const wantedLimit = clamp(Number(limit || 50), 1, 200);
  const results = [];
  let startAt = 0;
  const pageSize = clamp(Number(process.env.AGENCY_ATLASSIAN_COMMENT_PAGE_SIZE || 50), 1, 100);

  while (results.length < wantedLimit) {
    const url = new URL(`${jiraBase}/rest/api/3/issue/${encodeURIComponent(String(id))}/comment`);
    url.searchParams.set('startAt', String(startAt));
    url.searchParams.set('maxResults', String(Math.min(pageSize, wantedLimit - results.length)));
    url.searchParams.set('orderBy', 'created');

    // eslint-disable-next-line no-await-in-loop
    const data = await atlassianFetch(url.toString());
    const comments = Array.isArray(data.comments) ? data.comments : [];
    for (const c of comments) {
      const text = adfToText(c && c.body ? c.body : '');
      if (text) results.push(text);
      if (results.length >= wantedLimit) break;
    }
    if (comments.length === 0) break;
    startAt += comments.length;
    const total = Number(data.total);
    if (Number.isFinite(total) && startAt >= total) break;
  }

  return results;
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
  const seenIssueIds = new Set();
  let startAt = 0;
  const pageSize = clamp(Number(process.env.AGENCY_ATLASSIAN_PAGE_SIZE || 50), 1, 100);

  while (results.length < wantedLimit) {
    const url = new URL(`${jiraBase}/rest/api/3/search/jql`);
    url.searchParams.set('jql', q);
    url.searchParams.set('startAt', String(startAt));
    url.searchParams.set('maxResults', String(Math.min(pageSize, wantedLimit - results.length)));
    url.searchParams.set('fields', 'summary,labels,status,description');

    // eslint-disable-next-line no-await-in-loop
    const data = await atlassianFetch(url.toString());
    const issues = Array.isArray(data.issues) ? data.issues : [];
    let newCount = 0;
    for (const issue of issues) {
      const issueId = String(issue.id || issue.key || '');
      if (issueId && seenIssueIds.has(issueId)) continue;
      if (issueId) seenIssueIds.add(issueId);
      results.push(normalizeIssue(jiraBase, issue));
      newCount += 1;
      if (results.length >= wantedLimit) break;
    }
    if (issues.length === 0) break;
    if (newCount === 0) break;
    startAt += issues.length;
    const total = Number(data.total);
    if (Number.isFinite(total) && startAt >= total) break;
  }

  if (results.length === 0) return { items: [] };
  return { items: results };
}

async function tracker_get({ id }) {
  const { jiraBase } = getAtlassianBases();
  const url = new URL(`${jiraBase}/rest/api/3/issue/${encodeURIComponent(String(id))}`);
  url.searchParams.set('fields', 'summary,labels,status,description');
  const issue = await atlassianFetch(url.toString());
  const item = normalizeIssue(jiraBase, issue);
  item.comments = await tracker_comments({ id, limit: 200 });
  return { item };
}

async function tracker_comment({ id, body }) {
  const { jiraBase } = getAtlassianBases();
  const url = `${jiraBase}/rest/api/3/issue/${encodeURIComponent(String(id))}/comment`;
  await atlassianFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: toAdfCommentDoc(body) })
  });
  return { ok: true };
}

async function tracker_update({ id, title, body }) {
  const { jiraBase } = getAtlassianBases();
  if (title === undefined && body === undefined) {
    throw new Error('tracker.update requires title and/or body');
  }

  const fields = {};
  if (title !== undefined) fields.summary = String(title);
  if (body !== undefined) fields.description = coerceAdfDoc(body);

  const url = `${jiraBase}/rest/api/3/issue/${encodeURIComponent(String(id))}`;
  await atlassianFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
  return tracker_get({ id });
}

async function tracker_set_labels({ id, add, remove }) {
  const { jiraBase } = getAtlassianBases();
  const addList = Array.from(new Set((add || []).map(String).filter(Boolean)));
  const removeList = Array.from(new Set((remove || []).map(String).filter(Boolean)));

  const url = `${jiraBase}/rest/api/3/issue/${encodeURIComponent(String(id))}`;
  const update = [];
  for (const label of removeList) update.push({ remove: label });
  for (const label of addList) update.push({ add: label });

  if (update.length === 0) {
    const current = await tracker_get({ id });
    return { ok: true, labels: Array.isArray(current.item.labels) ? current.item.labels.map(String).sort() : [] };
  }

  await atlassianFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ update: { labels: update } })
  });

  const current = await tracker_get({ id });
  return { ok: true, labels: Array.isArray(current.item.labels) ? current.item.labels.map(String).sort() : [] };
}

async function tracker_transition({ id, status }) {
  const { jiraBase } = getAtlassianBases();
  const desired = String(status);
  const desiredNormalized = normalizeTransitionName(desired);
  const url = `${jiraBase}/rest/api/3/issue/${encodeURIComponent(String(id))}/transitions`;

  const available = await atlassianFetch(url);
  const transitions = Array.isArray(available.transitions) ? available.transitions : [];
  const match = transitions.find((t) => {
    const transitionName = normalizeTransitionName(t.name);
    const targetStatus = normalizeTransitionName(t.to?.name || '');
    return transitionName === desiredNormalized || targetStatus === desiredNormalized;
  });
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
  const sourceBody = coerceStorageSourceBody(body);
  const htmlBody = renderStorageHtml({ body: sourceBody, specStatus });

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

async function docs_update({ id, title, body, status, body_format }) {
  const { confluenceBase } = getAtlassianBases();
  const existing = await docs_get({ id });
  const currentVersion = Number(existing.page._version || 1);

  const nextSpecStatus = status !== undefined ? normalizeSpecStatus(status) : normalizeSpecStatus(existing.page.status);
  const confluenceStatus = nextSpecStatus === 'DRAFT' ? 'draft' : 'current';
  const rawBody = body !== undefined ? coerceStorageSourceBody(body) : null;
  const htmlBody = body !== undefined
    ? (String(body_format || '') === 'storage'
      ? String(rawBody)
      : renderStorageHtml({ body: rawBody, specStatus: nextSpecStatus }))
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
    update: tracker_update,
    transition: tracker_transition,
    set_labels: tracker_set_labels
  },
  docs: {
    create: docs_create,
    get: docs_get,
    update: docs_update
  },
  __private: {
    toAdfCommentDoc,
    coerceAdfDoc,
    coerceStorageSourceBody,
    adfToText,
    normalizeIssue,
    renderStorageHtml,
    extractSpecStatusFromStorage,
    escapeCdata,
    normalizeTransitionName
  }
};
