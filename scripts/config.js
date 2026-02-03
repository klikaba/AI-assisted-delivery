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
  } else if (!['atlassian', 'github', 'standalone'].includes(config.tracker.mode)) {
    errors.push('tracker.mode must be one of: atlassian, github, standalone');
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

  // Check at least one agent is enabled
  const enabledAgents = Object.entries(config.agents || {})
    .filter(([, v]) => v.enabled !== false);
  if (enabledAgents.length === 0) {
    errors.push('At least one agent must be enabled');
  }

  return { errors, warnings, valid: errors.length === 0 };
}

/**
 * Generate opencode.jsonc from config
 */
function generateOpenCodeConfig(config, meta) {
  const outputPath = path.join(meta.hostRoot, 'opencode.jsonc');

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
    if (agentConfig.enabled === false) {
      agents[info.name] = { disable: true };
    } else {
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

  const header = `// Generated by ${generatedBy} - DO NOT EDIT DIRECTLY
// Regenerate with: ${regenCmd}
// Config source: .agency-project.json + .agency-org.json (if exists) + defaults.json
`;

  fs.writeFileSync(outputPath, header + JSON.stringify(output, null, 2) + '\n');
  return outputPath;
}

/**
 * Parse command line arguments
 */
function parseArgs(argv) {
  return {
    pretty: argv.includes('--pretty'),
    generate: argv.includes('--generate'),
    validate: argv.includes('--validate'),
    help: argv.includes('--help') || argv.includes('-h')
  };
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
  --validate   Validate config and report issues
  --help, -h   Show this help message

Examples:
  node config.js                    # Output resolved config
  node config.js --pretty           # Output formatted config
  node config.js --generate         # Generate opencode.jsonc
  node config.js --validate         # Check config validity

Environment Variables:
  AGENCY_MODEL_DEFAULT    Override default model
  AGENCY_TRACKER_MODE     Override tracker mode (atlassian/github/standalone)
  AGENCY_TEST_COMMAND     Override test command
  AGENCY_LINT_COMMAND     Override lint command
`);
}

/**
 * CLI entry point
 */
function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    showHelp();
    return;
  }

  try {
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
      const outputPath = generateOpenCodeConfig(config, meta);
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
