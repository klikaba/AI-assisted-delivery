#!/usr/bin/env node
/**
 * Prompt linter.
 *
 * Goals:
 * - Catch broken/accidentally edited prompt structure early.
 * - Keep checks simple and stable (avoid brittle text snapshots).
 *
 * Usage:
 *   node scripts/prompt-lint.js
 *   node scripts/prompt-lint.js --json
 */

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  return {
    json: argv.includes('--json'),
    help: argv.includes('--help') || argv.includes('-h')
  };
}

function showHelp() {
  console.log(`
Prompt Lint

Usage:
  node scripts/prompt-lint.js [--json]

Options:
  --json      Output machine-readable JSON
  --help, -h  Show this help
`);
}

function walkMarkdownFiles(rootDir) {
  const out = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.md')) {
        out.push(full);
      }
    }
  }

  return out.sort();
}

function detectMode(filePath) {
  const normalized = filePath.split(path.sep).join('/');
  if (normalized.includes('/prompts/github/')) return 'github';
  if (normalized.includes('/prompts/standalone/')) return 'standalone';
  return 'atlassian';
}

function hasAnySection(text, headings) {
  return headings.some((h) => text.includes(h));
}

function lintPrompt(filePath, text) {
  const errors = [];
  const warnings = [];
  const mode = detectMode(filePath);

  const trimmed = text.trimStart();
  const firstLine = trimmed.split('\n')[0] || '';

  if (!firstLine.startsWith('# Role:')) {
    errors.push('First line must start with "# Role:"');
  }

  if (!hasAnySection(text, ['## Interactive Dashboard Protocol', '## Interactive Protocol'])) {
    errors.push('Missing interactive protocol section ("## Interactive Dashboard Protocol" or "## Interactive Protocol")');
  }

  if (!text.includes('## Tools Usage')) {
    errors.push('Missing "## Tools Usage" section');
  }

  if (!text.includes('STOP')) {
    warnings.push('No "STOP" gating language found (may reduce governance)');
  }

  if (mode === 'atlassian') {
    if (!(text.includes('tracker.search') || text.includes('Agency MCP') || text.includes('.agency/scripts/agency-mcp.js'))) {
      warnings.push('Atlassian prompt does not mention Agency MCP capability tools (e.g., tracker.search)');
    }
  }

  if (mode === 'github') {
    if (!(text.includes('tracker.search') || text.includes('Agency MCP') || text.includes('.agency/scripts/agency-mcp.js'))) {
      warnings.push('GitHub prompt does not mention Agency MCP capability tools (e.g., tracker.search)');
    }
  }

  if (mode === 'standalone') {
    if (text.includes('Atlassian MCP') || text.includes('GitHub CLI') || text.includes('jira.') || text.includes('confluence.')) {
      warnings.push('Standalone prompt mentions a vendor integration (may be accidental)');
    }
  }

  return { mode, errors, warnings };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    showHelp();
    return;
  }

  const repoRoot = path.resolve(__dirname, '..');
  const promptsRoot = path.join(repoRoot, 'prompts');
  const files = walkMarkdownFiles(promptsRoot);

  const results = [];
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const filePath of files) {
    const text = fs.readFileSync(filePath, 'utf8');
    const res = lintPrompt(filePath, text);
    totalErrors += res.errors.length;
    totalWarnings += res.warnings.length;
    results.push({
      file: path.relative(repoRoot, filePath),
      mode: res.mode,
      errors: res.errors,
      warnings: res.warnings
    });
  }

  const payload = {
    ok: totalErrors === 0,
    totals: { files: results.length, errors: totalErrors, warnings: totalWarnings },
    results
  };

  if (args.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    for (const r of results) {
      if (r.errors.length === 0 && r.warnings.length === 0) continue;
      console.log(`${r.file} (${r.mode})`);
      for (const e of r.errors) console.log(`  ERROR: ${e}`);
      for (const w of r.warnings) console.log(`  WARN:  ${w}`);
    }
    console.log(`\nSummary: files=${payload.totals.files} errors=${payload.totals.errors} warnings=${payload.totals.warnings}`);
  }

  if (totalErrors > 0) process.exit(1);
}

main();
