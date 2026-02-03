const fs = require('fs');
const path = require('path');

function stripJsoncToJson(text) {
  // opencode.jsonc uses a simple header comment block. We only need to remove
  // full-line // comments to parse it as JSON.
  return text
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
    .trim();
}

function readOpencodeJsonc(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const json = stripJsoncToJson(raw);
  return JSON.parse(json);
}

function extractPromptFileRef(prompt) {
  // Expected shape: "{file:./prompts/planning.md}" or "{file:.agency/prompts/...}"
  const match = /^\{file:(.+)\}$/.exec(String(prompt || '').trim());
  return match ? match[1] : null;
}

function promptRefToRepoPath(repoRoot, promptRef) {
  // If generated for a submodule install, prompts are referenced under `.agency/`.
  // In this repository, the prompts live at `prompts/`, so we normalize for tests.
  let ref = promptRef;
  if (ref.startsWith('.agency/')) {
    ref = ref.slice('.agency/'.length);
  }
  if (ref.startsWith('./')) {
    ref = ref.slice('./'.length);
  }
  return path.join(repoRoot, ref);
}

module.exports = {
  readOpencodeJsonc,
  extractPromptFileRef,
  promptRefToRepoPath
};

