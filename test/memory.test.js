const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const memoryScript = path.join(repoRoot, 'scripts', 'memory.js');

function mkTempHost() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agency-host-'));
}

function runMemory(args, hostRoot) {
  const result = cp.spawnSync(
    process.execPath,
    [memoryScript, ...args],
    {
      cwd: repoRoot,
      env: { ...process.env, AGENCY_HOST_ROOT: hostRoot },
      encoding: 'utf8'
    }
  );
  return result;
}

test('memory: uses AGENCY_HOST_ROOT as projectRoot', () => {
  const hostRoot = mkTempHost();
  const res = runMemory(['--pretty'], hostRoot);
  assert.equal(res.status, 0, res.stderr || res.stdout);

  const payload = JSON.parse(res.stdout);
  assert.equal(payload.projectRoot, hostRoot);
});

test('memory: empty or [] memory is respected (not overwritten with seed)', () => {
  const hostRoot = mkTempHost();
  const memPath = path.join(hostRoot, '.agency-memory.json');

  fs.writeFileSync(memPath, '');
  const emptyRes = runMemory(['--pretty'], hostRoot);
  assert.equal(emptyRes.status, 0, emptyRes.stderr || emptyRes.stdout);
  const emptyPayload = JSON.parse(emptyRes.stdout);
  assert.deepEqual(emptyPayload.memory, []);
  assert.equal(fs.readFileSync(memPath, 'utf8'), '', 'Expected empty file to remain empty');

  fs.writeFileSync(memPath, '[]\n');
  const arrRes = runMemory(['--pretty'], hostRoot);
  assert.equal(arrRes.status, 0, arrRes.stderr || arrRes.stdout);
  const arrPayload = JSON.parse(arrRes.stdout);
  assert.deepEqual(arrPayload.memory, []);
  assert.equal(fs.readFileSync(memPath, 'utf8'), '[]\n', 'Expected [] file to remain []');
});

