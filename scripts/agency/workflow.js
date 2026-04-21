const { validatePlan } = require('../schema/plan');

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

function extractJsonBlock(comment) {
  const text = String(comment || '');
  const confluenceCode = /<ac:plain-text-body><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>/i.exec(text);
  if (confluenceCode) return confluenceCode[1].replaceAll(']]]]><![CDATA[>', ']]>').trim();
  const fenced = /```json\s*([\s\S]*?)```/i.exec(text) || /```\s*([\s\S]*?)```/i.exec(text);
  if (fenced) return fenced[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1).trim();
  return null;
}

function extractExecutionPlanSection(text) {
  const source = String(text || '');
  const marked = /<!--\s*AGENCY_EXECUTION_PLAN_START\s*-->([\s\S]*?)<!--\s*AGENCY_EXECUTION_PLAN_END\s*-->/i.exec(source);
  if (marked) return marked[1];

  const marker = /Execution\s+Plan\s*\(JSON\)/i.exec(source);
  if (!marker) return null;
  return source.slice(marker.index);
}

function parsePlanArtifactFromText(text, ref = null) {
  const planSection = extractExecutionPlanSection(text);
  if (!planSection) return null;
  const jsonText = extractJsonBlock(planSection);
  if (!jsonText) {
    return {
      ref,
      plan: null,
      valid: false,
      errors: ['Execution plan found but JSON payload could not be extracted']
    };
  }
  try {
    const plan = JSON.parse(jsonText);
    const validation = validatePlan(plan);
    return {
      ref,
      plan,
      valid: validation.ok,
      errors: validation.ok ? [] : validation.errors
    };
  } catch (err) {
    return {
      ref,
      plan: null,
      valid: false,
      errors: [`Plan JSON parse failed: ${err && err.message ? err.message : String(err)}`]
    };
  }
}

function parsePlanArtifactFromComments(comments) {
  const list = Array.isArray(comments) ? comments.map(String) : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const parsed = parsePlanArtifactFromText(list[i], { index: i, marker: 'comment' });
    if (parsed) return parsed;
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
  parsePlanArtifactFromText,
  parsePlanArtifactFromComments,
  normalizeStatus,
  safeLabelIncludes,
  workflowLabel,
  workflowGate
};
