#!/usr/bin/env node
/**
 * Live checks for real integrations (network + auth).
 *
 * This script is invoked by `scripts/doctor.js` when AGENCY_DOCTOR_LIVE=1.
 * It should be safe to run in a host repo and should avoid destructive actions.
 *
 * Checks:
 * - Atlassian (REST backend): Jira /myself and Confluence space read
 * - GitHub: `gh auth status`
 */

const cp = require('child_process');
const path = require('path');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

function normalizeBaseUrl(url) {
  return String(url).replace(/\/+$/, '');
}

function loadResolvedConfig() {
  const repoRoot = path.resolve(__dirname, '..');
  const hostRoot = process.env.AGENCY_HOST_ROOT || process.cwd();
  const configScript = path.join(repoRoot, 'scripts', 'config.js');
  const res = cp.spawnSync(process.execPath, [configScript], {
    cwd: repoRoot,
    env: { ...process.env, AGENCY_HOST_ROOT: hostRoot },
    encoding: 'utf8'
  });
  if (res.status !== 0) {
    throw new Error(`Failed to load resolved config:\n${res.stdout}\n${res.stderr}`);
  }
  return JSON.parse(res.stdout);
}

async function checkAtlassianApi(config) {
  const site = process.env.ATLASSIAN_SITE ? normalizeBaseUrl(process.env.ATLASSIAN_SITE) : null;
  const jiraBase = normalizeBaseUrl(process.env.JIRA_BASE_URL || site || '');
  const confluenceBase = normalizeBaseUrl(process.env.CONFLUENCE_BASE_URL || (site ? `${site}/wiki` : ''));

  if (!jiraBase) throw new Error('Set ATLASSIAN_SITE or JIRA_BASE_URL');
  if (!confluenceBase) throw new Error('Set ATLASSIAN_SITE or CONFLUENCE_BASE_URL');

  const email = requireEnv('ATLASSIAN_EMAIL');
  const token = requireEnv('ATLASSIAN_API_TOKEN');
  const basic = Buffer.from(`${email}:${token}`, 'utf8').toString('base64');
  const auth = `Basic ${basic}`;

  // Jira auth check: /myself
  {
    const res = await fetch(`${jiraBase}/rest/api/3/myself`, {
      headers: { Authorization: auth, Accept: 'application/json' }
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira auth check failed: HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`);
    }
  }

  // Confluence space check (read-only)
  const spaceKey = process.env.CONFLUENCE_SPACE_KEY || '';
  if (!spaceKey) throw new Error('CONFLUENCE_SPACE_KEY is required for Atlassian live checks');

  {
    const url = new URL(`${confluenceBase}/rest/api/space`);
    url.searchParams.set('spaceKey', spaceKey);
    url.searchParams.set('limit', '1');
    const res = await fetch(url.toString(), {
      headers: { Authorization: auth, Accept: 'application/json' }
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Confluence space check failed: HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`);
    }
  }

  // Optional: sanity check that backend can create DRAFT pages without doing it.
  const backend = config?.tracker?.atlassian?.backend || 'api';
  if (backend !== 'api') {
    // If config says mcp, this script does not validate that path.
    process.stdout.write('Note: Atlassian backend is not "api"; skipping REST checks.\n');
  }
}

function checkGitHubCli() {
  const res = cp.spawnSync('gh', ['auth', 'status', '--hostname', 'github.com'], { encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`gh auth status failed:\n${res.stdout}\n${res.stderr}`);
  }
}

async function main() {
  const config = loadResolvedConfig();
  const mode = config?.tracker?.mode || 'standalone';
  const scmProvider = config?.scm?.provider || 'none';

  if (mode === 'atlassian') {
    const backend = config?.tracker?.atlassian?.backend || 'api';
    if (backend === 'api') {
      await checkAtlassianApi(config);
      process.stdout.write('Live checks: Atlassian REST OK\n');
    } else {
      process.stdout.write('Live checks: Atlassian backend is MCP; REST checks skipped\n');
    }

    // Many teams use Jira/Confluence for work and GitHub for PRs.
    // Validate `gh` auth when SCM is enabled, even if tracker.mode is atlassian.
    if (scmProvider === 'github') {
      checkGitHubCli();
      process.stdout.write('Live checks: GitHub gh auth OK (scm.provider=github)\n');
    }
    return;
  }

  if (mode === 'github') {
    checkGitHubCli();
    process.stdout.write('Live checks: GitHub gh auth OK\n');
    return;
  }

  process.stdout.write('Live checks: standalone mode (nothing to validate)\n');
}

main().catch((err) => {
  process.stderr.write(`Live checks failed: ${err && err.message ? err.message : String(err)}\n`);
  process.exit(1);
});
