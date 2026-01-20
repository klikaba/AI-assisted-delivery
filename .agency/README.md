# Virtual Engineering Team (Shared Configuration)

This repository contains the shared intelligence, roles, and rules for our AI workforce. It is designed to be installed as a submodule in any project.

## 📦 Installation (Git Submodule)

To add this AI workforce to your project, run this from your project root:

```bash
# 1. Add the submodule (creates the .agency folder)
git submodule add <THIS_REPO_URL> .agency

# 2. Initialize it
git submodule update --init --recursive
```

## 🚀 Usage

### 1. Initial Setup (Run Once)
After adding the submodule, run the setup wizard to configure the agents for your specific project (language, testing framework, etc.):

```bash
./.agency/setup.sh
```

### 2. Start the Agents
Launch the AI Workforce:

```bash
opencode --config .agency/opencode.jsonc
```

## 🔄 How to Update

To pull the latest prompts and agency rules from the central repository:

```bash
git submodule update --remote .agency
```

## 🛠️ Customization

This system uses a **Split Architecture** to separate shared corporate policy from project-specific needs.

### 1. Global Rules (Shared)
- **File:** `.agency/rules.md` (Inside this folder)
- **Purpose:** Corporate standards shared by ALL projects using this submodule.
- **Update:** Commit changes here to propagate them to all teams.

### 2. Local Rules (Project Specific)
- **File:** `.agency-rules.md` (Create this in your project root)
- **Purpose:** Specific technologies or exceptions for *this* project (e.g., "Use Tabs", "Use Pytest").
- **Note:** This file is gitignored by default so it doesn't conflict with other users, but you can track it if you wish.

### 3. Memory (State)
- **File:** `.agency-memory.json` (Auto-generated in project root)
- **Purpose:** Stores the AI's long-term memory for this specific project.
- **Note:** This is strictly local and gitignored.
