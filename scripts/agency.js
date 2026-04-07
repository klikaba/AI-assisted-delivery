#!/usr/bin/env node
/**
 * `agency` integration CLI.
 *
 * This is the foundation for:
 * - Painless client customization (swap backends without changing prompts)
 * - Deterministic simulated E2E tests (fake backend)
 * - A future local MCP bridge (agency mcp) if needed
 *
 * Design constraints:
 * - Always support JSON output for scripting/tests.
 * - Avoid network by default; live backends are explicit.
 *
 * Usage examples:
 *   node scripts/agency.js tracker search --label ai-state:ready-for-plan --json
 *   node scripts/agency.js tracker comment --id 123 --body "hello" --json
 *   node scripts/agency.js docs create --title "Spec" --body "..." --status DRAFT --json
 */

const { loadResolvedConfig, selectBackend, loadBackend } = require('./agency/runtime');

function parseArgs(argv) {
  const out = {
    json: false,
    _: []
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') {
      out.json = true;
      continue;
    }
    out._.push(a);
  }

  return out;
}

function parseFlags(argv) {
  // Very small flag parser: supports:
  // - --key value
  // - --flag (boolean true)
  // - repeated flags (collect into arrays)
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    const value = next !== undefined && !String(next).startsWith('--') ? next : true;
    if (value !== true) i += 1;
    if (flags[key] === undefined) {
      flags[key] = value;
    } else if (Array.isArray(flags[key])) {
      flags[key].push(value);
    } else {
      flags[key] = [flags[key], value];
    }
  }
  return flags;
}

function coerceArray(v) {
  if (v === undefined) return [];
  if (Array.isArray(v)) return v;
  return [v];
}

function jsonOut(obj, pretty) {
  process.stdout.write(`${JSON.stringify(obj, null, pretty ? 2 : 0)}\n`);
}

function die(message) {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

function usage() {
  console.log(`
agency (integration CLI)

Usage:
  node scripts/agency.js <domain> <action> [--flags] [--json]

Domains/actions:
  tracker search   --label <label> [--label <label> ...] [--text <text>] [--limit <n>] [--jql <jql>] [--json]
  tracker get      --id <id> [--json]
  tracker comment  --id <id> --body <text> [--json]
  tracker transition --id <id> --status <status> [--json]
  tracker set-labels --id <id> [--add <label> ...] [--remove <label> ...] [--json]

  docs create      --title <title> --body <body> [--status DRAFT] [--parent-id <id>] [--json]
  docs get         --id <id> [--json]
  docs update      --id <id> [--title <title>] [--body <body>] [--status <status>] [--json]

  scm pr-create    --title <title> [--body <body>] [--head <branch>] [--base <branch>] [--draft] [--label <label> ...] [--reviewer <user> ...] [--assignee <user> ...] [--json]
  scm pr-get       --number <n> [--json]
  scm pr-comment   --number <n> --body <text> [--json]
  scm pr-set-labels --number <n> [--add <label> ...] [--remove <label> ...] [--json]
  scm pr-link-ticket --number <n> --ticket <key> [--json]

Environment overrides:
  AGENCY_HOST_ROOT=<path>               Run against a specific host root (for tests/profiles)
  AGENCY_INTEGRATION_BACKEND=fake       Force fake backend for tracker+docs+scm
  AGENCY_TRACKER_BACKEND=fake           Force tracker backend
  AGENCY_DOCS_BACKEND=fake              Force docs backend
  AGENCY_SCM_BACKEND=fake|github|none   Force SCM backend
  AGENCY_FIXTURE_DIR=<path>             Fake backend fixtures directory
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [domain, action, ...rest] = args._;
  if (!domain || !action || domain === '--help' || domain === '-h') {
    usage();
    return;
  }

  const flags = parseFlags(rest);
  const { config } = loadResolvedConfig();
  const mode = config?.tracker?.mode || 'standalone';

  const backendId = selectBackend(domain, mode, config);
  const backend = loadBackend(domain, backendId);

  try {
    if (domain === 'tracker') {
      if (action === 'search') {
        const res = await backend.tracker.search({
          label: undefined,
          labels: coerceArray(flags.label),
          text: flags.text,
          jql: flags.jql,
          limit: flags.limit
        });
        jsonOut(res, args.json);
        return;
      }
      if (action === 'get') {
        if (!flags.id) die('tracker get requires --id');
        const res = await backend.tracker.get({ id: flags.id });
        jsonOut(res, args.json);
        return;
      }
      if (action === 'comment') {
        if (!flags.id) die('tracker comment requires --id');
        if (flags.body === undefined) die('tracker comment requires --body');
        const res = await backend.tracker.comment({ id: flags.id, body: flags.body });
        jsonOut(res, args.json);
        return;
      }
      if (action === 'transition') {
        if (!flags.id) die('tracker transition requires --id');
        if (flags.status === undefined) die('tracker transition requires --status');
        const res = await backend.tracker.transition({ id: flags.id, status: flags.status });
        jsonOut(res, args.json);
        return;
      }
      if (action === 'set-labels') {
        if (!flags.id) die('tracker set-labels requires --id');
        const res = await backend.tracker.set_labels({
          id: flags.id,
          add: coerceArray(flags.add),
          remove: coerceArray(flags.remove)
        });
        jsonOut(res, args.json);
        return;
      }
      die(`Unknown tracker action "${action}"`);
    }

    if (domain === 'docs') {
      if (action === 'create') {
        if (flags.title === undefined) die('docs create requires --title');
        if (flags.body === undefined) die('docs create requires --body');
        const res = await backend.docs.create({
          title: flags.title,
          body: flags.body,
          status: flags.status,
          parentId: flags['parent-id']
        });
        jsonOut(res, args.json);
        return;
      }
      if (action === 'get') {
        if (!flags.id) die('docs get requires --id');
        const res = await backend.docs.get({ id: flags.id });
        jsonOut(res, args.json);
        return;
      }
      if (action === 'update') {
        if (!flags.id) die('docs update requires --id');
        const res = await backend.docs.update({
          id: flags.id,
          title: flags.title,
          body: flags.body,
          status: flags.status
        });
        jsonOut(res, args.json);
        return;
      }
      die(`Unknown docs action "${action}"`);
    }

    if (domain === 'scm') {
      if (backendId === 'none') {
        die('SCM integration is disabled. Set scm.provider="github" (or AGENCY_SCM_BACKEND=github).');
      }

      if (action === 'pr-create') {
        if (flags.title === undefined) die('scm pr-create requires --title');
        const res = await backend.scm.pr_create({
          title: flags.title,
          body: flags.body,
          head: flags.head,
          base: flags.base,
          draft: flags.draft === 'true' || flags.draft === true,
          labels: coerceArray(flags.label),
          reviewers: coerceArray(flags.reviewer),
          assignees: coerceArray(flags.assignee)
        });
        jsonOut(res, args.json);
        return;
      }

      if (action === 'pr-get') {
        if (!flags.number) die('scm pr-get requires --number');
        const res = await backend.scm.pr_get({ number: Number(flags.number) });
        jsonOut(res, args.json);
        return;
      }

      if (action === 'pr-comment') {
        if (!flags.number) die('scm pr-comment requires --number');
        if (flags.body === undefined) die('scm pr-comment requires --body');
        const res = await backend.scm.pr_comment({ number: Number(flags.number), body: flags.body });
        jsonOut(res, args.json);
        return;
      }

      if (action === 'pr-set-labels') {
        if (!flags.number) die('scm pr-set-labels requires --number');
        const res = await backend.scm.pr_set_labels({
          number: Number(flags.number),
          add: coerceArray(flags.add),
          remove: coerceArray(flags.remove)
        });
        jsonOut(res, args.json);
        return;
      }

      if (action === 'pr-link-ticket') {
        if (!flags.number) die('scm pr-link-ticket requires --number');
        if (!flags.ticket) die('scm pr-link-ticket requires --ticket');
        const res = await backend.scm.pr_link_ticket({ number: Number(flags.number), ticket: flags.ticket });
        jsonOut(res, args.json);
        return;
      }

      die(`Unknown scm action "${action}"`);
    }

    die(`Unknown domain "${domain}"`);
  } catch (err) {
    die(err && err.message ? err.message : String(err));
  }
}

main();
