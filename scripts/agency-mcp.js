#!/usr/bin/env node
/**
 * Local MCP server exposing stable Agency capability tools.
 *
 * This lets agent prompts call tools like `tracker.search` without hard-coding
 * vendor MCP tool names (jira.* / confluence.*) or shelling out to CLIs.
 *
 * Transport: JSON-RPC 2.0 over stdio with Content-Length framing (LSP-style).
 *
 * Supported methods (minimum viable MCP):
 * - initialize
 * - tools/list
 * - tools/call
 *
 * Notes:
 * - This server is intentionally dependency-free.
 * - Backends are selected via the same env/config as `scripts/agency.js`.
 */

require('./load-env').loadEnvFiles();

const { loadResolvedConfig, loadBackend, selectBackend } = require('./agency/runtime');
const {
  parseSpecRefFromComments,
  parsePrRefFromComments,
  parseGitHubPrNumberFromUrl,
  parsePlanArtifactFromText,
  parseQaMarker,
  parseReviewMarker,
  parseSecurityMarker,
  parseTestCasesRefFromComments,
  parsePlanArtifactFromComments,
  normalizeStatus,
  safeLabelIncludes,
  workflowLabel,
  workflowGate
} = require('./agency/workflow');
const { validatePlan } = require('./schema/plan');

function executionPlanMarkdown(plan) {
  return `## Execution Plan (JSON)\n\n\`\`\`json\n${JSON.stringify(plan, null, 2)}\n\`\`\``;
}

function executionPlanStorageHtml(plan) {
  const json = JSON.stringify(plan, null, 2).replaceAll(']]>', ']]]]><![CDATA[>');
  return `<h2>Execution Plan (JSON)</h2>\n<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">json</ac:parameter><ac:plain-text-body><![CDATA[${json}]]></ac:plain-text-body></ac:structured-macro>`;
}

function upsertExecutionPlanMarkdown(body, plan) {
  const section = executionPlanMarkdown(plan);
  const source = String(body || '').trim();
  const re = /(^|\n)##\s+Execution Plan \(JSON\)\s*\n[\s\S]*?(?=\n##\s+|\n#\s+|$)/i;
  if (re.test(source)) return source.replace(re, `$1${section}`);
  return source ? `${source}\n\n${section}` : section;
}

function upsertExecutionPlanStorage(body, plan) {
  const section = executionPlanStorageHtml(plan);
  const source = String(body || '').trim();
  const re = /<h2>\s*Execution Plan \(JSON\)\s*<\/h2>[\s\S]*?(?=<h1\b|<h2\b|$)/i;
  if (re.test(source)) return source.replace(re, section);
  return source ? `${source}\n${section}` : section;
}

function writeStderr(line) {
  process.stderr.write(`${line}\n`);
}

function traceEnabled() {
  return process.env.AGENCY_MCP_TRACE === '1';
}

function debug(msg) {
  if (traceEnabled()) writeStderr(`[agency-mcp] ${msg}`);
}

function encodeMessageContentLength(obj) {
  const json = JSON.stringify(obj);
  const bytes = Buffer.from(json, 'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${bytes.length}\r\n\r\n`, 'utf8'), bytes]);
}

function encodeMessageNewline(obj) {
  return Buffer.from(`${JSON.stringify(obj)}\n`, 'utf8');
}

let outputFraming = null; // 'content-length' | 'newline'

function send(obj) {
  // Default to Content-Length framing unless we detect newline framing from input.
  const framing = outputFraming || 'content-length';
  process.stdout.write(
    framing === 'newline' ? encodeMessageNewline(obj) : encodeMessageContentLength(obj)
  );
}

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id, error };
}

function toolList() {
  // Minimal JSON Schemas: keep stable, don’t overfit.
  const tools = [
    {
      name: 'capabilities.get',
      description: 'Get the current capability surface and selected backends.',
      inputSchema: { type: 'object', additionalProperties: false, properties: {} }
    },
    {
      name: 'tracker.search',
      description: 'Search tracker items by labels and/or text.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          labels: { type: 'array', items: { type: 'string' } },
          text: { type: 'string' },
          jql: { type: 'string' },
          limit: { type: 'number' }
        }
      }
    },
    {
      name: 'tracker.get',
      description: 'Get a tracker item by id/key/number.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['id'],
        properties: { id: { type: 'string' } }
      }
    },
    {
      name: 'tracker.comment',
      description: 'Add a comment to a tracker item.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'body'],
        properties: { id: { type: 'string' }, body: { type: 'string' } }
      }
    },
    {
      name: 'tracker.update',
      description: 'Update tracker fields such as title and description/body.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['id'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' }
        }
      }
    },
    {
      name: 'tracker.transition',
      description: 'Transition a tracker item to a status (best-effort depending on backend).',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'status'],
        properties: { id: { type: 'string' }, status: { type: 'string' } }
      }
    },
    {
      name: 'tracker.set_labels',
      description: 'Add/remove labels on a tracker item.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['id'],
        properties: {
          id: { type: 'string' },
          add: { type: 'array', items: { type: 'string' } },
          remove: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    {
      name: 'plan.get',
      description: 'Get the latest structured execution plan linked to a tracker ticket.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['id'],
        properties: { id: { type: 'string' } }
      }
    },
    {
      name: 'plan.publish',
      description: 'Publish a structured execution plan to the linked spec as the canonical machine-readable handoff artifact.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'plan'],
        properties: {
          id: { type: 'string' },
          spec_id: { type: 'string' },
          plan: { type: 'object', additionalProperties: true }
        }
      }
    },
    {
      name: 'docs.create',
      description: 'Create a document/page (spec).',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'body'],
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          status: { type: 'string' },
          parentId: { type: 'string' }
        }
      }
    },
    {
      name: 'docs.get',
      description: 'Fetch a document/page by id.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['id'],
        properties: { id: { type: 'string' } }
      }
    },
    {
      name: 'docs.update',
      description: 'Update a document/page by id.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['id'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
          status: { type: 'string' }
        }
      }
    },
    {
      name: 'scm.pr_create',
      description: 'Create a pull request (GitHub via gh when enabled).',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['title'],
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          head: { type: 'string' },
          base: { type: 'string' },
          draft: { type: 'boolean' },
          labels: { type: 'array', items: { type: 'string' } },
          reviewers: { type: 'array', items: { type: 'string' } },
          assignees: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    {
      name: 'scm.pr_get',
      description: 'Get a pull request by number.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['number'],
        properties: { number: { type: 'number' } }
      }
    },
    {
      name: 'scm.pr_comment',
      description: 'Add a comment to a pull request.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['number', 'body'],
        properties: { number: { type: 'number' }, body: { type: 'string' } }
      }
    },
    {
      name: 'scm.pr_set_labels',
      description: 'Add/remove labels on a pull request.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['number'],
        properties: {
          number: { type: 'number' },
          add: { type: 'array', items: { type: 'string' } },
          remove: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    {
      name: 'scm.pr_link_ticket',
      description: 'Link a pull request to a tracker ticket (best-effort).',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['number', 'ticket'],
        properties: { number: { type: 'number' }, ticket: { type: 'string' } }
      }
    },
    {
      name: 'tms.suite_ensure',
      description: 'Ensure a TestRail suite/section exists (provider-specific).',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          project_id: { type: ['string', 'number'] }
        }
      }
    },
    {
      name: 'tms.case_create',
      description: 'Create a test case in the configured test management system.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['title'],
        properties: {
          title: { type: 'string' },
          steps: { type: 'string' },
          expected: { type: 'string' },
          suite_id: { type: ['string', 'number'] },
          section_id: { type: ['string', 'number'] }
        }
      }
    },
    {
      name: 'workflow.summary',
      description: 'Summarize workflow gates and linked evidence for a ticket (Spec/PR/QA/Review) for strict, role-agnostic operation.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['id'],
        properties: { id: { type: 'string' } }
      }
    },
    {
      name: 'workflow.queue',
      description: 'List tickets matching labels and include workflow summaries (best-effort, limited).',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          labels: { type: 'array', items: { type: 'string' } },
          text: { type: 'string' },
          limit: { type: 'number' }
        }
      }
    },
    {
      name: 'workflow.gate_status',
      description: 'Render the standard 5-line Gate Status block for a ticket (Spec/PR/QA/Review/Next) derived from workflow.summary.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['id'],
        properties: { id: { type: 'string' } }
      }
    },
    {
      name: 'workflow.apply',
      description: 'Apply a small set of tracker actions atomically (comments + labels + transitions) with optional strict evidence marker checks.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'actions'],
        properties: {
          id: { type: 'string' },
          strict: { type: 'boolean' },
          actions: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['type'],
              properties: {
                type: { type: 'string' },
                body: { type: 'string' },
                add: { type: 'array', items: { type: 'string' } },
                remove: { type: 'array', items: { type: 'string' } },
                status: { type: 'string' }
              }
            }
          }
        }
      }
    },
    {
      name: 'workflow.sync_plan_review',
      description: 'PM automation: sync tickets in plan-review to approved/ready-for-plan based on Spec Status. Supports dry-run.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          limit: { type: 'number' },
          dry_run: { type: 'boolean' }
        }
      }
    },
    {
      name: 'workflow.qa_decide',
      description: 'QA automation: post QA evidence and move a ticket from in-qa to verified or back to approved.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'decision'],
        properties: {
          id: { type: 'string' },
          decision: { type: 'string', enum: ['pass', 'fail'] },
          comment: { type: 'string' },
          testcases: { type: 'string' },
          status: { type: 'string' }
        }
      }
    },
    {
      name: 'workflow.review_decide',
      description: 'Review automation: post review evidence and move a ticket through reviewed or back to approved.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'decision'],
        properties: {
          id: { type: 'string' },
          decision: { type: 'string', enum: ['pass', 'fail'] },
          comment: { type: 'string' },
          status: { type: 'string' }
        }
      }
    },
    {
      name: 'workflow.security_decide',
      description: 'Security automation: post security evidence and move a ticket through security pass/fail outcomes.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'decision'],
        properties: {
          id: { type: 'string' },
          decision: { type: 'string', enum: ['pass', 'fail'] },
          comment: { type: 'string' },
          status: { type: 'string' }
        }
      }
    },
    {
      name: 'workflow.release',
      description: 'PM automation: verify release gates, create release notes, close the ticket, and clear workflow labels. Supports dry-run.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['id'],
        properties: {
          id: { type: 'string' },
          dry_run: { type: 'boolean' }
        }
      }
    }
  ];

  // Compatibility: some MCP clients namespace tool names with the server id.
  // Our server id in generated config is "agency", so we expose both:
  // - tracker.search
  // - agency.tracker.search
  const withAliases = [];
  for (const t of tools) {
    withAliases.push(t);
    withAliases.push({ ...t, name: `agency.${t.name}` });
  }
  return withAliases;
}

function normalizeCallParams(params) {
  // MCP SDK uses { name, arguments }. Be tolerant.
  let name = params?.name;
  const args = params?.arguments || params?.args || {};
  if (typeof name === 'string' && name.startsWith('agency.')) {
    name = name.slice('agency.'.length);
  }
  return { name, args };
}

function hasFn(obj, name) {
  return typeof obj?.[name] === 'function';
}

function computeCapabilities({ mode, config }) {
  const trackerBackendId = selectBackend('tracker', mode, config);
  const docsBackendId = selectBackend('docs', mode, config);
  const scmBackendId = selectBackend('scm', mode, config);
  const tmsBackendId = selectBackend('tms', mode, config);

  const trackerBackend = loadBackend('tracker', trackerBackendId);
  const docsBackend = loadBackend('docs', docsBackendId);
  const scmBackend = scmBackendId === 'none' ? null : loadBackend('scm', scmBackendId);
  const tmsBackend = tmsBackendId === 'none' ? null : loadBackend('tms', tmsBackendId);

  return {
    version: '1.0',
    mode,
    backends: {
      tracker: trackerBackendId,
      docs: docsBackendId,
      scm: scmBackendId,
      tms: tmsBackendId
    },
    tracker: {
      search: hasFn(trackerBackend.tracker, 'search'),
      get: hasFn(trackerBackend.tracker, 'get'),
      comment: hasFn(trackerBackend.tracker, 'comment'),
      update: hasFn(trackerBackend.tracker, 'update'),
      transition: hasFn(trackerBackend.tracker, 'transition'),
      set_labels: hasFn(trackerBackend.tracker, 'set_labels')
    },
    plan: {
      get: true,
      publish: true
    },
    docs: {
      create: hasFn(docsBackend.docs, 'create'),
      get: hasFn(docsBackend.docs, 'get'),
      update: hasFn(docsBackend.docs, 'update')
    },
    tms: {
      enabled: tmsBackendId !== 'none',
      suite_ensure: tmsBackend ? hasFn(tmsBackend.tms, 'suite_ensure') : false,
      case_create: tmsBackend ? hasFn(tmsBackend.tms, 'case_create') : false
    },
    workflow: {
      summary: true,
      queue: true,
      gate_status: true,
      apply: true,
      sync_plan_review: true,
      qa_decide: true,
      review_decide: true,
      security_decide: true,
      release: true
    },
    scm: {
      enabled: scmBackendId !== 'none',
      pr_create: scmBackend ? hasFn(scmBackend.scm, 'pr_create') : false,
      pr_get: scmBackend ? hasFn(scmBackend.scm, 'pr_get') : false,
      pr_comment: scmBackend ? hasFn(scmBackend.scm, 'pr_comment') : false,
      pr_set_labels: scmBackend ? hasFn(scmBackend.scm, 'pr_set_labels') : false,
      pr_link_ticket: scmBackend ? hasFn(scmBackend.scm, 'pr_link_ticket') : false
    }
  };
}

async function callTool(name, args) {
  const { config } = loadResolvedConfig();
  const mode = config?.tracker?.mode || 'standalone';

  if (name === 'capabilities.get') {
    return computeCapabilities({ mode, config });
  }

  if (name === 'plan.get' || name === 'plan.publish') {
    const trackerBackendId = selectBackend('tracker', mode, config);
    const docsBackendId = selectBackend('docs', mode, config);
    const trackerBackend = loadBackend('tracker', trackerBackendId);
    const docsBackend = loadBackend('docs', docsBackendId);

    if (name === 'plan.get') {
      const ticketId = args?.id ? String(args.id) : '';
      if (!ticketId) throw new Error('plan.get requires id');
      const ticketRes = await trackerBackend.tracker.get({ id: ticketId });
      const ticket = ticketRes?.item;
      const comments = Array.isArray(ticket?.comments) ? ticket.comments : [];
      const specRef = parseSpecRefFromComments(comments);
      let ref = null;
      if (specRef?.id && typeof docsBackend.docs?.get === 'function') {
        try {
          const pageRes = await docsBackend.docs.get({ id: String(specRef.id) });
          const page = pageRes?.page;
          ref = parsePlanArtifactFromText(page?.body || '', {
            marker: 'docs',
            id: String(specRef.id),
            url: page?.url ? String(page.url) : (specRef.url || null)
          });
        } catch {
          ref = null;
        }
      }
      if (!ref) ref = parsePlanArtifactFromComments(comments);
      return {
        version: '1.0',
        ticket: {
          id: ticket?.id ? String(ticket.id) : ticketId,
          key: ticket?.key ? String(ticket.key) : null,
          title: ticket?.title ? String(ticket.title) : '',
          url: ticket?.url ? String(ticket.url) : null
        },
        found: Boolean(ref),
        plan: ref?.plan || null,
        valid: Boolean(ref?.valid),
        errors: Array.isArray(ref?.errors) ? ref.errors : [],
        ref: ref?.ref || null
      };
    }

    const ticketId = args?.id ? String(args.id) : '';
    if (!ticketId) throw new Error('plan.publish requires id');
    const dryRun = args?.dry_run !== undefined ? Boolean(args.dry_run) : false;
    const plan = args?.plan;
    const validation = validatePlan(plan);
    if (!validation.ok) throw new Error(`plan.publish invalid plan: ${validation.errors.join('; ')}`);
    if (String(plan?.ticket?.id || '') !== ticketId) {
      throw new Error(`plan.publish ticket mismatch: plan.ticket.id=${String(plan?.ticket?.id || '')} does not match target id=${ticketId}`);
    }
    const ticketRes = await trackerBackend.tracker.get({ id: ticketId });
    const ticket = ticketRes?.item;
    const comments = Array.isArray(ticket?.comments) ? ticket.comments : [];
    const specRef = parseSpecRefFromComments(comments);
    const targetSpecId = args?.spec_id ? String(args.spec_id) : String(specRef?.id || '');
    if (!targetSpecId) {
      throw new Error('plan.publish requires a spec target (pass spec_id on first publish, or link the ticket with `Spec: <id> <url>`)');
    }
    const pageRes = await docsBackend.docs.get({ id: targetSpecId });
    const page = pageRes?.page;
    if (!page) throw new Error(`plan.publish could not load linked Spec: ${targetSpecId}`);
    const body = docsBackendId === 'atlassian'
      ? upsertExecutionPlanStorage(page.body || '', plan)
      : upsertExecutionPlanMarkdown(page.body || '', plan);
    if (!dryRun) {
      const updateArgs = { id: targetSpecId, body, status: page.status };
      if (docsBackendId === 'atlassian') updateArgs.body_format = 'storage';
      await docsBackend.docs.update(updateArgs);
    }
    return {
      version: '1.0',
      ticket: { id: ticketId },
      spec: { id: targetSpecId, url: page?.url ? String(page.url) : (specRef?.url || null) },
      dry_run: dryRun,
      published: !dryRun,
      plan,
      body
    };
  }

  function gateStatusLinesFromSummary(s) {
    const specStatus = s?.evidence?.spec?.missing
      ? 'missing'
      : (s?.evidence?.spec?.status ? String(s.evidence.spec.status).toUpperCase() : 'UNKNOWN');

    const prRequired = s?.evidence?.pr?.required !== false;
    const prLinked = Boolean(s?.evidence?.pr?.linked);
    const prLine = prRequired ? (prLinked ? 'linked' : 'missing') : 'n/a';

    const qaMarker = s?.evidence?.qa?.marker ? String(s.evidence.qa.marker).toUpperCase() : null;
    const qaPassed = Boolean(s?.evidence?.qa?.passed);
    const qaLine = qaMarker === 'PASS' || qaPassed ? 'PASS' : qaMarker === 'FAIL' ? 'FAIL' : 'missing';

    const reviewMarker = s?.evidence?.review?.marker ? String(s.evidence.review.marker).toUpperCase() : null;
    const reviewPassed = Boolean(s?.evidence?.review?.passed);
    const reviewLine = reviewMarker === 'PASS' || reviewPassed ? 'PASS' : reviewMarker === 'FAIL' ? 'FAIL' : 'missing';

    const next = s?.next ? String(s.next).replace(/\s+/g, ' ').trim() : 'N/A';

    return [
      `Spec: ${specStatus}`,
      `PR: ${prLine}`,
      `QA: ${qaLine}`,
      `Review: ${reviewLine}`,
      `Next: ${next}`
    ];
  }

  if (name.startsWith('tms.')) {
    const backendId = selectBackend('tms', mode, config);
    if (backendId === 'none') {
      throw new Error('TMS integration is disabled. Set tms.provider="testrail" (or AGENCY_TMS_PROVIDER=testrail).');
    }
    const backend = loadBackend('tms', backendId);
    const fn = backend.tms?.[name.slice('tms.'.length)];
    if (typeof fn !== 'function') throw new Error(`Tool not implemented: ${name}`);
    return await fn(args || {});
  }

  async function computeSummaryForTicket(id) {
    const ticketId = String(id || '');
    if (!ticketId) throw new Error('workflow.summary requires id');

    const trackerBackendId = selectBackend('tracker', mode, config);
    const docsBackendId = selectBackend('docs', mode, config);
    const scmBackendId = selectBackend('scm', mode, config);
    const scmEnabled = scmBackendId !== 'none';

    const trackerBackend = loadBackend('tracker', trackerBackendId);
    const docsBackend = loadBackend('docs', docsBackendId);
    const scmBackend = scmBackendId === 'none' ? null : loadBackend('scm', scmBackendId);

    const ticketRes = await trackerBackend.tracker.get({ id: ticketId });
    const ticket = ticketRes?.item;
    const comments = Array.isArray(ticket?.comments) ? ticket.comments : [];

    const specRef = parseSpecRefFromComments(comments);
    const prRef = parsePrRefFromComments(comments);
    let planRef = null;
    const qaMarker = parseQaMarker(comments);
    const reviewMarker = parseReviewMarker(comments);
    const securityMarker = parseSecurityMarker(comments);
    const testCasesRef = parseTestCasesRefFromComments(comments);

    let spec = null;
    if (specRef && specRef.id && typeof docsBackend.docs.get === 'function') {
      try {
        const pageRes = await docsBackend.docs.get({ id: String(specRef.id) });
        const page = pageRes?.page;
        spec = {
          id: String(specRef.id),
          status: page?.status ? String(page.status) : 'UNKNOWN',
          url: page?.url ? String(page.url) : (specRef.url || null),
          title: page?.title ? String(page.title) : null
        };
        planRef = parsePlanArtifactFromText(page?.body || '', {
          marker: 'docs',
          id: String(specRef.id),
          url: page?.url ? String(page.url) : (specRef.url || null)
        });
      } catch (err) {
        spec = { id: String(specRef.id), status: 'UNKNOWN', url: specRef.url || null, title: null, error: err && err.message ? err.message : String(err) };
      }
    } else if (specRef && specRef.url) {
      spec = { id: null, status: 'UNKNOWN', url: specRef.url, title: null };
    }
    if (!planRef) {
      planRef = parsePlanArtifactFromComments(comments);
    }

    let pr = null;
    if (prRef && prRef.url) {
      const number = parseGitHubPrNumberFromUrl(prRef.url);
      if (number && scmBackend && typeof scmBackend.scm?.pr_get === 'function') {
        try {
          const prRes = await scmBackend.scm.pr_get({ number });
          const prObj = prRes?.pr;
          pr = {
            number: Number(prObj?.number || number),
            state: prObj?.state ? String(prObj.state) : 'UNKNOWN',
            url: prObj?.url ? String(prObj.url) : prRef.url,
            title: prObj?.title ? String(prObj.title) : null
          };
        } catch (err) {
          pr = { number, state: 'UNKNOWN', url: prRef.url, title: null, error: err && err.message ? err.message : String(err) };
        }
      } else {
        pr = { number: number || null, state: 'UNKNOWN', url: prRef.url, title: null };
      }
    }

    const labels = Array.isArray(ticket?.labels) ? ticket.labels.map(String) : [];
    const labelReviewed = workflowLabel(config, 'reviewed', 'ai-state:reviewed');
    const labelVerified = workflowLabel(config, 'verified', 'ai-state:verified');
    const labelApproved = workflowLabel(config, 'approved', 'ai-state:approved');
    const labelInQa = workflowLabel(config, 'in_qa', 'ai-state:in-qa');
    const labelReadyForPlan = workflowLabel(config, 'ready_for_plan', 'ai-state:ready-for-plan');
    const labelPlanReview = workflowLabel(config, 'plan_review', 'ai-state:plan-review');
    const labelSecurityPass = workflowLabel(config, 'security_pass', 'ai-state:security-pass');

    const gateSpec = workflowGate(config, 'spec_approval', true);
    const gateReview = workflowGate(config, 'code_review', true);
    const gateQa = workflowGate(config, 'qa_verification', true);
    const gateSecurity = workflowGate(config, 'security_audit', false);
    const gateTestCases = workflowGate(config, 'test_cases', true);
    const tmsProvider = String(config?.tms?.provider || 'none');
    const tmsBackendId = selectBackend('tms', mode, config);
    const requiresTmsCases = gateTestCases && tmsProvider !== 'none';
    const isInQa = safeLabelIncludes(labels, labelInQa);
    const isVerified = safeLabelIncludes(labels, labelVerified);

    const specApproved = !gateSpec || normalizeStatus(spec?.status) === 'APPROVED';
    const reviewPassed = !gateReview || safeLabelIncludes(labels, labelReviewed);
    const qaPassed = !gateQa || safeLabelIncludes(labels, labelVerified);
    const securityPassed = !gateSecurity || safeLabelIncludes(labels, labelSecurityPass) || securityMarker === 'PASS';

    const evidence = {
      spec: spec ? { ...spec, approved: specApproved } : { approved: !gateSpec, missing: gateSpec },
      plan: planRef
        ? {
            linked: true,
            valid: Boolean(planRef.valid),
            errors: Array.isArray(planRef.errors) ? planRef.errors : [],
            ref: planRef.ref || null,
            plan: planRef.plan || null
          }
        : { linked: false, valid: false, missing: true },
      pr: pr ? { ...pr, linked: true, required: scmEnabled } : { linked: false, required: scmEnabled },
      tms: { required: requiresTmsCases, enabled: tmsProvider !== 'none', backend: tmsBackendId, ref: testCasesRef },
      qa: { required: gateQa, passed: qaPassed, label: labelVerified, marker: qaMarker },
      review: { required: gateReview, passed: reviewPassed, label: labelReviewed, marker: reviewMarker },
      security: { required: gateSecurity, passed: securityPassed, label: labelSecurityPass, marker: securityMarker }
    };

    const missing = [];
    if (gateSpec && !specApproved) missing.push('spec approval');
    if (spec && !planRef) missing.push('execution plan');
    if (planRef && !planRef.valid) missing.push('valid execution plan');
    if (gateQa && !qaPassed) missing.push('qa verification');
    if (gateReview && !reviewPassed) missing.push('code review');
    if (gateSecurity && !securityPassed) missing.push('security audit');
    if (requiresTmsCases && (isInQa || isVerified) && !testCasesRef) missing.push('test cases');

    let next = null;
    if (!spec) next = 'Run Planning Agent to create/link a Spec.';
    else if (!planRef) next = 'Run Planning Agent to publish the structured execution plan.';
    else if (!planRef.valid) next = 'Run Planning Agent to repair and republish a valid structured execution plan.';
    else if (gateSpec && !specApproved) next = 'Approve the Spec in Confluence (Spec Status: APPROVED), then run PM Governance Sync to apply the approved label.';
    else if (requiresTmsCases && isInQa && !testCasesRef) next = 'Create test cases in the test repository (e.g. TestRail) and comment `TestCases: ...`, then implement automation and rerun QA.';
    else if (!safeLabelIncludes(labels, labelApproved) && !safeLabelIncludes(labels, labelInQa) && !safeLabelIncludes(labels, labelVerified) && !safeLabelIncludes(labels, labelReviewed)) {
      next = `Apply label ${labelApproved} (or run PM Governance Sync), then run Developer Agent.`;
    } else if (scmEnabled && !pr) next = 'Run Developer Agent to implement and create/link a PR.';
    else if (safeLabelIncludes(labels, labelInQa) && gateQa && !qaPassed) next = 'Run QA Engineer Agent to verify.';
    else if (safeLabelIncludes(labels, labelVerified) && gateReview && !reviewPassed) next = 'Run Code Reviewer Agent to review.';
    else if (safeLabelIncludes(labels, labelVerified) && reviewPassed && securityPassed) next = 'Run Project Manager Agent to release.';
    else if (safeLabelIncludes(labels, labelReadyForPlan)) next = 'Run Planning Agent.';
    else if (safeLabelIncludes(labels, labelPlanReview)) next = 'Approve Spec (Spec Status: APPROVED), then run PM Governance Sync.';

    return {
      version: '1.0',
      ticket: {
        id: ticket?.id ? String(ticket.id) : ticketId,
        key: ticket?.key ? String(ticket.key) : null,
        title: ticket?.title ? String(ticket.title) : '',
        url: ticket?.url ? String(ticket.url) : null,
        labels
      },
      backends: { tracker: trackerBackendId, docs: docsBackendId, scm: scmBackendId },
      gates: { spec_approval: gateSpec, qa_verification: gateQa, code_review: gateReview, security_audit: gateSecurity },
      evidence,
      missing,
      next
    };
  }

  if (name === 'workflow.summary') {
    return await computeSummaryForTicket(args?.id);
  }

  if (name === 'workflow.gate_status') {
    const s = await computeSummaryForTicket(args?.id);
    const lines = gateStatusLinesFromSummary(s);
    return { version: '1.0', id: s?.ticket?.key || s?.ticket?.id || String(args?.id || ''), lines, summary: s };
  }

  if (name === 'workflow.queue') {
    const labels = Array.isArray(args?.labels) ? args.labels.map(String) : [];
    const text = args?.text !== undefined ? String(args.text) : undefined;
    const limit = args?.limit !== undefined ? Number(args.limit) : 10;
    if (!Number.isFinite(limit) || limit <= 0) throw new Error('workflow.queue requires a positive limit');

    const trackerBackendId = selectBackend('tracker', mode, config);
    const trackerBackend = loadBackend('tracker', trackerBackendId);
    const search = await trackerBackend.tracker.search({ labels, text, limit });
    const items = Array.isArray(search?.items) ? search.items : [];

    const summaries = [];
    for (const it of items.slice(0, limit)) {
      const ticketId = it.key || it.id;
      try {
        // eslint-disable-next-line no-await-in-loop
        const s = await computeSummaryForTicket(ticketId);
        summaries.push({ ...s, gate_status_lines: gateStatusLinesFromSummary(s) });
      } catch (err) {
        summaries.push({
          version: '1.0',
          ticket: { id: String(ticketId), key: it.key ? String(it.key) : null, title: it.title ? String(it.title) : '', url: it.url ? String(it.url) : null, labels: Array.isArray(it.labels) ? it.labels.map(String) : [] },
          error: err && err.message ? err.message : String(err)
        });
      }
    }

    return { version: '1.0', items: summaries };
  }

  if (name === 'workflow.apply') {
    const id = args?.id ? String(args.id) : '';
    if (!id) throw new Error('workflow.apply requires id');
    const strict = args?.strict !== undefined ? Boolean(args.strict) : true;
    const actions = Array.isArray(args?.actions) ? args.actions : [];
    if (actions.length === 0) throw new Error('workflow.apply requires non-empty actions');
    const commentActions = actions.filter((a) => a && typeof a === 'object' && String(a.type || '') === 'comment');
    if (strict && commentActions.length > 1) {
      throw new Error('workflow.apply strict mode: only one comment action is allowed');
    }
    if (strict && commentActions.length === 1) {
      const lastAction = actions[actions.length - 1];
      if (!lastAction || String(lastAction.type || '') !== 'comment') {
        throw new Error('workflow.apply strict mode: the comment action must be the last action');
      }
    }

    const trackerBackendId = selectBackend('tracker', mode, config);
    const trackerBackend = loadBackend('tracker', trackerBackendId);

    // Strict evidence marker checks for the two gates that rely on humans trusting the label:
    // - Verified label must be accompanied by "QA: PASS"
    // - Reviewed label must be accompanied by "Review: PASS"
    const labelVerified = workflowLabel(config, 'verified', 'ai-state:verified');
    const labelReviewed = workflowLabel(config, 'reviewed', 'ai-state:reviewed');
    const requiresTmsCases = workflowGate(config, 'test_cases', true) && String(config?.tms?.provider || 'none') !== 'none';

    const adds = [];
    let commentBodies = '';
    for (const a of actions) {
      if (!a || typeof a !== 'object') continue;
      if (a.type === 'set_labels') {
        for (const l of a.add || []) adds.push(String(l));
      }
      if (a.type === 'comment') {
        commentBodies += `\n${String(a.body || '')}\n`;
      }
    }

    if (strict) {
      if (adds.includes(labelVerified) && !/QA\s*:\s*PASS\b/i.test(commentBodies)) {
        throw new Error(`workflow.apply strict mode: adding ${labelVerified} requires a comment containing "QA: PASS"`);
      }
      if (adds.includes(labelVerified) && requiresTmsCases && !/TestCases\s*:\s*\S+/i.test(commentBodies)) {
        // Allow the TestCases marker to already exist on the ticket from a prior step.
        // This avoids forcing a single mega-comment, while still enforcing evidence.
        let existingHasTestCases = false;
        try {
          const item = await trackerBackend.tracker.get({ id });
          const comments = Array.isArray(item?.item?.comments) ? item.item.comments : [];
          existingHasTestCases = /TestCases\s*:\s*\S+/i.test(comments.join('\n'));
        } catch {
          existingHasTestCases = false;
        }
        if (!existingHasTestCases) {
          throw new Error(`workflow.apply strict mode: adding ${labelVerified} requires a comment containing "TestCases: ..." when tms.provider is enabled`);
        }
      }
      if (adds.includes(labelReviewed) && !/Review\s*:\s*PASS\b/i.test(commentBodies)) {
        throw new Error(`workflow.apply strict mode: adding ${labelReviewed} requires a comment containing "Review: PASS"`);
      }
    }

    const results = [];
    for (const a of actions) {
      if (!a || typeof a !== 'object') continue;
      const type = String(a.type || '');
      if (type === 'comment') {
        // eslint-disable-next-line no-await-in-loop
        const r = await trackerBackend.tracker.comment({ id, body: String(a.body || '') });
        const ok = !(r && typeof r === 'object' && Object.prototype.hasOwnProperty.call(r, 'ok')) || Boolean(r.ok);
        results.push({ type, ok, result: r });
        if (!ok) {
          throw new Error(`workflow.apply: comment action failed${r?.note ? `: ${r.note}` : ''}`);
        }
        continue;
      }
      if (type === 'set_labels') {
        // eslint-disable-next-line no-await-in-loop
        const r = await trackerBackend.tracker.set_labels({ id, add: a.add || [], remove: a.remove || [] });
        const ok = !(r && typeof r === 'object' && Object.prototype.hasOwnProperty.call(r, 'ok')) || Boolean(r.ok);
        results.push({ type, ok, result: r });
        if (!ok) {
          throw new Error(`workflow.apply: set_labels action failed${r?.note ? `: ${r.note}` : ''}`);
        }
        continue;
      }
      if (type === 'transition') {
        // eslint-disable-next-line no-await-in-loop
        const r = await trackerBackend.tracker.transition({ id, status: String(a.status || '') });
        const ok = !(r && typeof r === 'object' && Object.prototype.hasOwnProperty.call(r, 'ok')) || Boolean(r.ok);
        results.push({ type, ok, result: r });
        if (!ok) {
          throw new Error(`workflow.apply: transition action failed${r?.note ? `: ${r.note}` : ''}`);
        }
        continue;
      }
      throw new Error(`workflow.apply: unknown action type "${type}"`);
    }

    return { ok: true, results };
  }

  if (name === 'workflow.qa_decide' || name === 'workflow.review_decide' || name === 'workflow.security_decide') {
    const id = args?.id ? String(args.id) : '';
    if (!id) throw new Error(`${name} requires id`);
    const decision = String(args?.decision || '').toLowerCase();
    if (!['pass', 'fail'].includes(decision)) {
      throw new Error(`${name} requires decision to be "pass" or "fail"`);
    }

    const summary = await computeSummaryForTicket(id);
    const labels = Array.isArray(summary?.ticket?.labels) ? summary.ticket.labels : [];
    const userComment = args?.comment ? String(args.comment).trim() : '';
    const requestedStatus = args?.status ? String(args.status) : null;

    const labelApproved = workflowLabel(config, 'approved', 'ai-state:approved');
    const labelInQa = workflowLabel(config, 'in_qa', 'ai-state:in-qa');
    const labelVerified = workflowLabel(config, 'verified', 'ai-state:verified');
    const labelReviewed = workflowLabel(config, 'reviewed', 'ai-state:reviewed');
    const labelReviewFail = workflowLabel(config, 'review_fail', 'ai-state:review-fail');
    const labelSecurityPass = workflowLabel(config, 'security_pass', 'ai-state:security-pass');
    const labelSecurityFail = workflowLabel(config, 'security_fail', 'ai-state:security-fail');

    let actions = [];
    let result = {};

    if (name === 'workflow.qa_decide') {
      if (!safeLabelIncludes(labels, labelInQa)) {
        throw new Error(`workflow.qa_decide blocked: ticket must have ${labelInQa}`);
      }
      const testcases = args?.testcases ? String(args.testcases).trim() : '';
      const commentLines = [decision === 'pass' ? 'QA: PASS' : 'QA: FAIL'];
      if (testcases) commentLines.push(`TestCases: ${testcases}`);
      if (userComment) commentLines.push('', userComment);

      actions = [
        {
          type: 'set_labels',
          remove: [labelInQa],
          add: decision === 'pass' ? [labelVerified] : [labelApproved]
        },
        { type: 'comment', body: commentLines.join('\n') }
      ];
      if (decision === 'fail' || requestedStatus) {
        actions.unshift({ type: 'transition', status: requestedStatus || 'In Progress' });
      }
      result = { decision, from: labelInQa, to: decision === 'pass' ? labelVerified : labelApproved };
    }

    if (name === 'workflow.review_decide') {
      if (!safeLabelIncludes(labels, labelVerified)) {
        throw new Error(`workflow.review_decide blocked: ticket must have ${labelVerified}`);
      }
      const commentLines = [decision === 'pass' ? 'Review: PASS' : 'Review: FAIL'];
      if (userComment) commentLines.push('', userComment);

      actions = [
        decision === 'pass'
          ? { type: 'set_labels', remove: [labelReviewFail], add: [labelReviewed] }
          : { type: 'set_labels', remove: [labelReviewed, labelVerified], add: [labelReviewFail, labelApproved] },
        { type: 'comment', body: commentLines.join('\n') }
      ];
      if (decision === 'fail' || requestedStatus) {
        actions.unshift({ type: 'transition', status: requestedStatus || 'In Progress' });
      }
      result = { decision, from: labelVerified, to: decision === 'pass' ? labelReviewed : labelApproved };
    }

    if (name === 'workflow.security_decide') {
      if (!safeLabelIncludes(labels, labelVerified)) {
        throw new Error(`workflow.security_decide blocked: ticket must have ${labelVerified}`);
      }
      const commentLines = [decision === 'pass' ? 'Security: PASS' : 'Security: FAIL'];
      if (userComment) commentLines.push('', userComment);

      actions = [
        decision === 'pass'
          ? { type: 'set_labels', remove: [labelSecurityFail], add: [labelSecurityPass] }
          : { type: 'set_labels', remove: [labelSecurityPass, labelVerified], add: [labelSecurityFail, labelApproved] },
        { type: 'comment', body: commentLines.join('\n') }
      ];
      if (decision === 'fail' || requestedStatus) {
        actions.unshift({ type: 'transition', status: requestedStatus || 'In Progress' });
      }
      result = { decision, from: labelVerified, to: decision === 'pass' ? labelSecurityPass : labelApproved };
    }

    const applied = await callTool('workflow.apply', { id, strict: true, actions });
    return { version: '1.0', ticket: summary.ticket, ...result, actions, applied };
  }

  if (name === 'workflow.sync_plan_review') {
    const dryRun = args?.dry_run !== undefined ? Boolean(args.dry_run) : true;
    const limit = args?.limit !== undefined ? Number(args.limit) : 25;
    if (!Number.isFinite(limit) || limit <= 0) throw new Error('workflow.sync_plan_review requires a positive limit');

    const trackerBackendId = selectBackend('tracker', mode, config);
    const trackerBackend = loadBackend('tracker', trackerBackendId);

    const labelPlanReview = workflowLabel(config, 'plan_review', 'ai-state:plan-review');
    const labelApproved = workflowLabel(config, 'approved', 'ai-state:approved');
    const labelReadyForPlan = workflowLabel(config, 'ready_for_plan', 'ai-state:ready-for-plan');

    const search = await trackerBackend.tracker.search({ labels: [labelPlanReview], limit });
    const items = Array.isArray(search?.items) ? search.items : [];

    const decisions = [];
    for (const it of items.slice(0, limit)) {
      const ticketId = it.key || it.id;
      // eslint-disable-next-line no-await-in-loop
      const summary = await computeSummaryForTicket(ticketId);
      const specStatus = normalizeStatus(summary?.evidence?.spec?.status);

      let decision = 'noop';
      let planned = [];
      let note = null;

      if (!summary?.evidence?.spec || summary?.evidence?.spec?.missing) {
        decision = 'blocked';
        note = 'No linked Spec found; cannot sync.';
        planned = [{ type: 'comment', body: 'Governance Sync: BLOCKED - missing linked Spec (expected `Spec: <id> <url>` comment).' }];
      } else if (specStatus === 'APPROVED') {
        decision = 'approve';
        planned = [
          { type: 'set_labels', remove: [labelPlanReview], add: [labelApproved] },
          { type: 'comment', body: `Governance Sync: Spec APPROVED -> added ${labelApproved}` }
        ];
      } else if (specStatus === 'CHANGES REQUESTED' || specStatus === 'CHANGES_REQUESTED') {
        decision = 'changes_requested';
        planned = [
          { type: 'set_labels', remove: [labelPlanReview], add: [labelReadyForPlan] },
          { type: 'comment', body: `Governance Sync: Spec CHANGES REQUESTED -> added ${labelReadyForPlan}` }
        ];
      } else {
        decision = 'wait';
        planned = [{ type: 'comment', body: `Governance Sync: Spec status is ${specStatus || 'UNKNOWN'}; keeping ${labelPlanReview}.` }];
      }

      if (!dryRun) {
        // eslint-disable-next-line no-await-in-loop
        await callTool('workflow.apply', { id: String(ticketId), strict: true, actions: planned });
      }

      decisions.push({
        ticket: summary.ticket,
        specStatus: specStatus || 'UNKNOWN',
        decision,
        note,
        actions: planned
      });
    }

    return { version: '1.0', dry_run: dryRun, items: decisions };
  }

  if (name === 'workflow.release') {
    const id = args?.id ? String(args.id) : '';
    if (!id) throw new Error('workflow.release requires id');
    const dryRun = args?.dry_run !== undefined ? Boolean(args.dry_run) : true;

    const trackerBackendId = selectBackend('tracker', mode, config);
    const docsBackendId = selectBackend('docs', mode, config);
    const trackerBackend = loadBackend('tracker', trackerBackendId);
    const docsBackend = loadBackend('docs', docsBackendId);

    const summary = await computeSummaryForTicket(id);
    const labelVerified = workflowLabel(config, 'verified', 'ai-state:verified');
    const labelReviewed = workflowLabel(config, 'reviewed', 'ai-state:reviewed');
    const labelSecurityPass = workflowLabel(config, 'security_pass', 'ai-state:security-pass');
    const gateSecurity = workflowGate(config, 'security_audit', false);
    const labels = Array.isArray(summary?.ticket?.labels) ? summary.ticket.labels : [];

    const missing = [];
    if (!safeLabelIncludes(labels, labelVerified)) missing.push(labelVerified);
    if (!safeLabelIncludes(labels, labelReviewed)) missing.push(labelReviewed);
    if (gateSecurity && !safeLabelIncludes(labels, labelSecurityPass)) missing.push(labelSecurityPass);
    if (missing.length > 0) {
      throw new Error(`workflow.release blocked: missing required labels: ${missing.join(', ')}`);
    }

    const workflowLabels = Array.from(
      new Set(
        Object.values(config?.workflow?.labels || {})
          .filter((v) => typeof v === 'string' && v.trim())
          .map((v) => String(v).trim())
      )
    );

    const releaseTitle = `Release Notes: ${summary.ticket.key || summary.ticket.id}`;
    const releaseBody = [
      `Release Notes for ${summary.ticket.key || summary.ticket.id}`,
      '',
      summary.ticket.title || '',
      '',
      `Released by Agency workflow on ${new Date().toISOString()}`
    ].join('\n');

    const actions = [
      { type: 'transition', status: 'Done' },
      { type: 'set_labels', remove: workflowLabels, add: [] },
      { type: 'comment', body: `Release: COMPLETE\nRelease notes created. Ticket moved to Done and workflow labels cleared.` }
    ];

    if (!dryRun) {
      await docsBackend.docs.create({
        title: releaseTitle,
        body: releaseBody,
        status: 'DRAFT'
      });
      await callTool('workflow.apply', { id, strict: false, actions });
    }

    return {
      version: '1.0',
      dry_run: dryRun,
      ticket: summary.ticket,
      release_notes: { title: releaseTitle, status: 'DRAFT' },
      actions
    };
  }

  if (name.startsWith('tracker.')) {
    const backendId = selectBackend('tracker', mode, config);
    const backend = loadBackend('tracker', backendId);
    const fn = backend.tracker[name.slice('tracker.'.length)];
    if (typeof fn !== 'function') throw new Error(`Tool not implemented: ${name}`);
    return await fn(args || {});
  }

  if (name.startsWith('docs.')) {
    const backendId = selectBackend('docs', mode, config);
    const backend = loadBackend('docs', backendId);
    const fn = backend.docs[name.slice('docs.'.length)];
    if (typeof fn !== 'function') throw new Error(`Tool not implemented: ${name}`);
    return await fn(args || {});
  }

  if (name.startsWith('scm.')) {
    const backendId = selectBackend('scm', mode, config);
    if (backendId === 'none') {
      throw new Error('SCM integration is disabled. Set scm.provider="github" (or AGENCY_SCM_BACKEND=github).');
    }
    const backend = loadBackend('scm', backendId);
    const fn = backend.scm?.[name.slice('scm.'.length)];
    if (typeof fn !== 'function') throw new Error(`Tool not implemented: ${name}`);
    return await fn(args || {});
  }

  throw new Error(`Unknown tool: ${name}`);
}

function wrapToolResult(result) {
  // OpenCode expects standard MCP content blocks such as "text".
  // Keep structured data available in `structuredContent`, and also serialize
  // it into a text block for clients that only render textual results.
  let text;
  try {
    text = JSON.stringify(result, null, 2);
  } catch {
    text = String(result);
  }
  return {
    content: [
      {
        type: 'text',
        text
      }
    ],
    structuredContent: result
  };
}

class FramedJsonRpc {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.buffer = Buffer.alloc(0);
    this.expectedLength = null;
    this.mode = null; // 'content-length' | 'newline'
    this.partialLine = '';
  }

  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    // Detect framing if unknown.
    if (this.mode === null) {
      const head = this.buffer.slice(0, 64).toString('utf8');
      if (/^\s*Content-Length:/i.test(head)) {
        this.mode = 'content-length';
        outputFraming = 'content-length';
      } else if (/^\s*\{/.test(head) || head.includes('\n')) {
        this.mode = 'newline';
        outputFraming = 'newline';
      }
    }

    if (this.mode === 'newline') {
      const text = this.buffer.toString('utf8');
      this.buffer = Buffer.alloc(0);
      const combined = this.partialLine + text;
      const lines = combined.split('\n');
      this.partialLine = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const msg = JSON.parse(trimmed);
        this.onMessage(msg);
      }
      return;
    }

    // content-length framing (LSP-style)
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (this.expectedLength === null) {
        const headerEnd = this.buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        const headerText = this.buffer.slice(0, headerEnd).toString('utf8');
        const match = /Content-Length:\s*(\d+)/i.exec(headerText);
        if (!match) {
          // If headers aren't present, try newline fallback.
          this.mode = 'newline';
          outputFraming = 'newline';
          return this.push(Buffer.alloc(0));
        }
        this.expectedLength = Number(match[1]);
        this.buffer = this.buffer.slice(headerEnd + 4);
      }

      if (this.buffer.length < this.expectedLength) return;
      const body = this.buffer.slice(0, this.expectedLength).toString('utf8');
      this.buffer = this.buffer.slice(this.expectedLength);
      this.expectedLength = null;
      const msg = JSON.parse(body);
      this.onMessage(msg);
    }
  }
}

async function handleRequest(msg) {
  const { id, method, params } = msg || {};
  debug(`recv method=${String(method)} id=${id === undefined ? '(none)' : String(id)}`);

  // Notifications have no id; ignore.
  const isNotification = id === undefined || id === null;

  try {
    if (method === 'initialize') {
      const result = {
        protocolVersion: params?.protocolVersion || '2024-11-05',
        serverInfo: { name: 'agency', version: '0.1.0' },
        capabilities: {
          tools: {}
        }
      };
      if (!isNotification) send(jsonRpcResult(id, result));
      return;
    }

    if (method === 'initialized') {
      // Some clients send this notification after initialize; ignore.
      return;
    }

    if (method === 'shutdown') {
      // Standard JSON-RPC/LSP shutdown handshake.
      if (!isNotification) send(jsonRpcResult(id, null));
      return;
    }

    if (method === 'exit') {
      process.exit(0);
      return;
    }

    if (method === 'tools/list') {
      const result = { tools: toolList() };
      if (!isNotification) send(jsonRpcResult(id, result));
      return;
    }

    // Optional MCP features. OpenCode attempts to fetch prompts/resources from
    // every configured server; we don't provide prompts/resources here.
    if (method === 'prompts/list') {
      const result = { prompts: [] };
      if (!isNotification) send(jsonRpcResult(id, result));
      return;
    }

    if (method === 'prompts/get') {
      const result = { prompt: null };
      if (!isNotification) send(jsonRpcResult(id, result));
      return;
    }

    if (method === 'resources/list') {
      const result = { resources: [] };
      if (!isNotification) send(jsonRpcResult(id, result));
      return;
    }

    if (method === 'resources/read') {
      const result = { contents: [] };
      if (!isNotification) send(jsonRpcResult(id, result));
      return;
    }

    if (method === 'tools/call') {
      const { name, args } = normalizeCallParams(params);
      if (!name) throw new Error('tools/call requires params.name');
      const res = await callTool(name, args);
      const result = wrapToolResult(res);
      if (!isNotification) send(jsonRpcResult(id, result));
      return;
    }

    // Unknown method: per JSON-RPC.
    if (!isNotification) send(jsonRpcError(id, -32601, `Method not found: ${String(method)}`));
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    debug(`error method=${String(method)}: ${message}`);
    if (!isNotification) send(jsonRpcError(id, -32000, message));
  }
}

function main() {
  const parser = new FramedJsonRpc((msg) => {
    // No parallelism needed; keep ordering deterministic.
    void handleRequest(msg);
  });

  process.stdin.on('data', (chunk) => {
    try {
      parser.push(chunk);
    } catch (err) {
      writeStderr(`agency-mcp fatal: ${err && err.message ? err.message : String(err)}`);
      process.exit(1);
    }
  });
}

main();
