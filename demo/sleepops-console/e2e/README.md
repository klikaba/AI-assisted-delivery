# SleepOps Playwright Specs

This directory is intentionally empty of automated tests.

The QA agent should create Playwright specs here based on the active Jira ticket and Confluence acceptance criteria.

Infrastructure notes:
- `npm run test:e2e:sleepops` is expected to pass even when this directory is empty.
- The Playwright web server uses a strict fixed port for deterministic QA runs.

Recommended first target:
- incident queue escalation behavior for `SCRUM-7`
