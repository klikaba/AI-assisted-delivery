#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

// CONFIG: Read-Only (From the .agency submodule)
const GLOBAL_RULES_FILE = path.join(__dirname, '../rules.md');

// SEED DATA (Generic)
const SEED_MEMORY = [
  {
    scope: 'security',
    fact: 'Never commit secrets or tokens; flag hard-coded credentials in code, logs, or comments.'
  }
];

/**
 * Load resolved configuration from config.js
 */
function loadResolvedConfig(warnings) {
  try {
    const { loadConfig } = require('./config.js');
    const { config } = loadConfig();
    return config;
  } catch (err) {
    // Config system not available or error loading
    warnings.push({
      kind: 'config-load-failed',
      message: `Failed to load configuration: ${err.message}`
    });
    return null;
  }
}

function parseArgs(argv) {
  return {
    pretty: argv.includes('--pretty')
  };
}

function gitRevParse(args, cwd) {
  try {
    return cp.execSync(`git rev-parse ${args.join(' ')}`, {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString('utf8').trim();
  } catch {
    return '';
  }
}

function detectProjectRoot() {
  // Anchor git detection to the .agency checkout location so callers can run
  // this script from any working directory.
  const agencyRoot = path.join(__dirname, '..');

  // When running inside a submodule, this returns the *host* repo root.
  const superRoot = gitRevParse(['--show-superproject-working-tree'], agencyRoot);
  if (superRoot) return superRoot;

  const topRoot = gitRevParse(['--show-toplevel'], agencyRoot);
  if (topRoot) return topRoot;

  return path.resolve(agencyRoot);
}

function safeReadText(filePath) {
  try {
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function safeReadJsonArray(filePath, warnings) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const raw = safeReadText(filePath);
  if (!raw.trim()) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    warnings.push({
      kind: 'invalid-memory-shape',
      message: `${path.basename(filePath)} must be a JSON array; preserving seed memory in output.`
    });
    // Preserve seed facts on invalid user-edited files.
    return null;
  } catch {
    warnings.push({
      kind: 'invalid-memory-json',
      message: `${path.basename(filePath)} is not valid JSON; preserving seed memory in output.`
    });
    // Preserve seed facts on invalid user-edited files.
    return null;
  }
}

function ensureSeededMemory(filePath, warnings) {
  if (!fs.existsSync(filePath)) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(SEED_MEMORY, null, 2));
      return SEED_MEMORY;
    } catch {
      warnings.push({
        kind: 'memory-write-failed',
        message: `Failed to initialize ${path.basename(filePath)}; returning seed memory in output only.`
      });
      return SEED_MEMORY;
    }
  }

  const raw = safeReadText(filePath);
  if (raw.trim() === '' || raw.trim() === '[]') {
    try {
      fs.writeFileSync(filePath, JSON.stringify(SEED_MEMORY, null, 2));
    } catch {
      warnings.push({
        kind: 'memory-write-failed',
        message: `Failed to seed ${path.basename(filePath)}; returning seed memory in output only.`
      });
      return SEED_MEMORY;
    }
    return SEED_MEMORY;
  }

  return null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const warnings = [];

  const projectRoot = detectProjectRoot();
  const localMemoryFile = path.join(projectRoot, '.agency-memory.json');
  const localRulesFile = path.join(projectRoot, '.agency-rules.md');

  // Ensure memory exists and contains at least seed facts.
  const seeded = ensureSeededMemory(localMemoryFile, warnings);
  const memory = seeded ?? safeReadJsonArray(localMemoryFile, warnings) ?? SEED_MEMORY;

  const globalRulesMarkdown = safeReadText(GLOBAL_RULES_FILE);
  const localRulesMarkdown = safeReadText(localRulesFile);

  // Load resolved configuration
  const config = loadResolvedConfig(warnings);

  const payload = {
    projectRoot,
    memory,
    config,
    rules: {
      globalMarkdown: globalRulesMarkdown,
      localMarkdown: localRulesMarkdown
    },
    warnings
  };

  if (args.pretty) {
    // Pretty mode is still pure JSON (tool-friendly), just formatted.
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  // Default: single-line JSON for tooling.
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

main();
