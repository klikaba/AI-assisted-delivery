#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// CONFIG: Read-Only (From the .agency submodule)
const GLOBAL_RULES_FILE = path.join(__dirname, '../rules.md');

// STATE: Read-Write (Local to this specific project)
const LOCAL_MEMORY_FILE = path.join(process.cwd(), '.agency-memory.json');
const LOCAL_RULES_FILE = path.join(process.cwd(), '.agency-rules.md');

// SEED DATA (Generic)
const SEED_MEMORY = [
  {
    "scope": "security",
    "fact": "Never commit secrets or tokens; flag hard-coded credentials in code, logs, or comments."
  }
];

function init() {
  if (!fs.existsSync(LOCAL_MEMORY_FILE) || fs.readFileSync(LOCAL_MEMORY_FILE, 'utf8').trim() === '[]') {
    fs.writeFileSync(LOCAL_MEMORY_FILE, JSON.stringify(SEED_MEMORY, null, 2));
  }
}

function getMemory() {
  init();
  let memories = [];
  
  // 1. Load Persistent Memory (From Local Root)
  try {
    memories = JSON.parse(fs.readFileSync(LOCAL_MEMORY_FILE, 'utf8'));
  } catch (e) {
    console.error("Error reading .agency-memory.json", e);
  }

  // 2. Load Global Shared Rules (From Submodule)
  if (fs.existsSync(GLOBAL_RULES_FILE)) {
    const globalRules = fs.readFileSync(GLOBAL_RULES_FILE, 'utf8');
    memories.push({
      scope: "global-policy",
      fact: `[SHARED CORPORATE STANDARDS]:\n${globalRules}`
    });
  }

  // 3. Load Local Project Rules (From Root)
  if (fs.existsSync(LOCAL_RULES_FILE)) {
    const localRules = fs.readFileSync(LOCAL_RULES_FILE, 'utf8');
    memories.push({
      scope: "local-project",
      fact: `[PROJECT SPECIFIC RULES]:\n${localRules}`
    });
  }

  console.log("=== AGENCY MEMORY (CONTEXT ENGINE) ===");
  console.log(JSON.stringify(memories, null, 2));
}

getMemory();
