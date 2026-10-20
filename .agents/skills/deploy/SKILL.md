---
name: deploy
description: Operate Tudo Macaé production delivery in GitHub Actions. Use when asked to prepare a release, deploy to production, or resume a production promotion.
---

# Deploy

Read [Production delivery](../../../docs/agents/production-delivery.md).
Inspect the latest run and current production state. Dispatch the workflow on main
when requested, wait for checks and verified deployment, and report the tested SHA
and run link. For failures, inspect the correction issue and run artifacts before
retrying or using the documented manual recovery command.
For GitHub Actions polling, follow [Compact run monitoring](../../../docs/agents/production-delivery.md#compact-run-monitoring).

Before dispatch, always offer to run the repository's full local verification,
including complete E2E. When the user accepts, resolve the applicable non-mutation
checks through `npm run help` and dispatch only after they pass; otherwise report the
blocking results. Local verification supplements the workflow's checks; E2E runs only
through explicit local/manual execution, as defined in Production delivery.
The optional full-suite offer does not replace the affected-journey verification
required during implementation by [Test Selection](../../../docs/agents/test-selection.md).

Use the user's existing authorization. Report missing access or configuration and
the last verified step; invoking this skill alone does not authorize production.
