#!/bin/bash
# scripts/reset-demo.sh

echo "🔄 Resetting Demo Environment..."

# 1. Clean up local git state
# We do NOT hard reset to main because we might be running ON the demo branch.
# Instead, we just delete local feature branches.
git branch | grep "feature/" | xargs git branch -D 2>/dev/null || true

# 2. Reset Mock Memory
echo "🧠 Wiping Agency Memory..."
echo "[]" > platform-mock/memory.json

# 3. Reset Target Application
echo "🧹 Reverting demo-target/ code to current HEAD..."
git checkout HEAD -- demo-target/index.js demo-target/package.json demo-target/package-lock.json demo-target/playwright.config.js
rm -rf demo-target/tests

# 4. Install Dependencies
echo "📦 Installing fresh dependencies..."
cd demo-target 
npm ci
cd ..

echo "✅ Demo Reset Complete!"
echo "👉 Don't forget to manually archive/delete your Jira tickets and Confluence pages!"