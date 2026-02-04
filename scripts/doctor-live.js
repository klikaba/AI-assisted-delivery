#!/usr/bin/env node
/**
 * Live checks for real integrations (network + auth).
 *
 * This script is invoked by `scripts/doctor.js` when AGENCY_DOCTOR_LIVE=1.
 * It should be safe to run in a host repo and should avoid destructive actions.
 *
 * Checks:
 * - Atlassian (REST backend): Jira /myself and (optionally) Confluence space read (when docs.provider=atlassian)
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

async function checkAtlassianApi({ config, checkJira, checkConfluence }) {
  const site = process.env.ATLASSIAN_SITE ? normalizeBaseUrl(process.env.ATLASSIAN_SITE) : null;
  const jiraBase = normalizeBaseUrl(process.env.JIRA_BASE_URL || site || '');
  const confluenceBase = normalizeBaseUrl(process.env.CONFLUENCE_BASE_URL || (site ? `${site}/wiki` : ''));

  const email = requireEnv('ATLASSIAN_EMAIL');
  const token = requireEnv('ATLASSIAN_API_TOKEN');
  const basic = Buffer.from(`${email}:${token}`, 'utf8').toString('base64');
  const auth = `Basic ${basic}`;

  // Jira auth check: /myself
  if (checkJira) {
    if (!jiraBase) throw new Error('Set ATLASSIAN_SITE or JIRA_BASE_URL');
    const res = await fetch(`${jiraBase}/rest/api/3/myself`, {
      headers: { Authorization: auth, Accept: 'application/json' }
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira auth check failed: HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`);
    }
  }

  // Confluence space check (read-only)
  if (checkConfluence) {
    if (!confluenceBase) throw new Error('Set ATLASSIAN_SITE or CONFLUENCE_BASE_URL');
    const spaceKey = process.env.CONFLUENCE_SPACE_KEY || '';
    if (!spaceKey) throw new Error('CONFLUENCE_SPACE_KEY is required when docs.provider=atlassian');

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

async function checkLinearApi() {
  const key = process.env.LINEAR_ACCESS_TOKEN || process.env.LINEAR_API_KEY || '';
  if (!key) throw new Error('LINEAR_API_KEY (or LINEAR_ACCESS_TOKEN) is required for Linear live checks');

  const auth = process.env.LINEAR_ACCESS_TOKEN ? `Bearer ${process.env.LINEAR_ACCESS_TOKEN}` : process.env.LINEAR_API_KEY;
  const endpoint = 'https://api.linear.app/graphql';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ query: 'query { viewer { id name } }' })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Linear auth check failed: HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Linear auth check failed: invalid JSON response');
  }
  if (Array.isArray(json.errors) && json.errors.length > 0) {
    const msg = json.errors.map((e) => e.message).filter(Boolean).join('; ') || 'Linear GraphQL error';
    throw new Error(`Linear auth check failed: ${msg}`);
  }
  if (!json.data?.viewer?.id) throw new Error('Linear auth check failed: missing viewer.id');

  // Verify required workflow labels exist (verify-only; no mutations).
  const required = [
    'ai-state:ready-for-plan',
    'ai-state:plan-review',
    'ai-state:approved',
    'ai-state:in-qa',
    'ai-state:verified',
    'ai-state:reviewed',
    'ai-state:review-fail',
    'ai-state:security-pass',
    'ai-state:security-fail'
  ];

  const labelRes = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({
      query: `
        query LabelsByName($names: [String!]!) {
          issueLabels(filter: { name: { in: $names } }, first: 50) {
            nodes { name }
          }
        }
      `,
      variables: { names: required }
    })
  });
  const labelText = await labelRes.text();
  if (!labelRes.ok) {
    throw new Error(`Linear labels check failed: HTTP ${labelRes.status} ${labelRes.statusText}${labelText ? `: ${labelText}` : ''}`);
  }
  let labelJson;
  try {
    labelJson = JSON.parse(labelText);
  } catch {
    throw new Error('Linear labels check failed: invalid JSON response');
  }
  if (Array.isArray(labelJson.errors) && labelJson.errors.length > 0) {
    const msg = labelJson.errors.map((e) => e.message).filter(Boolean).join('; ') || 'Linear GraphQL error';
    throw new Error(`Linear labels check failed: ${msg}`);
  }

  const found = new Set((labelJson.data?.issueLabels?.nodes || []).map((n) => String(n.name)));
  const missing = required.filter((n) => !found.has(n));
  if (missing.length > 0) {
    throw new Error(
      `Linear is missing required labels: ${missing.join(', ')}. ` +
      'Create them in Linear (Workspace Settings → Labels) to use the portable ai-state workflow. ' +
      'Tip: run `./.agency/bin/agency labels --mode linear` to see the full list.'
    );
  }
}

async function main() {
  const config = loadResolvedConfig();
  const mode = config?.tracker?.mode || 'standalone';
  const scmProvider = config?.scm?.provider || 'none';

  if (mode === 'atlassian') {
    const backend = config?.tracker?.atlassian?.backend || 'api';
    const docsProvider = config?.docs?.provider || 'repo';
    if (backend === 'api') {
      await checkAtlassianApi({ config, checkJira: true, checkConfluence: docsProvider === 'atlassian' });
      process.stdout.write('Live checks: Atlassian REST OK\n');
    } else {
      // Jira checks are delegated to MCP in this mode, but docs may still be
      // Confluence via REST depending on docs.provider.
      if (docsProvider === 'atlassian') {
        await checkAtlassianApi({ config, checkJira: false, checkConfluence: true });
        process.stdout.write('Live checks: Confluence REST OK (docs.provider=atlassian)\n');
      }
      process.stdout.write('Live checks: Atlassian backend is MCP; Jira REST checks skipped\n');
    }

    // Many teams use Atlassian for work tracking and GitHub for PRs.
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

  if (mode === 'linear') {
    await checkLinearApi();
    process.stdout.write('Live checks: Linear API OK\n');
    if (scmProvider === 'github') {
      checkGitHubCli();
      process.stdout.write('Live checks: GitHub gh auth OK (scm.provider=github)\n');
    }
    return;
  }

  process.stdout.write('Live checks: standalone mode (nothing to validate)\n');
}

main().catch((err) => {
  process.stderr.write(`Live checks failed: ${err && err.message ? err.message : String(err)}\n`);
  process.exit(1);
});
