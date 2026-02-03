const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const {
  readOpencodeJsonc,
  extractPromptFileRef,
  promptRefToRepoPath
} = require('../testlib/helpers');

const repoRoot = path.resolve(__dirname, '..');
const configScript = path.join(repoRoot, 'scripts', 'config.js');

function mkTempHost() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agency-host-'));
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2));
}

function runConfig(args, hostRoot) {
  const result = cp.spawnSync(
    process.execPath,
    [configScript, ...args],
    {
      cwd: repoRoot,
      env: { ...process.env, AGENCY_HOST_ROOT: hostRoot },
      encoding: 'utf8'
    }
  );
  return result;
}

function assertPromptPathsExist(config) {
  for (const agent of Object.values(config.agent || {})) {
    if (!agent || typeof agent !== 'object') continue;
    if (!agent.prompt) continue;
    const promptRef = extractPromptFileRef(agent.prompt);
    assert.ok(promptRef, `Unexpected prompt reference: ${String(agent.prompt)}`);

    const promptPath = promptRefToRepoPath(repoRoot, promptRef);
    assert.ok(
      fs.existsSync(promptPath),
      `Prompt file missing for ref=${promptRef} resolved=${promptPath}`
    );
  }
}

test('config: generates opencode.jsonc for each tracker mode', () => {
  const profilesRoot = path.join(repoRoot, 'profiles');
  const profileDirs = fs
    .readdirSync(profilesRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const profileName of profileDirs) {
    const profilePath = path.join(profilesRoot, profileName, '.agency-project.json');
    const profileConfig = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    const mode = profileConfig?.tracker?.mode;
    assert.ok(mode, `profiles/${profileName}/.agency-project.json must define tracker.mode`);

    const expectedPromptSuffix =
      mode === 'atlassian'
        ? '/prompts/planning.md'
        : `/prompts/${mode}/planning.md`;

    const hostRoot = mkTempHost();
    writeJson(path.join(hostRoot, '.agency-project.json'), profileConfig);

    const gen = runConfig(['--generate'], hostRoot);
    assert.equal(gen.status, 0, gen.stderr || gen.stdout);

    const outPath = path.join(hostRoot, 'opencode.jsonc');
    assert.ok(fs.existsSync(outPath), 'Expected opencode.jsonc to be generated');
    const opencodeConfig = readOpencodeJsonc(outPath);

    // Minimal sanity checks
    assert.ok(opencodeConfig.agent, 'Expected agent block');
    assert.equal(opencodeConfig.permission?.edit, 'ask');
    assert.equal(opencodeConfig.permission?.bash, 'ask');

    // MCP expectations:
    // - Atlassian can optionally use MCP (explicitly enabled in profile config)
    // - Otherwise, MCP is empty by default (we rely on CLI/backends)
    const wantsAtlassianMcp = mode === 'atlassian' && profileConfig?.tracker?.atlassian?.backend === 'mcp';
    if (wantsAtlassianMcp) {
      assert.ok(opencodeConfig.mcp?.atlassian, `Expected mcp.atlassian for profile=${profileName}`);
    } else {
      assert.ok(!opencodeConfig.mcp?.atlassian, `Did not expect mcp.atlassian for profile=${profileName}`);
    }

    // Ensure Planning Agent prompt points at the right mode directory.
    const planningAgent = opencodeConfig.agent['Planning Agent'];
    assert.ok(planningAgent, 'Expected Planning Agent');
    const promptRef = extractPromptFileRef(planningAgent.prompt);
    assert.ok(promptRef, 'Expected prompt file ref');
    assert.ok(
      promptRef.endsWith(expectedPromptSuffix),
      `Expected prompt suffix ${expectedPromptSuffix}, got ${promptRef}`
    );

    assertPromptPathsExist(opencodeConfig);
  }
});

test('config: invalid JSON in project config fails validate/generate', () => {
  const hostRoot = mkTempHost();
  fs.writeFileSync(path.join(hostRoot, '.agency-project.json'), '{ "tracker": ');

  const validate = runConfig(['--validate'], hostRoot);
  assert.notEqual(validate.status, 0, 'Expected validate to fail');

  const gen = runConfig(['--generate'], hostRoot);
  assert.notEqual(gen.status, 0, 'Expected generate to fail');
});
