const fs = require('fs');
const path = require('path');

const MEMORY_FILE = path.join(__dirname, '../memory.json');
const PROJECT_RULES_FILE = path.join(process.cwd(), '.agencyrules.md');
const PROJECT_RULES_SCOPE_NOTE = '(demo-target only)';

// SEED DATA for the demo
const SEED_MEMORY = [
  {
    "scope": "global",
    "fact": "All new Express middleware must be implemented in a separate file under 'src/middleware/'."
  },
  {
    "scope": "repo",
    "fact": "All API responses must include a 'correlationId' header for distributed tracing."
  },
  {
    "scope": "security",
    "fact": "Never commit secrets or tokens; flag hard-coded credentials in code, logs, or comments."
  }
];

function init() {
  if (!fs.existsSync(MEMORY_FILE) || fs.readFileSync(MEMORY_FILE, 'utf8').trim() === '[]') {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(SEED_MEMORY, null, 2));
  }
}

function getMemory() {
  init();
  let memories = [];
  
  // 1. Load Persistent Memory (JSON)
  try {
    memories = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
  } catch (e) {
    console.error("Error reading memory.json", e);
  }

  // 2. Load Project-Specific Rules (.agencyrules.md)
  if (fs.existsSync(PROJECT_RULES_FILE)) {
    const localRules = fs.readFileSync(PROJECT_RULES_FILE, 'utf8');
    memories.push({
      scope: "local-project",
      fact: `Loaded from .agencyrules.md ${PROJECT_RULES_SCOPE_NOTE}:\n${localRules}`
    });
  }

  console.log("=== AGENCY MEMORY (CONTEXT ENGINE) ===");
  console.log(JSON.stringify(memories, null, 2));
}

getMemory();
