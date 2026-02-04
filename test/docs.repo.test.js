const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoBackend = require('../scripts/agency/backends/repo');

function mkTempHost() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agency-host-'));
}

test('repo docs backend: create/get/update writes to host root', () => {
  const hostRoot = mkTempHost();
  const priorHostRoot = process.env.AGENCY_HOST_ROOT;
  const priorDocsDir = process.env.AGENCY_DOCS_DIR;

  process.env.AGENCY_HOST_ROOT = hostRoot;
  process.env.AGENCY_DOCS_DIR = 'docs/agency-test';

  try {
    const created = repoBackend.docs.create({ title: 'Spec: T-1', body: 'hello\nworld', status: 'DRAFT' });
    assert.ok(created.page?.id);
    const id = created.page.id;

    const mdPath = path.join(hostRoot, 'docs', 'agency-test', `${id}.md`);
    const metaPath = path.join(hostRoot, 'docs', 'agency-test', `${id}.json`);
    assert.ok(fs.existsSync(mdPath), `Expected md file to exist: ${mdPath}`);
    assert.ok(fs.existsSync(metaPath), `Expected meta file to exist: ${metaPath}`);
    assert.equal(fs.readFileSync(mdPath, 'utf8'), 'hello\nworld');

    const got = repoBackend.docs.get({ id });
    assert.equal(got.page.id, id);
    assert.equal(got.page.title, 'Spec: T-1');
    assert.equal(got.page.status, 'DRAFT');
    assert.equal(got.page.body, 'hello\nworld');

    const updated = repoBackend.docs.update({ id, title: 'Spec: T-1 (v2)', status: 'APPROVED', body: 'new body' });
    assert.equal(updated.page.id, id);
    assert.equal(updated.page.title, 'Spec: T-1 (v2)');
    assert.equal(updated.page.status, 'APPROVED');
    assert.equal(updated.page.body, 'new body');
    assert.equal(fs.readFileSync(mdPath, 'utf8'), 'new body');

    const got2 = repoBackend.docs.get({ id });
    assert.equal(got2.page.title, 'Spec: T-1 (v2)');
    assert.equal(got2.page.status, 'APPROVED');
    assert.equal(got2.page.body, 'new body');
  } finally {
    if (priorHostRoot === undefined) delete process.env.AGENCY_HOST_ROOT;
    else process.env.AGENCY_HOST_ROOT = priorHostRoot;
    if (priorDocsDir === undefined) delete process.env.AGENCY_DOCS_DIR;
    else process.env.AGENCY_DOCS_DIR = priorDocsDir;
  }
});

test('repo docs backend: rejects docs dir escaping host root', () => {
  const hostRoot = mkTempHost();
  const priorHostRoot = process.env.AGENCY_HOST_ROOT;
  const priorDocsDir = process.env.AGENCY_DOCS_DIR;

  process.env.AGENCY_HOST_ROOT = hostRoot;

  try {
    process.env.AGENCY_DOCS_DIR = '../outside';
    assert.throws(
      () => repoBackend.docs.create({ title: 'x', body: 'y' }),
      /must stay within host root|must be a relative path/i
    );

    process.env.AGENCY_DOCS_DIR = '/tmp';
    assert.throws(
      () => repoBackend.docs.create({ title: 'x', body: 'y' }),
      /must be a relative path/i
    );
  } finally {
    if (priorHostRoot === undefined) delete process.env.AGENCY_HOST_ROOT;
    else process.env.AGENCY_HOST_ROOT = priorHostRoot;
    if (priorDocsDir === undefined) delete process.env.AGENCY_DOCS_DIR;
    else process.env.AGENCY_DOCS_DIR = priorDocsDir;
  }
});

test('repo docs backend: normalizes status to uppercase', () => {
  const hostRoot = mkTempHost();
  const priorHostRoot = process.env.AGENCY_HOST_ROOT;
  const priorDocsDir = process.env.AGENCY_DOCS_DIR;

  process.env.AGENCY_HOST_ROOT = hostRoot;
  process.env.AGENCY_DOCS_DIR = 'docs/agency-test';

  try {
    const created = repoBackend.docs.create({ title: 'Spec: T-2', body: 'x', status: 'approved' });
    assert.equal(created.page.status, 'APPROVED');

    const got = repoBackend.docs.get({ id: created.page.id });
    assert.equal(got.page.status, 'APPROVED');

    const updated = repoBackend.docs.update({ id: created.page.id, status: 'changes requested' });
    assert.equal(updated.page.status, 'CHANGES REQUESTED');
  } finally {
    if (priorHostRoot === undefined) delete process.env.AGENCY_HOST_ROOT;
    else process.env.AGENCY_HOST_ROOT = priorHostRoot;
    if (priorDocsDir === undefined) delete process.env.AGENCY_DOCS_DIR;
    else process.env.AGENCY_DOCS_DIR = priorDocsDir;
  }
});
