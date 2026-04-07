# Demo Workspace

This `demo/` directory exists to hold synthetic client-demo assets that are intentionally separate from the `.agency` product code.

The goal is not to model a real client codebase. The goal is to create a credible, self-contained application that lets us demonstrate the `.agency` workflow end to end using our own Jira, Confluence, and GitHub infrastructure.

## Why This Exists

For the current Sleep Number-facing demo, we do not have access to the client's actual repository or internal systems in time for preparation. Instead of pretending otherwise, we use a controlled synthetic product slice that is:

- domain-relevant to connected smart-bed operations
- safe to show publicly
- small enough to build and change quickly
- realistic enough to make the Jira -> Confluence -> GitHub workflow feel legitimate

## What We Are Aiming For

The demo should prove that `.agency` can orchestrate a governed software delivery flow, not that we have access to a specific client environment.

The target outcome is:

1. Start from a believable product or ops scenario.
2. Represent the work as a Jira ticket.
3. Generate and approve a Confluence spec.
4. Implement the change in a GitHub repo.
5. Verify the change through tests and QA.
6. Show the evidence chain across planning, approval, implementation, and review.

## Current Demo App

`sleepops-console/` is the current synthetic app for this purpose.

It is an internal operations dashboard for a smart-bed fleet team. The baseline app intentionally contains a plausible workflow gap:

- devices stuck in `reconnecting` are visible in the queue
- they are **not** automatically escalated after 15 minutes

That gap is useful because it creates a clean demo story for:

- backlog refinement
- spec generation
- approval gating
- implementation
- QA verification
- PR creation and linkage

## Design Direction

The design should feel adjacent to the Sleep Number ecosystem without copying the consumer product directly.

That means:

- internal tool structure, not marketing-page composition
- brand-adjacent palette and tone, not literal imitation
- support, connectivity, and sleep-tech language
- clear operational hierarchy so the demo reads as a real internal console

## Guardrails

Everything under `demo/` should stay isolated from the core `.agency` implementation.

Use this directory for:

- synthetic applications
- mock data
- demo-only documentation
- assets used for client presentations

Do not use it for:

- production `.agency` source changes
- core platform prompts or workflow logic
- customer-specific confidential material

## Success Criteria

This demo workspace is successful if it helps us tell a clear story:

"Here is a realistic product problem, here is how `.agency` turns that problem into a governed delivery flow, and here is the resulting code and evidence."
