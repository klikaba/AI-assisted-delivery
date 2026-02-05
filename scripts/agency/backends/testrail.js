function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

function normalizeBaseUrl(url) {
  return String(url || '').replace(/\/+$/, '');
}

function loadTmsDefaultsFromConfig() {
  try {
    // eslint-disable-next-line global-require
    const { loadConfig } = require('../../config.js');
    const { config } = loadConfig();
    const t = config?.tms?.testrail || {};
    return {
      projectId: t.project_id !== undefined && t.project_id !== null ? Number(t.project_id) : null,
      suiteId: t.suite_id !== undefined && t.suite_id !== null ? Number(t.suite_id) : null,
      sectionId: t.section_id !== undefined && t.section_id !== null ? Number(t.section_id) : null,
      suiteStrategy: t.suite_strategy ? String(t.suite_strategy) : 'component'
    };
  } catch {
    return { projectId: null, suiteId: null, sectionId: null, suiteStrategy: 'component' };
  }
}

function getTestRailConfig() {
  const defaults = loadTmsDefaultsFromConfig();
  const host = normalizeBaseUrl(requireEnv('TESTRAIL_HOST'));
  const username = requireEnv('TESTRAIL_USERNAME');
  const apiKey = requireEnv('TESTRAIL_API_KEY');
  const projectId = defaults.projectId ?? Number(process.env.TESTRAIL_PROJECT_ID || 0);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    throw new Error('TESTRAIL_PROJECT_ID must be a positive number');
  }
  const suiteId = defaults.suiteId ?? (process.env.TESTRAIL_SUITE_ID ? Number(process.env.TESTRAIL_SUITE_ID) : null);
  const sectionId = defaults.sectionId ?? (process.env.TESTRAIL_SECTION_ID ? Number(process.env.TESTRAIL_SECTION_ID) : null);
  const suiteStrategy = defaults.suiteStrategy || 'component';
  return { host, username, apiKey, projectId, suiteId, sectionId, suiteStrategy };
}

async function testrailFetch(path, { method = 'GET', body } = {}) {
  const { host, username, apiKey } = getTestRailConfig();
  const url = `${host}${path.startsWith('/') ? '' : '/'}${path}`;
  const auth = Buffer.from(`${username}:${apiKey}`, 'utf8').toString('base64');
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${url} failed: HTTP ${res.status} ${res.statusText}${text ? `: ${text.slice(0, 500)}` : ''}`);
  }
  if (!text) return null;
  return JSON.parse(text);
}

async function tms_suite_ensure({ name }) {
  const cfg = getTestRailConfig();
  const desiredName = String(name || '').trim();

  // Strategy:
  // - component: expect suite/section to be preconfigured (no mutation).
  // - ticket: if suite/section not configured, create them best-effort.
  const strategy = String(cfg.suiteStrategy || 'component').toLowerCase();

  if (strategy !== 'ticket') {
    return {
      project_id: cfg.projectId,
      suite_id: cfg.suiteId,
      section_id: cfg.sectionId,
      strategy,
      note: 'Using component strategy. Set config.tms.testrail.suite_id/section_id (or TESTRAIL_SUITE_ID/TESTRAIL_SECTION_ID).'
    };
  }

  // ticket strategy: ensure suite + a section exist.
  let suiteId = cfg.suiteId;
  let sectionId = cfg.sectionId;

  if (!suiteId) {
    if (!desiredName) {
      return {
        project_id: cfg.projectId,
        suite_id: null,
        section_id: null,
        strategy,
        note: 'Ticket strategy requires a suite name. Pass name (e.g., ticket key) or set suite_id.'
      };
    }
    try {
      const res = await testrailFetch(`/index.php?/api/v2/add_suite/${cfg.projectId}`, { method: 'POST', body: { name: desiredName } });
      suiteId = Number(res?.id);
    } catch (err) {
      return {
        project_id: cfg.projectId,
        suite_id: null,
        section_id: null,
        strategy,
        note: `Failed to create suite (project may be single-suite mode). Set suite_id/section_id explicitly. Error: ${err && err.message ? err.message : String(err)}`
      };
    }
  }

  if (!sectionId) {
    const sectionName = desiredName ? `${desiredName} - Cases` : 'Cases';
    try {
      const res = await testrailFetch(`/index.php?/api/v2/add_section/${cfg.projectId}`, {
        method: 'POST',
        body: { name: sectionName, suite_id: suiteId }
      });
      sectionId = Number(res?.id);
    } catch (err) {
      return {
        project_id: cfg.projectId,
        suite_id: suiteId,
        section_id: null,
        strategy,
        note: `Failed to create section. Set section_id explicitly. Error: ${err && err.message ? err.message : String(err)}`
      };
    }
  }

  return { project_id: cfg.projectId, suite_id: suiteId, section_id: sectionId, strategy };
}

async function tms_case_create({ title, steps, expected, section_id }) {
  const cfg = getTestRailConfig();
  const sectionId = section_id !== undefined && section_id !== null && section_id !== ''
    ? Number(section_id)
    : cfg.sectionId;
  if (!Number.isFinite(sectionId) || sectionId <= 0) {
    throw new Error('TestRail case_create requires a valid section_id (provide TESTRAIL_SECTION_ID or pass section_id)');
  }

  // TestRail API uses /index.php?/api/v2/... paths.
  // add_case/{section_id}
  const body = {
    title: String(title || ''),
    custom_steps: String(steps || ''),
    custom_expected: String(expected || '')
  };
  const res = await testrailFetch(`/index.php?/api/v2/add_case/${sectionId}`, { method: 'POST', body });
  return {
    case: {
      id: Number(res?.id),
      title: res?.title ? String(res.title) : String(title || ''),
      section_id: Number(sectionId),
      url: cfg.host ? `${cfg.host}/index.php?/cases/view/${res?.id}` : null
    }
  };
}

module.exports = {
  id: 'testrail',
  tms: {
    suite_ensure: tms_suite_ensure,
    case_create: tms_case_create
  },
  tracker: {},
  docs: {},
  scm: {}
};
