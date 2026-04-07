# Product Overview

## One-Line Description

`.agency` is a governed SDLC workflow layer for AI agents.

It lets teams run Product, Planning, Dev, QA, Review, Security, and Release work through a stable workflow contract instead of relying on prompt-by-prompt improvisation.

## Purpose

The purpose of `.agency` is to make AI-assisted delivery:

- structured
- reviewable
- portable across provider backends
- human-governed at the important steps

This is not just “agents connected to Jira.”

This is a workflow product with:

- one role model
- one evidence model
- one state machine
- multiple interchangeable adapters behind it

## The Problem It Solves

Raw agent SDLC setups tend to drift quickly.

Common failure modes:

- prompts depend on vendor-specific tools
- each role invents its own ticket/comment conventions
- approvals are implicit instead of governed
- QA/review/release evidence is inconsistent
- moving the same workflow to another tracker or docs provider requires prompt rewrites

`.agency` solves that by moving workflow semantics into the product itself.

## What It Gives A Team

- stable role prompts for Product, Planning, Developer, QA, Review, Security, and PM
- a provider-agnostic tool contract over Jira, Confluence, GitHub, Linear, and optional TMS systems
- a portable workflow state machine based on `ai-state:*` labels
- human approval gates, especially spec approval
- product-owned workflow helpers for governed transitions

## Core Capability Surface

Agents talk to `agency`, not directly to vendor tools as their primary interface.

The stable capability surface is:

- `tracker.*`
- `docs.*`
- `scm.*`
- `tms.*`
- `workflow.*`
- `plan.*`

That keeps prompts stable while adapters handle provider-specific details.

## How It Works

1. Product refines a rough backlog item and moves it to `ai-state:ready-for-plan`.
2. Planning creates or updates the implementation spec and structured execution plan, then moves the ticket to `ai-state:plan-review`.
3. A human approves the spec by changing `Spec Status` in the docs system.
4. PM Governance Sync applies that approval result back to the tracker labels.
5. Dev, QA, Review, optional Security, and PM Release continue the governed workflow.

## Human In The Loop

The system is intentionally not fully autonomous.

The expected operating model is:

1. an agent lists eligible work
2. a human selects the ticket
3. the agent prepares a proposed action
4. the human approves
5. the product applies the governed transition

This keeps agents useful without giving them silent control over critical workflow changes.

## Why It Is Better Than Raw Agent Automation

- prompts stay provider-agnostic
- workflow gates are product-owned, not just prompt text
- evidence is structured and inspectable
- humans approve the important steps
- the same operating model can be reused across different host repos and provider combinations

## Best Current Demo Story

For the current demo, the strongest path is Jira + Confluence:

- Jira is the tracker and workflow anchor
- Confluence is the spec and execution-plan home
- `Spec Status` is the human approval gate
- OpenCode agents operate through the local `agency` MCP

That path demonstrates the core value clearly:

- governed agent roles
- visible workflow state
- human approval
- portable tooling boundaries

## Who It Is For

Teams that want:

- AI agents to participate in SDLC work
- humans to remain in control of approvals
- workflow state to stay visible in existing systems of record
- a portable workflow layer that can survive backend changes
