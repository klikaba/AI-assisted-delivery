const assert = require('node:assert/strict');
const { test } = require('node:test');

const { validatePlan } = require('../scripts/schema/plan');

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

