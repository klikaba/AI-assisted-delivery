#!/usr/bin/env node
/**
 * Configuration loading and merging for .agency platform
 *
 * Usage:
 *   node config.js              Output resolved config as JSON
 *   node config.js --pretty     Output formatted JSON
 *   node config.js --generate   Generate opencode.jsonc
 *   node config.js --validate   Validate config and report issues
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

/**
 * Find host repository root (handles submodule case)
 */
function findHostRoot(agencyRoot) {
  // Test/automation override: allow running against an arbitrary host root
  // without depending on git topology (useful for hermetic tests and profiles).
  if (process.env.AGENCY_HOST_ROOT) {
    return path.resolve(process.env.AGENCY_HOST_ROOT);
  }

  // Anchor git commands to the .agency checkout location so callers can run this
  // script from any working directory.
  const gitCwd = agencyRoot || path.resolve(__dirname, '..');
  try {
    const superproject = cp.execSync(
      'git rev-parse --show-superproject-working-tree',
      { cwd: gitCwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    if (superproject) return superproject;
  } catch {
    // Not in a superproject
  }

  try {
    return cp.execSync('git rev-parse --show-toplevel', {
      cwd: gitCwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch {
    // Non-git fallback: treat the .agency checkout itself as the root.
    return gitCwd;
  }
}

/**
 * Deep merge two objects. Later values override earlier.
 * Arrays are replaced, not merged.
 * null/undefined values in source are skipped (don't override).
 */
function deepMerge(target, source) {
  if (!source) return target;
  const result = { ...target };

  for (const key of Object.keys(source)) {
    if (source[key] === null || source[key] === undefined) continue;

    if (typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Load JSON file safely
 */
function loadJSON(filepath, parseErrors) {
  try {
    if (!fs.existsSync(filepath)) return null;
    const content = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    const message = `Failed to parse ${filepath}: ${err.message}`;
    if (Array.isArray(parseErrors)) {
      parseErrors.push(message);
    } else {
      console.error(`Warning: ${message}`);
    }
    return null;
  }
}

/**
 * Load environment variable overrides
 * Maps AGENCY_* env vars to config paths
 */
function loadEnvOverrides() {
  const overrides = {};
  const env = process.env;

  if (env.AGENCY_MODEL_DEFAULT) {
    overrides.models = overrides.models || {};
    overrides.models.default = env.AGENCY_MODEL_DEFAULT;
  }

  if (env.AGENCY_TRACKER_MODE) {
    overrides.tracker = overrides.tracker || {};
    overrides.tracker.mode = env.AGENCY_TRACKER_MODE;
  }

  if (env.AGENCY_TEST_COMMAND) {
    overrides.tooling = overrides.tooling || {};
    overrides.tooling.test_command = env.AGENCY_TEST_COMMAND;
  }

  if (env.AGENCY_LINT_COMMAND) {
    overrides.tooling = overrides.tooling || {};
    overrides.tooling.lint_command = env.AGENCY_LINT_COMMAND;
  }

  if (env.AGENCY_DOCS_PROVIDER) {
    overrides.docs = overrides.docs || {};
    overrides.docs.provider = env.AGENCY_DOCS_PROVIDER;
  }

  if (env.AGENCY_DOCS_DIR) {
    overrides.docs = overrides.docs || {};
    overrides.docs.repo = overrides.docs.repo || {};
    overrides.docs.repo.dir = env.AGENCY_DOCS_DIR;
  }

  if (env.AGENCY_TMS_PROVIDER) {
    overrides.tms = overrides.tms || {};
    overrides.tms.provider = env.AGENCY_TMS_PROVIDER;
  }

  return overrides;
}

/**
 * Load and merge all config layers
 * Order: defaults -> org -> project -> env
 */
function loadConfig() {
  const agencyRoot = path.resolve(__dirname, '..');
  const hostRoot = findHostRoot(agencyRoot);
  const parseErrors = [];

  // Layer 1: Platform defaults
  const defaults = loadJSON(path.join(agencyRoot, 'defaults.json'), parseErrors) || {};

  // Layer 2: Org config (optional)
  const orgConfig = loadJSON(path.join(hostRoot, '.agency-org.json'), parseErrors);

  // Layer 3: Project config
  const projectConfig = loadJSON(path.join(hostRoot, '.agency-project.json'), parseErrors);

  // Layer 4: Environment overrides
  const envOverrides = loadEnvOverrides();

  // Merge all layers
  let config = defaults;
  config = deepMerge(config, orgConfig);
  config = deepMerge(config, projectConfig);
  config = deepMerge(config, envOverrides);

  // Resolve agent models (use default if not specified)
  if (config.models && config.models.agents) {
    for (const agent of Object.keys(config.models.agents)) {
      if (!config.models.agents[agent]) {
        config.models.agents[agent] = config.models.default;
      }
    }
  }

  return {
    config,
    meta: {
      agencyRoot,
      hostRoot,
      hasOrgConfig: !!orgConfig,
      hasProjectConfig: !!projectConfig,
      parseErrors
    }
  };
}

/**
 * Validate config and return errors/warnings
 */
function validateConfig(config) {
  const errors = [];
  const warnings = [];

  // Check tracker mode
  if (!config.tracker?.mode) {
    errors.push('tracker.mode is required');
  } else if (!['atlassian', 'github', 'linear', 'standalone'].includes(config.tracker.mode)) {
    errors.push('tracker.mode must be one of: atlassian, github, linear, standalone');
  }

  // Atlassian backend selection (optional; defaults to api)
  if (config.tracker?.mode === 'atlassian') {
    const backend = config.tracker?.atlassian?.backend || 'api';
    if (!['api', 'mcp'].includes(backend)) {
      errors.push('tracker.atlassian.backend must be one of: api, mcp');
    }
    if (backend === 'mcp' && !config.tracker?.atlassian?.mcp_url) {
      errors.push('tracker.atlassian.mcp_url is required when tracker.atlassian.backend is "mcp"');
    }
  }

  // Check default model
  if (!config.models?.default) {
    warnings.push('models.default not set - agents may fail');
  }

  // SCM provider (optional; default is none)
  if (config.scm?.provider !== undefined) {
    const p = String(config.scm.provider);
    if (!['none', 'github'].includes(p)) {
      errors.push('scm.provider must be one of: none, github');
    }
  }

  // Docs provider (optional; default is repo)
  if (config.docs?.provider !== undefined) {
    const p = String(config.docs.provider);
    if (!['none', 'repo', 'atlassian'].includes(p)) {
      errors.push('docs.provider must be one of: none, repo, atlassian');
    }
    if (p === 'repo') {
      const dir = config.docs?.repo?.dir;
      if (dir !== undefined) {
        const s = String(dir);
        const normalized = path.normalize(s);
        const parts = normalized.split(path.sep).filter(Boolean);
        const escapes = parts.includes('..') || normalized.startsWith(`..${path.sep}`) || normalized === '..';
        if (!s.trim() || path.isAbsolute(s) || escapes) {
          errors.push('docs.repo.dir must be a non-empty relative path within the host repo when docs.provider is "repo"');
        }
      }
    }
  }

  // TMS provider (optional; default is none)
  if (config.tms?.provider !== undefined) {
    const p = String(config.tms.provider);
    if (!['none', 'testrail'].includes(p)) {
      errors.push('tms.provider must be one of: none, testrail');
    }
  }

  // Check at least one agent is enabled
  const enabledAgents = Object.entries(config.agents || {})
    .filter(([, v]) => v.enabled !== false);
  if (enabledAgents.length === 0) {
    errors.push('At least one agent must be enabled');
  }

  // Optional workflow customization (labels/gates)
  if (config.workflow?.labels !== undefined) {
    const labels = config.workflow.labels;
    if (labels === null || typeof labels !== 'object' || Array.isArray(labels)) {
      errors.push('workflow.labels must be an object when provided');
    } else {
      for (const [k, v] of Object.entries(labels)) {
        if (typeof v !== 'string' || !v.trim()) {
          errors.push(`workflow.labels.${k} must be a non-empty string`);
        }
      }
    }
  }
  if (config.workflow?.gates !== undefined) {
    const gates = config.workflow.gates;
    if (gates === null || typeof gates !== 'object' || Array.isArray(gates)) {
      errors.push('workflow.gates must be an object when provided');
    } else {
      for (const [k, v] of Object.entries(gates)) {
        if (typeof v !== 'boolean') {
          errors.push(`workflow.gates.${k} must be a boolean`);
        }
      }
    }
  }

  return { errors, warnings, valid: errors.length === 0 };
}

/**
 * Generate opencode.jsonc from config
 */
function listOpenCodePresets() {
  return [
    'full',
    'product',
    'planning',
    'architecture',
    'dev',
    'qa',
    'review',
    'security',
    'devops',
    'pm'
  ];
}

function presetToAgentKeys(preset) {
  const p = String(preset || '').trim().toLowerCase();
  if (!p || p === 'full') return null;

  // Role-focused presets: show only one agent in the OpenCode TUI.
  if (p === 'product') return new Set(['product_owner']);
  if (p === 'planning') return new Set(['planning']);
  if (p === 'architecture') return new Set(['architecture']);
  if (p === 'dev') return new Set(['developer']);
  if (p === 'qa') return new Set(['qa']);
  if (p === 'review') return new Set(['reviewer']);
  if (p === 'security') return new Set(['security']);
  if (p === 'devops') return new Set(['devops']);
  if (p === 'pm') return new Set(['pm']);

  throw new Error(`Unknown preset: ${preset}`);
}

function outputPathForPreset(hostRoot, preset) {
  const p = String(preset || '').trim().toLowerCase();
  if (!p || p === 'full') return path.join(hostRoot, 'opencode.jsonc');
  return path.join(hostRoot, `opencode.${p}.jsonc`);
}

function presetDocPath(hostRoot) {
  return path.join(hostRoot, 'OPENCODE_PRESETS.md');
}

function presetDisplayName(preset) {
  const p = String(preset || '').trim().toLowerCase();
  if (!p || p === 'full') return 'Full (All Agents)';
  return p.toUpperCase();
}

function configFilenameForPreset(preset) {
  const p = String(preset || '').trim().toLowerCase();
  if (!p || p === 'full') return 'opencode.jsonc';
  return `opencode.${p}.jsonc`;
}

function agentNamesForPreset(preset) {
  const keys = presetToAgentKeys(preset);
  if (!keys) return 'All agents';
  const map = {
    product_owner: 'Product Owner Agent',
    planning: 'Planning Agent',
    architecture: 'Architecture Agent',
    developer: 'Developer Agent',
    reviewer: 'Code Reviewer Agent',
    security: 'Security Engineer Agent',
    devops: 'DevOps Engineer Agent',
    qa: 'QA Engineer Agent',
    pm: 'Project Manager Agent'
  };
  return Array.from(keys).map((k) => map[k] || k).join(', ');
}

function writePresetCheatsheet({ hostRoot }) {
  const presets = listOpenCodePresets();
  const lines = [];

  lines.push('# OpenCode Presets (Generated)');
  lines.push('');
  lines.push('This file is generated by `.agency/scripts/config.js`.');
  lines.push('Regenerate with: `./.agency/bin/agency generate --presets`');
  lines.push('');
  lines.push('## Start OpenCode');
  lines.push('');
  for (const p of presets) {
    const file = configFilenameForPreset(p);
    lines.push(`- **${presetDisplayName(p)}**: \`opencode --config ${file}\``);
  }
  lines.push('');
  lines.push('## What Each Preset Includes');
  lines.push('');
  for (const p of presets) {
    const file = configFilenameForPreset(p);
    lines.push(`- \`${file}\`: ${agentNamesForPreset(p)}`);
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- These configs only change what agents appear in the OpenCode TUI.');
  lines.push('- The underlying workflow (Jira/Confluence/GitHub, `ai-state:*` labels, Spec Status gate) stays the same.');
  lines.push('');

  fs.writeFileSync(presetDocPath(hostRoot), `${lines.join('\n')}\n`);
}

function generateOpenCodeConfig(config, meta, { preset } = {}) {
  const includeKeys = presetToAgentKeys(preset);
  const outputPath = outputPathForPreset(meta.hostRoot, preset);

  // Build MCP config based on tracker mode
  const mcp = {};
  // Always expose the stable Agency capability tools via a local MCP server.
  const isSubmodule = meta.hostRoot !== meta.agencyRoot;
  const agencyMcpScript = isSubmodule ? '.agency/scripts/agency-mcp.js' : 'scripts/agency-mcp.js';
  mcp.agency = {
    type: 'local',
    command: ['node', agencyMcpScript],
    enabled: true
  };

  const atlassianBackend = config.tracker?.atlassian?.backend || 'api';
  if (config.tracker.mode === 'atlassian' && atlassianBackend === 'mcp') {
    mcp.atlassian = {
      type: 'local',
      command: [
        'npx',
        '-y',
        'mcp-remote',
        config.tracker.atlassian?.mcp_url || 'https://mcp.atlassian.com/v1/sse'
      ],
      enabled: true
    };
  }
  // GitHub and standalone modes: no MCP configured by default
  // Users can add custom MCP config in their project config

  // Build agent config
  const agents = {
    // Disable built-in agents that conflict with our custom ones
    planning: { disable: true },
    dev: { disable: true },
    review: { disable: true },
    qa: { disable: true },
    build: { disable: true },
    plan: { disable: true }
  };

  // Map internal agent keys to display names and prompt files
  const agentMap = {
    product_owner: {
      name: 'Product Owner Agent',
      prompt: 'product.md',
      desc: 'Refines backlog items and ensures business clarity.'
    },
    planning: {
      name: 'Planning Agent',
      prompt: 'planning.md',
      desc: 'Converts requirements into Architecture and Plans.'
    },
    architecture: {
      name: 'Architecture Agent',
      prompt: 'architecture.md',
      desc: 'Designs system components and diagrams.'
    },
    developer: {
      name: 'Developer Agent',
      prompt: 'dev.md',
      desc: 'Implements features based on approved plans.'
    },
    reviewer: {
      name: 'Code Reviewer Agent',
      prompt: 'review.md',
      desc: 'Reviews code against standards.'
    },
    security: {
      name: 'Security Engineer Agent',
      prompt: 'security.md',
      desc: 'Audits code for vulnerabilities.'
    },
    devops: {
      name: 'DevOps Engineer Agent',
      prompt: 'devops.md',
      desc: 'Manages environment and pipelines.'
    },
    qa: {
      name: 'QA Engineer Agent',
      prompt: 'qa.md',
      desc: 'Generates and runs E2E tests.'
    },
    pm: {
      name: 'Project Manager Agent',
      prompt: 'pm.md',
      desc: 'Tracks status, syncs governance, and manages releases.'
    }
  };

  // Determine the relative path to prompts based on where opencode.jsonc will be
  // If hostRoot contains .agency as a submodule, prompts are at .agency/prompts/
  // If running standalone (hostRoot === agencyRoot), prompts are at ./prompts/
  const basePromptPath = isSubmodule ? '.agency/prompts/' : './prompts/';
  
  // Mode-specific prompt paths:
  // - atlassian: prompts/ (root-level prompts are Atlassian-optimized)
  // - github: prompts/github/
  // - standalone: prompts/standalone/
  const modeSubdir = config.tracker.mode === 'atlassian' ? '' : `${config.tracker.mode}/`;
  const promptPrefix = basePromptPath + modeSubdir;

  for (const [key, info] of Object.entries(agentMap)) {
    const agentConfig = config.agents?.[key] || {};
    const allowedByPreset = includeKeys ? includeKeys.has(key) : true;
    if (agentConfig.enabled === false || !allowedByPreset) continue;
    {
      agents[info.name] = {
        model: config.models.agents?.[key] || config.models.default,
        description: info.desc,
        prompt: `{file:${promptPrefix}${info.prompt}}`
      };
      // Apply tool restrictions if specified
      if (agentConfig.tools) {
        agents[info.name].tools = agentConfig.tools;
      }
    }
  }

  const output = {
    $schema: 'https://opencode.ai/config.json',
    permission: config.opencode?.permission || { edit: 'ask', bash: 'ask' },
    mcp,
    agent: agents
  };

  // Write with comment header
  const generatedBy = isSubmodule ? '.agency/scripts/config.js' : 'scripts/config.js';
  const regenCmd = isSubmodule
    ? 'node .agency/scripts/config.js --generate'
    : 'node scripts/config.js --generate';
  const regenSuffix = preset && String(preset).trim() && String(preset).trim().toLowerCase() !== 'full'
    ? ` --preset ${String(preset).trim()}`
    : '';

  const presetLabel = preset && String(preset).trim()
    ? String(preset).trim().toLowerCase()
    : 'full';

  const header = `// Generated by ${generatedBy} - DO NOT EDIT DIRECTLY
// Regenerate with: ${regenCmd}${regenSuffix}
// Preset: ${presetLabel}
// Config source: .agency-project.json + .agency-org.json (if exists) + defaults.json
`;

  fs.writeFileSync(outputPath, header + JSON.stringify(output, null, 2) + '\n');
  return outputPath;
}

/**
 * Parse command line arguments
 */
function parseArgs(argv) {
  const out = {
    pretty: false,
    generate: false,
    validate: false,
    presets: false,
    listPresets: false,
    preset: null,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--pretty') out.pretty = true;
    else if (a === '--generate') out.generate = true;
    else if (a === '--validate') out.validate = true;
    else if (a === '--presets') out.presets = true;
    else if (a === '--list-presets') out.listPresets = true;
    else if (a === '--preset') {
      const v = argv[i + 1];
      if (!v || String(v).startsWith('--')) {
        throw new Error('--preset requires a value');
      }
      out.preset = String(v);
      i += 1;
    } else if (a === '--help' || a === '-h') out.help = true;
  }

  return out;
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
.agency Configuration Tool

Usage:
  node config.js [options]

Options:
  --pretty     Output formatted JSON
  --generate   Generate opencode.jsonc from configuration
  --preset     Generate a focused OpenCode config (e.g. "planning", "dev", "qa")
  --presets    Generate all preset OpenCode configs (writes multiple opencode.<preset>.jsonc files)
  --list-presets  Print available preset names
  --validate   Validate config and report issues
  --help, -h   Show this help message

Examples:
  node config.js                    # Output resolved config
  node config.js --pretty           # Output formatted config
  node config.js --generate         # Generate opencode.jsonc
  node config.js --generate --preset planning   # Generate opencode.planning.jsonc
  node config.js --generate --presets           # Generate all opencode.<preset>.jsonc files
  node config.js --list-presets     # Print presets
  node config.js --validate         # Check config validity

Environment Variables:
  AGENCY_MODEL_DEFAULT    Override default model
  AGENCY_TRACKER_MODE     Override tracker mode (atlassian/github/standalone)
  AGENCY_TEST_COMMAND     Override test command
  AGENCY_LINT_COMMAND     Override lint command
  AGENCY_DOCS_PROVIDER    Override docs provider (none/repo/atlassian)
  AGENCY_DOCS_DIR         Override repo docs dir (relative to host root)
  AGENCY_TMS_PROVIDER     Override test management provider (none/testrail)
`);
}

/**
 * CLI entry point
 */
function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
  }

  if (args.help) {
    showHelp();
    return;
  }

  try {
    if (args.listPresets) {
      const presets = listOpenCodePresets().filter((p) => p !== 'full');
      console.log(['full', ...presets].join('\n'));
      return;
    }

    const { config, meta } = loadConfig();
    if (meta.parseErrors && meta.parseErrors.length > 0) {
      if (args.validate || args.generate) {
        console.error('Errors:');
        meta.parseErrors.forEach(e => console.error(`  - ${e}`));
        process.exit(1);
      } else {
        console.error('Warnings:');
        meta.parseErrors.forEach(e => console.error(`  - ${e}`));
      }
    }

    if (args.validate) {
      const result = validateConfig(config);
      if (result.warnings.length > 0) {
        console.error('Warnings:');
        result.warnings.forEach(w => console.error(`  - ${w}`));
      }
      if (result.errors.length > 0) {
        console.error('Errors:');
        result.errors.forEach(e => console.error(`  - ${e}`));
        process.exit(1);
      }
      console.log('Config is valid');
      return;
    }

    if (args.generate) {
      const validation = validateConfig(config);
      if (!validation.valid) {
        console.error('Config validation failed:');
        validation.errors.forEach(e => console.error(`  - ${e}`));
        process.exit(1);
      }

      if (args.presets) {
        const presets = listOpenCodePresets().filter((p) => p !== 'full');
        const generated = [];
        // Always generate the full config as the default.
        generated.push(generateOpenCodeConfig(config, meta, { preset: 'full' }));
        for (const p of presets) {
          generated.push(generateOpenCodeConfig(config, meta, { preset: p }));
        }
        writePresetCheatsheet({ hostRoot: meta.hostRoot });
        const docPath = presetDocPath(meta.hostRoot);

        const files = generated.map((p) => path.basename(p));
        const startLines = ['Run one of:'];
        for (const f of files) {
          if (f === 'opencode.jsonc') startLines.push(`- opencode --config ${f}`);
        }
        for (const f of files) {
          if (f !== 'opencode.jsonc') startLines.push(`- opencode --config ${f}`);
        }

        console.log(
          [
            'Generated:',
            ...generated.map((p) => `- ${p}`),
            `- ${docPath}`,
            '',
            ...startLines
          ].join('\n')
        );
        return;
      }

      if (args.preset) {
        const outputPath = generateOpenCodeConfig(config, meta, { preset: args.preset });
        console.log(`Generated: ${outputPath}`);
        return;
      }

      const outputPath = generateOpenCodeConfig(config, meta, { preset: 'full' });
      console.log(`Generated: ${outputPath}`);
      return;
    }

    // Default: output resolved config
    const output = args.pretty
      ? JSON.stringify(config, null, 2)
      : JSON.stringify(config);
    console.log(output);

  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

// Run CLI if executed directly
if (require.main === module) {
  main();
}

// Export for use as module
module.exports = { loadConfig, validateConfig, deepMerge, findHostRoot };
