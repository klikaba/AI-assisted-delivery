function parseSpecRefFromComments(comments) {
  const list = Array.isArray(comments) ? comments.map(String) : [];
  for (const c of list) {
    const m = /Spec\s*:\s*([^\s]+)(?:\s+(\S+))?/i.exec(c);
    if (m) return { id: m[1], url: m[2] || null };
  }
  for (const c of list) {
    const m = /Confluence\s+Spec\s*:\s*(\S+)/i.exec(c);
    if (m) return { id: null, url: m[1] };
  }
  return null;
}

function parsePrRefFromComments(comments) {
  const list = Array.isArray(comments) ? comments.map(String) : [];
  for (const c of list) {
    const m = /PR\s*:\s*(\S+)/i.exec(c);
    if (m) return { url: m[1] };
  }
  return null;
}

function parseGitHubPrNumberFromUrl(url) {
  const u = String(url || '');
  const m = /\/pull\/(\d+)(?:\b|\/|$)/.exec(u);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseMarkerFromComments(comments, prefix) {
  const list = Array.isArray(comments) ? comments.map(String) : [];
  const p = String(prefix);
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const c = list[i];
    const re = new RegExp(`${p}\\s*:\\s*(PASS|FAIL)\\b`, 'i');
    const m = re.exec(c);
    if (m) return String(m[1]).toUpperCase();
  }
  return null;
}

function parseQaMarker(comments) {
  return parseMarkerFromComments(comments, 'QA');
}

function parseReviewMarker(comments) {
  return parseMarkerFromComments(comments, 'Review');
}

function parseSecurityMarker(comments) {
  return parseMarkerFromComments(comments, 'Security');
}

function parseTestCasesRefFromComments(comments) {
  const list = Array.isArray(comments) ? comments.map(String) : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const c = list[i];
    const m = /TestCases\s*:\s*(.+)$/im.exec(c);
    if (m) return String(m[1]).trim();
  }
  return null;
}

function normalizeStatus(status) {
  if (status === undefined || status === null) return '';
  return String(status).trim().toUpperCase();
}

function safeLabelIncludes(labels, label) {
  if (!label) return false;
  const list = Array.isArray(labels) ? labels.map(String) : [];
  return list.includes(String(label));
}

function workflowLabel(config, key, fallback) {
  const v = config?.workflow?.labels?.[key];
  if (typeof v === 'string' && v.trim()) return v.trim();
  return fallback;
}

function workflowGate(config, key, fallback = true) {
  const v = config?.workflow?.gates?.[key];
  if (typeof v === 'boolean') return v;
  return fallback;
}

module.exports = {
  parseSpecRefFromComments,
  parsePrRefFromComments,
  parseGitHubPrNumberFromUrl,
  parseQaMarker,
  parseReviewMarker,
  parseSecurityMarker,
  parseTestCasesRefFromComments,
  normalizeStatus,
  safeLabelIncludes,
  workflowLabel,
  workflowGate
};
