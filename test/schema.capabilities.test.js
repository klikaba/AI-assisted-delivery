const assert = require('node:assert/strict');
const { test } = require('node:test');

const { validateCapabilities } = require('../scripts/schema/capabilities');

test('capabilities schema: accepts valid payload', () => {
  const payload = {
    version: '1.0',
    mode: 'atlassian',
    backends: { tracker: 'fake', docs: 'repo', scm: 'none', tms: 'none' },
    tracker: { search: true, get: true, comment: true, update: true, transition: true, set_labels: true },
    plan: { get: true, publish: true },
    docs: { create: true, get: true, update: true },
    workflow: { summary: true, queue: true, gate_status: true, apply: true, sync_plan_review: true },
    tms: { enabled: false, suite_ensure: false, case_create: false },
    scm: { enabled: false, pr_create: false, pr_get: false, pr_comment: false, pr_set_labels: false, pr_link_ticket: false }
  };
  const res = validateCapabilities(payload);
  assert.equal(res.ok, true, res.errors?.join('; '));
});

test('capabilities schema: rejects missing fields', () => {
  const res = validateCapabilities({ version: 'nope' });
  assert.equal(res.ok, false);
  assert.ok(res.errors.length > 0);
});
