const assert = require('node:assert/strict');
const { test } = require('node:test');

const { validatePlan } = require('../scripts/schema/plan');
const { parsePlanArtifactFromText } = require('../scripts/agency/workflow');
const {
  EXECUTION_PLAN_START,
  EXECUTION_PLAN_END,
  EXECUTION_PLAN_MACRO_TITLE,
  executionPlanMarkdown,
  executionPlanStorageHtml
} = require('../scripts/agency/plan-artifact');

test('plan schema: accepts valid plan', () => {
  const plan = {
    version: '1.0',
    ticket: { id: 'ABC-1', key: 'ABC-1', title: 'Test', url: null },
    acceptanceCriteria: [],
    filesToTouch: [],
    steps: [{ id: '1', description: 'Do thing', acRefs: [] }]
  };
  const res = validatePlan(plan);
  assert.equal(res.ok, true, res.errors?.join('\n'));
});

test('plan schema: rejects missing fields', () => {
  const res = validatePlan({ version: '1.0' });
  assert.equal(res.ok, false);
  assert.ok(res.errors.length >= 1);
});

function validPlanJson(id = 'ABC-1') {
  return JSON.stringify({
    version: '1.0',
    ticket: { id, key: id, title: 'Test', url: null },
    acceptanceCriteria: ['AC-1'],
    filesToTouch: ['src/app.js'],
    steps: [{ id: '1', description: 'Do thing', acRefs: ['AC-1'] }]
  }, null, 2);
}

function validPlan(id = 'ABC-1') {
  return JSON.parse(validPlanJson(id));
}

test('plan parser: ignores earlier Confluence code macros before execution plan', () => {
  const html = [
    '<h1>Diagram(s)</h1>',
    '<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">mermaid</ac:parameter><ac:plain-text-body><![CDATA[flowchart LR',
    'A --> B]]></ac:plain-text-body></ac:structured-macro>',
    '<h2>Execution Plan (JSON)</h2>',
    `<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">json</ac:parameter><ac:plain-text-body><![CDATA[${validPlanJson()}]]></ac:plain-text-body></ac:structured-macro>`
  ].join('\n');

  const res = parsePlanArtifactFromText(html, { marker: 'docs', id: 'page-1' });
  assert.equal(res.valid, true, res.errors?.join('\n'));
  assert.equal(res.plan.ticket.id, 'ABC-1');
});

test('plan parser: ignores earlier Markdown code fences before execution plan', () => {
  const markdown = [
    '# Diagram(s)',
    '```mermaid',
    'flowchart LR',
    'A --> B',
    '```',
    '',
    '## Execution Plan (JSON)',
    '```json',
    validPlanJson('ABC-2'),
    '```'
  ].join('\n');

  const res = parsePlanArtifactFromText(markdown, { marker: 'docs', id: 'doc-1' });
  assert.equal(res.valid, true, res.errors?.join('\n'));
  assert.equal(res.plan.ticket.id, 'ABC-2');
});

test('plan parser: reports invalid JSON inside execution plan section', () => {
  const markdown = [
    '## Execution Plan (JSON)',
    '```json',
    '{not-json}',
    '```'
  ].join('\n');

  const res = parsePlanArtifactFromText(markdown);
  assert.equal(res.valid, false);
  assert.match(res.errors.join('\n'), /Plan JSON parse failed/);
});

test('plan parser: prefers machine marker block over earlier heading section', () => {
  const markdown = [
    '## Execution Plan (JSON)',
    '```json',
    '{not-json}',
    '```',
    '',
    '<!-- AGENCY_EXECUTION_PLAN_START -->',
    '## Execution Plan (JSON)',
    '```json',
    validPlanJson('ABC-3'),
    '```',
    '<!-- AGENCY_EXECUTION_PLAN_END -->'
  ].join('\n');

  const res = parsePlanArtifactFromText(markdown);
  assert.equal(res.valid, true, res.errors?.join('\n'));
  assert.equal(res.plan.ticket.id, 'ABC-3');
});

test('plan parser: reads marker-bounded Confluence storage section', () => {
  const html = [
    '<h2>Execution Plan (JSON)</h2>',
    '<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[flowchart LR]]></ac:plain-text-body></ac:structured-macro>',
    '<!-- AGENCY_EXECUTION_PLAN_START -->',
    '<h2>Execution Plan (JSON)</h2>',
    `<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">json</ac:parameter><ac:plain-text-body><![CDATA[${validPlanJson('ABC-4')}]]></ac:plain-text-body></ac:structured-macro>`,
    '<!-- AGENCY_EXECUTION_PLAN_END -->'
  ].join('\n');

  const res = parsePlanArtifactFromText(html);
  assert.equal(res.valid, true, res.errors?.join('\n'));
  assert.equal(res.plan.ticket.id, 'ABC-4');
});

test('plan renderer: emits shared markers for Markdown execution plans', () => {
  const markdown = executionPlanMarkdown(validPlan('ABC-5'));
  assert.match(markdown, new RegExp(`<!-- ${EXECUTION_PLAN_START} -->`));
  assert.match(markdown, new RegExp(`<!-- ${EXECUTION_PLAN_END} -->`));
  assert.match(markdown, /## Execution Plan \(JSON\)/);

  const res = parsePlanArtifactFromText(markdown);
  assert.equal(res.valid, true, res.errors?.join('\n'));
  assert.equal(res.plan.ticket.id, 'ABC-5');
});

test('plan renderer: emits comment and title markers for Confluence storage execution plans', () => {
  const html = executionPlanStorageHtml(validPlan('ABC-6'));
  assert.match(html, new RegExp(`<!-- ${EXECUTION_PLAN_START} -->`));
  assert.match(html, new RegExp(`<!-- ${EXECUTION_PLAN_END} -->`));
  assert.match(html, new RegExp(`<ac:parameter ac:name="title">${EXECUTION_PLAN_MACRO_TITLE}</ac:parameter>`));

  const res = parsePlanArtifactFromText(html);
  assert.equal(res.valid, true, res.errors?.join('\n'));
  assert.equal(res.plan.ticket.id, 'ABC-6');
});

test('plan parser: reads Confluence title marker when comment markers are absent', () => {
  const html = [
    '<ac:structured-macro ac:name="code">',
    '<ac:parameter ac:name="title">DIAGRAM</ac:parameter>',
    '<ac:plain-text-body><![CDATA[flowchart LR]]></ac:plain-text-body>',
    '</ac:structured-macro>',
    '<h2>Execution Plan (JSON)</h2>',
    '<ac:structured-macro ac:name="code">',
    `<ac:parameter ac:name="title">${EXECUTION_PLAN_MACRO_TITLE}</ac:parameter>`,
    '<ac:parameter ac:name="language">json</ac:parameter>',
    `<ac:plain-text-body><![CDATA[${validPlanJson('ABC-7')}]]></ac:plain-text-body>`,
    '</ac:structured-macro>'
  ].join('');

  const res = parsePlanArtifactFromText(html);
  assert.equal(res.valid, true, res.errors?.join('\n'));
  assert.equal(res.plan.ticket.id, 'ABC-7');
});
