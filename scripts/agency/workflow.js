const { parsePlanArtifactFromText } = require('./plan-artifact');

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

function workflowLabels(config) {
  return {
    ready_for_plan: workflowLabel(config, 'ready_for_plan', 'ai-state:ready-for-plan'),
    plan_review: workflowLabel(config, 'plan_review', 'ai-state:plan-review'),
    approved: workflowLabel(config, 'approved', 'ai-state:approved'),
    in_qa: workflowLabel(config, 'in_qa', 'ai-state:in-qa'),
    verified: workflowLabel(config, 'verified', 'ai-state:verified'),
    reviewed: workflowLabel(config, 'reviewed', 'ai-state:reviewed'),
    security_pass: workflowLabel(config, 'security_pass', 'ai-state:security-pass'),
    security_fail: workflowLabel(config, 'security_fail', 'ai-state:security-fail')
  };
}

function workflowStage(labels, labelsNeeded) {
  const defs = labelsNeeded || workflowLabels(null);
  if (safeLabelIncludes(labels, defs.reviewed)) return 'reviewed';
  if (safeLabelIncludes(labels, defs.verified)) return 'verified';
  if (safeLabelIncludes(labels, defs.in_qa)) return 'in_qa';
  if (safeLabelIncludes(labels, defs.approved)) return 'approved';
  if (safeLabelIncludes(labels, defs.plan_review)) return 'plan_review';
  if (safeLabelIncludes(labels, defs.ready_for_plan)) return 'ready_for_plan';
  return 'none';
}

function classifyWorkflowGates({
  config,
  labels,
  spec,
  planLinked,
  planValid,
  prLinked,
  scmEnabled,
  qaMarker,
  reviewMarker,
  securityMarker,
  testCasesRef,
  tmsProvider
}) {
  const list = Array.isArray(labels) ? labels.map(String) : [];
  const labelsNeeded = workflowLabels(config);
  const stage = workflowStage(list, labelsNeeded);

  const gateSpec = workflowGate(config, 'spec_approval', true);
  const gateQa = workflowGate(config, 'qa_verification', true);
  const gateReview = workflowGate(config, 'code_review', true);
  const gateSecurity = workflowGate(config, 'security_audit', false);
  const gateTestCases = workflowGate(config, 'test_cases', true);
  const requiresTmsCases = gateTestCases && String(tmsProvider || 'none') !== 'none';

  const specPresent = Boolean(spec && !spec.missing);
  const specApproved = !gateSpec || normalizeStatus(spec?.status) === 'APPROVED';
  const hasPlan = Boolean(planLinked);
  const validPlan = Boolean(planValid);
  const hasPr = Boolean(prLinked);
  const prRequired = Boolean(scmEnabled);
  const qaPassed = !gateQa || safeLabelIncludes(list, labelsNeeded.verified);
  const reviewPassed = !gateReview || safeLabelIncludes(list, labelsNeeded.reviewed);
  const securityPassed = !gateSecurity
    || safeLabelIncludes(list, labelsNeeded.security_pass)
    || normalizeStatus(securityMarker) === 'PASS';

  const isCurrentQa = stage === 'in_qa';
  const isCurrentReview = stage === 'verified';
  const isCurrentRelease = stage === 'verified' || stage === 'reviewed';
  const isPastDevelopment = stage === 'in_qa' || stage === 'verified' || stage === 'reviewed';

  const gateItems = [
    { name: 'spec link', required: true, passed: specPresent, current: !specPresent },
    { name: 'spec approval', required: gateSpec && specPresent, passed: specApproved, current: gateSpec && specPresent && !specApproved },
    { name: 'execution plan', required: specPresent, passed: hasPlan, current: specPresent && !hasPlan },
    { name: 'valid execution plan', required: hasPlan, passed: validPlan, current: hasPlan && !validPlan },
    { name: 'pull request', required: prRequired, passed: hasPr, current: prRequired && isPastDevelopment && !hasPr },
    { name: 'qa verification', required: gateQa, passed: qaPassed, current: gateQa && isCurrentQa && !qaPassed },
    { name: 'code review', required: gateReview, passed: reviewPassed, current: gateReview && isCurrentReview && !reviewPassed },
    { name: 'security audit', required: gateSecurity, passed: securityPassed, current: gateSecurity && isCurrentRelease && !securityPassed },
    {
      name: 'test cases',
      required: requiresTmsCases,
      passed: Boolean(testCasesRef),
      current: requiresTmsCases && (isCurrentQa || isCurrentReview) && !testCasesRef
    }
  ];

  const currentBlockers = gateItems
    .filter((g) => g.required && !g.passed && g.current)
    .map((g) => g.name);
  const futureGates = gateItems
    .filter((g) => g.required && !g.passed && !g.current)
    .map((g) => g.name);

  return {
    stage,
    labels: labelsNeeded,
    gates: {
      spec_approval: { required: gateSpec, passed: specApproved },
      qa_verification: { required: gateQa, passed: qaPassed },
      code_review: { required: gateReview, passed: reviewPassed },
      security_audit: { required: gateSecurity, passed: securityPassed },
      test_cases: { required: requiresTmsCases, passed: Boolean(testCasesRef) },
      pull_request: { required: prRequired, passed: !prRequired || hasPr }
    },
    current_blockers: currentBlockers,
    future_gates: futureGates,
    markers: {
      qa: qaMarker || null,
      review: reviewMarker || null,
      security: securityMarker || null
    }
  };
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
  workflowGate,
  workflowLabels,
  workflowStage,
  classifyWorkflowGates
};
