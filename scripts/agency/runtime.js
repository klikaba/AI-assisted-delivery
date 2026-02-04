const path = require('path');

function getRepoRoot() {
  return path.resolve(__dirname, '..', '..');
}

function loadResolvedConfig() {
  // Keep the dependency local so `agency` stays usable as a standalone CLI.
  // config.js already supports AGENCY_HOST_ROOT for hermetic runs.
  // eslint-disable-next-line global-require
  const { loadConfig } = require('../config.js');
  const { config, meta } = loadConfig();
  return { config, meta };
}

function selectBackend(kind, mode, config) {
  // Override knobs:
  // - AGENCY_INTEGRATION_BACKEND=fake (applies to tracker+docs+scm)
  // - AGENCY_TRACKER_BACKEND=fake
  // - AGENCY_DOCS_BACKEND=fake
  // - AGENCY_SCM_BACKEND=fake|github|none
  const global = process.env.AGENCY_INTEGRATION_BACKEND;
  const specific = kind === 'tracker'
    ? process.env.AGENCY_TRACKER_BACKEND
    : kind === 'docs'
      ? process.env.AGENCY_DOCS_BACKEND
      : process.env.AGENCY_SCM_BACKEND;

  const forced = specific || global;
  if (forced) return forced;

  // Default mapping:
  // - GitHub: CLI-first (gh)
  // - Atlassian: keep a stub now; we’ll wire a real implementation behind this.
  // - Standalone: fake/local backend (no external systems).
  //
  // SCM (source control): configured separately from tracker mode.
  if (kind === 'scm') {
    const provider = config?.scm?.provider || 'none';
    if (provider === 'none') return 'none';
    if (provider === 'github') return 'github';
    return String(provider);
  }

  if (kind === 'docs') {
    const provider = config?.docs?.provider;
    if (provider === 'none') return 'none';
    if (provider === 'repo') return 'repo';
    if (provider === 'atlassian') return 'atlassian';
    if (provider) return String(provider);

    // Default: repo-backed docs to keep docs optional and portable.
    // Preserve legacy deterministic behavior in standalone mode unless explicitly configured.
    if (mode === 'standalone') return 'fake';
    return 'repo';
  }

  if (mode === 'linear') return 'linear';
  if (mode === 'github') return 'github';
  if (mode === 'standalone') return 'fake';
  return 'atlassian';
}

function loadBackend(kind, backendId) {
  if (backendId === 'none') {
    return { id: 'none', tracker: {}, docs: {}, scm: {} };
  }
  if (backendId === 'fake') {
    // eslint-disable-next-line global-require
    return require('./backends/fake');
  }
  if (backendId === 'repo') {
    // eslint-disable-next-line global-require
    return require('./backends/repo');
  }
  if (backendId === 'github') {
    // eslint-disable-next-line global-require
    return require('./backends/github');
  }
  if (backendId === 'atlassian') {
    // eslint-disable-next-line global-require
    return require('./backends/atlassian');
  }
  if (backendId === 'linear') {
    // eslint-disable-next-line global-require
    return require('./backends/linear');
  }
  throw new Error(`Unknown backend "${backendId}" for kind="${kind}"`);
}

module.exports = {
  getRepoRoot,
  loadResolvedConfig,
  selectBackend,
  loadBackend
};
