# Real Demo Runbook: The Jira-Driven Workflow

**Goal:** Orchestrate a full SDLC flow for a "Rate Limiter" feature using the OpenCode TUI, demonstrating granular state transitions and strict governance.

---

## 🕹️ The Multi-Surface Experience
During this demo, keep three surfaces open:
1.  **OpenCode TUI:** Your "Cockpit" for interacting with agents.
2.  **Jira Board:** Your "Control Tower" (Watch the columns move!).
3.  **Confluence Spec:** Your "Library" (Where you perform the human approval).

---

## ⚠️ Critical Prerequisites
1.  **Jira Board:** Ensure your project has the 7 statuses mapped: `To Do`, `Selected for Development`, `In Planning`, `Waiting for Approval`, `In Progress`, `In QA`, `Done`.
2.  **Auth:** Ensure you have authorized the Atlassian MCP.
3.  **Seed Ticket:** Create one ticket in "To Do" with summary: "Add Health Check Endpoint".
4.  **Target App (for QA):** Ensure `demo-target/` is running on `http://localhost:3000` before Act 5.

---

## Act 1: Discovery (Product Owner)
*Surface: OpenCode TUI*

1.  **Select Agent:** Select **Product Owner Agent**.
2.  **Scan:** Agent finds the new ticket.
3.  **Refine:** Let the agent clarify the requirements. 
4.  **Transition:** Confirm the refinement.
5.  **👀 Check Jira:** Refresh your Jira Board. You will see the ticket has moved to **Selected for Development** and has the label `ai-state:ready-for-plan`.

---

## Act 2: Planning (Planner)
*Surface: OpenCode TUI*

1.  **Select Agent:** Select **Planning Agent**.
2.  **Action:** It will draft a technical spec and a JSON implementation plan.
3.  **Transition:** Confirm the generation.
4.  **👀 Check Jira:** The ticket has moved to **Waiting for Approval** (Label: `ai-state:plan-review`).
5.  **👀 Check Confluence:** A new Spec Page has appeared. It contains a "Page Properties" table with `Spec Status: DRAFT`.
6.  **👀 Check Jira:** A comment includes `Confluence Spec: <url>` for downstream agents.

> Optional: Select **Architecture Agent** to add diagrams and trade-offs to the Spec before approval.

---

## Act 3: Governance (Human + PM Sync)
*Surface: Confluence & TUI*

1.  **Human Action (Confluence):** Open the Spec Page. Click **Edit**. Change `Spec Status` to **APPROVED**. **Publish** the page.
2.  **Select Agent (TUI):** Select **Project Manager Agent**.
3.  **Mode:** Choose **Governance Sync** when prompted.
4.  **Sync:** The agent will scan Confluence, detect your approval, and update Jira.
5.  **👀 Check Jira:** You will see a comment: "✅ Governance Sync: Confluence Spec is APPROVED. Unlocking Development." (Label: `ai-state:approved`).

---

## Act 4: Implementation (Developer)
*Surface: OpenCode TUI*

1.  **Select Agent:** Select **Developer Agent**.
2.  **Gate Check:** The agent verifies the "Dual-Key" (Jira Label + Confluence Status).
3.  **Action:** It implements the code on a feature branch.
4.  **👀 Check Jira:** The ticket moves to **In Progress** while building, then to **In QA** once the PR is ready.

> Optional: Select **DevOps Engineer Agent** to check environment readiness (Playwright config, tooling, etc.).

---

## Act 5: Verification (QA)
*Surface: OpenCode TUI*

1.  **Select Agent:** Select **QA Engineer Agent**.
2.  **Action:** It runs Playwright tests.
3.  **Success:** If tests pass, it updates the Jira label to `ai-state:verified`.
4.  **👀 Check Jira:** Read the "QA Verification Report" comment.

> Note: Review and Security are label-based gates; the Jira Status stays **In QA** until release.

---

## Act 6: Code Review (Reviewer)
*Surface: OpenCode TUI*

1.  **Select Agent:** Select **Code Reviewer Agent**.
2.  **Action:** Review the diff and plan, then mark **PASS**.
3.  **👀 Check Jira:** The ticket gets label `ai-state:reviewed`.

---

## Act 7: Security Audit (Security)
*Surface: OpenCode TUI*

1.  **Select Agent:** Select **Security Engineer Agent**.
2.  **Action:** Audit the diff and spec, then mark **PASS**.
3.  **👀 Check Jira:** The ticket gets label `ai-state:security-pass`.

---

## Act 8: Release (PM)
*Surface: OpenCode TUI*

1.  **Select Agent:** Select **Project Manager Agent**.
2.  **Mode:** Choose **Release** when prompted.
3.  **Action:** "Release" the ticket once it has `ai-state:verified`, `ai-state:reviewed`, and `ai-state:security-pass`.
4.  **🏁 Check Jira:** The ticket moves to **Done**. Labels are cleared.

---

## ✅ Final Success
You have demonstrated a fully autonomous, governed, and transparent delivery pipeline.
