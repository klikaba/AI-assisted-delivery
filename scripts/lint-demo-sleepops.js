#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const demoRoot = path.join(repoRoot, 'demo', 'sleepops-console');
const publicDir = path.join(demoRoot, 'public');
const dataFile = path.join(demoRoot, 'data', 'devices.json');

const syntaxFiles = [
  path.join(demoRoot, 'server.js'),
  path.join(publicDir, 'app.mjs'),
  path.join(publicDir, 'lib', 'device-health.mjs')
];

const requiredDeviceKeys = [
  'deviceId',
  'bedLabel',
  'region',
  'status',
  'lastHeartbeatMinutes',
  'stateDurationMinutes'
];

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function ensureFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing required file: ${path.relative(repoRoot, filePath)}`);
    return false;
  }

  return true;
}

function checkSyntax(filePath) {
  const result = spawnSync(process.execPath, ['--check', filePath], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    fail(`Syntax check failed for ${path.relative(repoRoot, filePath)}\n${output}`);
  }
}

function checkReferencedAssets() {
  const indexPath = path.join(publicDir, 'index.html');
  if (!ensureFile(indexPath)) return;

  const html = fs.readFileSync(indexPath, 'utf8');
  const matches = [...html.matchAll(/(?:href|src)="(\/[^"]+)"/g)];

  for (const [, assetPath] of matches) {
    if (assetPath.startsWith('/api/')) continue;
    const localPath = path.join(publicDir, assetPath.slice(1));
    ensureFile(localPath);
  }
}

function checkDeviceFixture() {
  if (!ensureFile(dataFile)) return;

  let devices;
  try {
    devices = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  } catch (error) {
    fail(`Invalid JSON in ${path.relative(repoRoot, dataFile)}: ${error.message}`);
    return;
  }

  if (!Array.isArray(devices) || devices.length === 0) {
    fail('Device fixture must be a non-empty JSON array.');
    return;
  }

  devices.forEach((device, index) => {
    if (!device || typeof device !== 'object' || Array.isArray(device)) {
      fail(`Device fixture entry ${index} must be an object.`);
      return;
    }

    for (const key of requiredDeviceKeys) {
      if (!(key in device)) {
        fail(`Device fixture entry ${index} is missing required key "${key}".`);
      }
    }
  });
}

for (const filePath of syntaxFiles) {
  if (ensureFile(filePath)) {
    checkSyntax(filePath);
  }
}

checkReferencedAssets();
checkDeviceFixture();

if (process.exitCode) {
  process.exit(process.exitCode);
}

process.stdout.write('SleepOps static checks passed.\n');
