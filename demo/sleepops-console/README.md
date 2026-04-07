# SleepOps Console Demo

Synthetic client demo app for the `.agency` workflow.

This codebase is intentionally small and self-contained. It models an internal operations dashboard for a smart-bed fleet team. The baseline app includes reconnecting devices in the incident queue, but it does **not** escalate devices that remain stuck in `reconnecting` for more than 15 minutes. That gap is the primary demo ticket for the Jira -> Confluence -> GitHub flow.

## Product Slice

### Pages

| Page | Description |
|------|-------------|
| **Incident Queue** | Fleet health dashboard with incident triage table, filtering, and escalation indicators |
| **Connectivity Health** | Network diagnostics with signal strength, packet loss, latency, and quality metrics |
| **Firmware Readiness** | Version tracking, update scheduling, and adoption rate monitoring |
| **Delivery Support** | Order tracking, setup progress, and new device activation flow |

### Features

- Summary cards for connected, reconnecting, offline, and open incidents
- Signal cards for operational metrics and support posture
- Filterable device queue (all, incidents only, by status)
- Escalation detection for devices stuck in `reconnecting` > 15 minutes
- Visual indicators (stuck badge, highlighted rows, action buttons)
- Mock device data with realistic states and regions

## Planned Demo Ticket

- **Title:** Beds stuck in reconnecting state are not escalated after 15 minutes
- **Expected future change:** add escalation logic, badge/indicator in the UI, and tests covering the threshold behavior

## Demo Story

The sidebar explicitly calls out the **"Active Workflow Gap"**:

> **Reconnect escalation is manual**  
> Beds stuck in reconnecting still appear in the queue, but they are not auto-escalated after 15 minutes.

This creates a clear before/after narrative for the `.agency` workflow demonstration:
1. **Before:** Manual escalation via button click (alert dialog)
2. **After:** Automated escalation based on 15-minute threshold

## Run

```bash
npm run demo:sleepops
```

Then open `http://localhost:4173`.

## Test

```bash
npm run test:demo:sleepops
```

## Test Coverage

- `device-health.test.mjs` - Unit tests for filtering, sorting, summarization, and XSS protection
- `server-smoke.test.mjs` - Server endpoint verification

## Tech Stack

- **Backend:** Vanilla Node.js HTTP server (no dependencies)
- **Frontend:** Vanilla JS ES modules, CSS with Sleep Number-adjacent branding
- **Data:** Static JSON mock data (6 devices)
