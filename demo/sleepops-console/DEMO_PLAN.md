# SleepOps Console Demo Plan

## Purpose

`sleepops-console/` is a synthetic internal operations product created for the Delivery OS client demo.

It is not meant to represent Sleep Number's real architecture, data model, or internal tooling. It is a controlled demo surface that is close enough to the smart-bed domain to make the workflow credible.

## Product Narrative

The app represents an internal support and fleet-operations console used by a smart-bed company.

Its job is to help operations teams answer questions like:

- Which beds are currently offline or reconnecting?
- Which incidents are affecting the nightly sleep experience?
- Which issues should be escalated to a higher-priority support queue?
- What is the current health of the enrolled device fleet?

This framing is useful because it maps naturally to Jira, Confluence, GitHub, QA, and release workflows.

## What The Current Baseline Does

The baseline app includes:

- a left-hand internal-tool navigation shell
- summary health cards
- operational signal cards
- a fleet incident queue
- mock smart-bed device data
- simple filtering by device state

The app is intentionally small so it can be built, changed, tested, and demoed quickly.

## Planned Demo Story

The primary workflow story is:

**Beds stuck in reconnecting state are visible but not escalated after 15 minutes.**

That is the deliberate product gap in the current baseline.

This makes the app suitable for demonstrating:

1. Jira ticket creation and backlog state
2. Planning via Delivery OS
3. Confluence spec generation and approval
4. Implementation in GitHub
5. QA verification
6. PR linkage and review evidence

## What The Future Change Should Add

The follow-up implementation should likely introduce:

- escalation logic for prolonged `reconnecting` devices
- a visible escalation indicator in the queue
- a stronger operational severity signal
- tests for the threshold rule

The point of the change is not technical complexity. The point is a clean before/after story that is easy to explain during the demo.

## Design Goal

The design should feel like an internal operations console that belongs in the same ecosystem as a premium smart-bed product.

That means:

- internal dashboard structure
- cleaner data presentation than a generic admin page
- Sleep Number-adjacent tone without copying the consumer UI
- enough visual polish that it feels intentional in front of a client

## Non-Goals

This app is not trying to simulate:

- real hardware integration
- real telemetry ingestion
- real customer sleep science
- real Sleep Number source code or internal systems
- a production-ready enterprise platform

## Success Criteria

This demo app is successful if a client can understand, in a few minutes:

- what the product problem is
- what the current gap is
- how Delivery OS turns that gap into a governed delivery workflow
- what changed in the code after the workflow runs
