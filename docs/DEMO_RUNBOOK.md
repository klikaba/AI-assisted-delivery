# Demo Runbook

## Recommended Demo Path

The strongest current demo path is Jira + Confluence with `scm.provider="none"`.

Why:

- it shows the core value of the workflow layer clearly
- it avoids over-claiming PR/deployment automation
- it keeps the human approval gate visible

## Demo Narrative

Use this story:

1. Product refines a rough backlog ticket.
2. Planning turns it into a real implementation spec and execution plan.
3. A human approves the spec in Confluence.
4. PM syncs that approval back into Jira labels.
5. Dev, QA, Review, and PM Release move the work through governed stages.

In the current product shape:

- Product completion is governed through `workflow.product_refine`
- Planning completion is governed through `workflow.plan_finalize`
- Development completion is governed through `workflow.dev_finalize`

## Preconditions

Before the demo:

- `./.agency/bin/agency doctor` passes
- Jira access works
- Confluence read/write works
- the target ticket is in the correct starting state
- OpenCode is started with the generated config you intend to demo

For the current SleepOps demo:

- use `SCRUM-7` as the hero ticket
- use Jira as the workflow anchor
- use Confluence as the spec and execution-plan home

## Ticket Start States

### Product Owner Start

Expected ticket state:

- Jira status: `To Do`
- no `ai-state:*` labels
- rough but understandable title/description
- no `Spec: <id> <url>` comment
- no execution-plan artifact yet
- no `QA:` / `Review:` / `Security:` markers

### Planning Start

Expected ticket state:

- Jira status: `Selected For Development`
- label: `ai-state:ready-for-plan`
- no linked spec yet, or one draft spec you intentionally want to revise

## Operator Script

1. Start OpenCode:
   - `opencode --config opencode.jsonc`
2. Run **Product Owner Agent**:
   - say `init`
   - select the backlog ticket
   - approve the refinement
3. Run **Planning Agent**:
   - say `init`
   - select the planning-ready ticket
   - approve spec + execution-plan creation
4. Open the linked Confluence spec page.
5. Change `Spec Status` from `DRAFT` to `APPROVED`.
6. Run **Project Manager Agent** in Governance Sync mode:
   - approve the sync
7. Run **Developer Agent**:
   - approve implementation
8. Run **QA Engineer Agent**:
   - approve test generation/execution
9. Run **Code Reviewer Agent**:
   - approve review decision
10. Run **Project Manager Agent** in Release mode:
   - approve release closure

## Confluence Approval Step

The current approval model is intentionally simple:

- open the spec page
- edit the top `Approval Gate`
- change `Spec Status` to `APPROVED` or `CHANGES REQUESTED`
- publish the page

PM Governance Sync then reads that status and applies the correct Jira label transition.

## What To Emphasize In The Demo

- the agents use one stable workflow contract
- humans stay in control of important decisions
- Jira remains the workflow anchor
- Confluence remains the source of truth for the spec
- workflow state is visible through labels, not hidden in prompts
- the most fragile stage completions are now moving behind product-owned workflow helpers

## What Not To Overclaim

- do not describe this as fully autonomous SDLC
- do not imply GitHub/PR automation if `scm.provider="none"`
- do not imply native Confluence approval workflows; the current approval gate is `Spec Status` in page content

## Common Failure Points

- wrong ticket start state
- missing or stale `Spec: <id> <url>` comment
- spec approved in Confluence but PM sync not yet run
- operator opens the wrong Confluence page
- extra permission prompts in OpenCode slowing the flow
