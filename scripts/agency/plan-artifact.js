const { validatePlan } = require('../schema/plan');

const EXECUTION_PLAN_HEADING = 'Execution Plan (JSON)';
const EXECUTION_PLAN_START = 'AGENCY_EXECUTION_PLAN_START';
const EXECUTION_PLAN_END = 'AGENCY_EXECUTION_PLAN_END';
const EXECUTION_PLAN_MACRO_TITLE = 'AGENCY_EXECUTION_PLAN';

function escapeCdata(text) {
  return String(text || '').replaceAll(']]>', ']]]]><![CDATA[>');
}

function executionPlanMarkdown(plan) {
  return [
    `<!-- ${EXECUTION_PLAN_START} -->`,
    `## ${EXECUTION_PLAN_HEADING}`,
    '',
    '```json',
    JSON.stringify(plan, null, 2),
    '```',
    `<!-- ${EXECUTION_PLAN_END} -->`
  ].join('\n');
}

function executionPlanStorageMacro(plan) {
  const json = escapeCdata(JSON.stringify(plan, null, 2));
  return [
    '<ac:structured-macro ac:name="code">',
    `<ac:parameter ac:name="title">${EXECUTION_PLAN_MACRO_TITLE}</ac:parameter>`,
    '<ac:parameter ac:name="language">json</ac:parameter>',
    `<ac:plain-text-body><![CDATA[${json}]]></ac:plain-text-body>`,
    '</ac:structured-macro>'
  ].join('');
}

function executionPlanStorageHtml(plan) {
  return [
    `<!-- ${EXECUTION_PLAN_START} -->`,
    `<h2>${EXECUTION_PLAN_HEADING}</h2>`,
    executionPlanStorageMacro(plan),
    `<!-- ${EXECUTION_PLAN_END} -->`
  ].join('\n');
}

function markerCommentRe() {
  return new RegExp(`<!--\\s*${EXECUTION_PLAN_START}\\s*-->[\\s\\S]*?<!--\\s*${EXECUTION_PLAN_END}\\s*-->`, 'i');
}

function titledStorageMacroRe() {
  return new RegExp(`<ac:structured-macro\\b(?:(?!<\\/ac:structured-macro>)[\\s\\S])*?<ac:parameter\\s+ac:name="title">\\s*${EXECUTION_PLAN_MACRO_TITLE}\\s*<\\/ac:parameter>(?:(?!<\\/ac:structured-macro>)[\\s\\S])*?<\\/ac:structured-macro>`, 'i');
}

function upsertExecutionPlanMarkdown(body, plan) {
  const section = executionPlanMarkdown(plan);
  const source = String(body || '').trim();
  const marked = markerCommentRe();
  if (marked.test(source)) return source.replace(marked, section);
  const re = /(^|\n)##\s+Execution Plan \(JSON\)\s*\n[\s\S]*?(?=\n##\s+|\n#\s+|$)/i;
  if (re.test(source)) return source.replace(re, `$1${section}`);
  return source ? `${source}\n\n${section}` : section;
}

function upsertExecutionPlanStorage(body, plan) {
  const section = executionPlanStorageHtml(plan);
  const source = String(body || '').trim();
  const marked = markerCommentRe();
  if (marked.test(source)) return source.replace(marked, section);
  const titled = titledStorageMacroRe();
  if (titled.test(source)) return source.replace(titled, executionPlanStorageMacro(plan));
  const re = /<h2>\s*Execution Plan \(JSON\)\s*<\/h2>[\s\S]*?(?=<h1\b|<h2\b|$)/i;
  if (re.test(source)) return source.replace(re, section);
  return source ? `${source}\n${section}` : section;
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
  const marked = markerCommentRe().exec(source);
  if (marked) return marked[0];

  const titled = titledStorageMacroRe().exec(source);
  if (titled) return titled[0];

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

module.exports = {
  EXECUTION_PLAN_HEADING,
  EXECUTION_PLAN_START,
  EXECUTION_PLAN_END,
  EXECUTION_PLAN_MACRO_TITLE,
  executionPlanMarkdown,
  executionPlanStorageHtml,
  upsertExecutionPlanMarkdown,
  upsertExecutionPlanStorage,
  parsePlanArtifactFromText
};
