const assert = require('node:assert/strict');
const { test } = require('node:test');

const atlassian = require('../scripts/agency/backends/atlassian');

test('atlassian comment ADF renders bullet lists and code blocks while preserving plain-text markers', () => {
  const body = [
    'Planning complete for SCRUM-7.',
    '',
    '- Scope refined',
    '- AC coverage mapped',
    '',
    'Spec: 123 https://example.test/spec/123',
    '',
    'Execution Plan (JSON)',
    '',
    '```json',
    '{',
    '  "ticket": { "id": "SCRUM-7" }',
    '}',
    '```'
  ].join('\n');

  const doc = atlassian.__private.toAdfCommentDoc(body);
  assert.equal(doc.type, 'doc');
  assert.equal(doc.version, 1);
  assert.ok(doc.content.some((node) => node.type === 'bulletList'));
  assert.ok(doc.content.some((node) => node.type === 'codeBlock'));

  const text = atlassian.__private.adfToText(doc);
  assert.match(text, /Spec:\s+123 https:\/\/example\.test\/spec\/123/);
  assert.match(text, /Execution Plan \(JSON\)/);
  assert.match(text, /"ticket": \{ "id": "SCRUM-7" \}/);
});
