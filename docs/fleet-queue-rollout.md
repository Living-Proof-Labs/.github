# Fleet merge-queue rollout

Tracking: [issue 98](https://github.com/Living-Proof-Labs/.github/issues/98).
Owner: Keel; In Progress. This source proposal implements Aaron's 2026-11-16
instruction to enable queues everywhere, with non-required checks informational.
The [canonical inventory](../config/github/repositories.json) is the sole scope
registry. Tests compare the queue-map keys against that inventory exactly.

## Exact proposed scope

Keep the existing `.github` required context `Repository verification gate`,
App `15368`, non-strict updates and creation enforcement unchanged. Add no
required context on any other repository. Every queue uses the existing pilot
parameters: `MERGE`, `ALLGREEN`, timeout 60 minutes, maximum build/merge 5,
minimum group/wait 0. Expected live difference from the verified pilot is one
ruleset update adding `merge_queue` in each of the other 19 repositories.
No Pages, general settings, credentials, permissions, review requirements,
bypass actors or existing check names are intentionally changed.

The [pilot apply/readback](https://github.com/Living-Proof-Labs/.github/issues/108#issuecomment-6906158990)
and [queue trial evidence](https://github.com/Living-Proof-Labs/.github/issues/102#issuecomment-6907470862)
remain evidence only for `.github`. The current inherited-inclusive ruleset scan
reported by the coordinator found the other 19 PR-only; the fresh protected
preview must independently establish the actual complete state. This PR's
mocked pilot-to-fleet plan is not a live preview or apply authorization.

## Required contracts, informational work

[GitHub queues](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)
use required checks. Queue-only enrollment without required contexts does not
establish complete testing of combined changes. Do not describe it as fleet
required-check enforcement or turn robot capability verdicts into mandatory
pipeline failures. Informational checks need not be successful or complete for
queue approval under Aaron's clarified policy.

For any actual selected or existing required check, Rivet coordinates the local
workflow change and review: applicable `merge_group` trigger, exact queue SHA,
correct event-specific skips/concurrency and no release/deploy side effects.
The `.github` selected gate already has verified queue coverage. The other 19
have no selected contract in this policy; no invented aggregate gate is added.
Rivet must reconcile newer local work and any branch/inherited required contract
not visible in the recorded scan before application. Existing stronger rules
are preserved, never silently replaced to satisfy this rollout. Conflicts or
unknown evidence block affected application and require explicit resolution.

The older [readiness ledger proposal #111](https://github.com/Living-Proof-Labs/.github/pull/111)
records candidate workflow hazards and dated source revisions. Its candidates
are not approved required checks. Its all-candidate readiness prerequisites must
not be treated as blockers to this queue-only enrollment. Further required-check
adoption remains separate work under issue 98, including robot-capability-specs#44.
Rivet is the sole repository-local coordination route; do not duplicate team work.
The separate collaboration-guidelines#89 automerge proposal need not wait here.

## Review and apply boundary

1. Review policy and mocked full-inventory tests; reconcile independent review
   and required checks before merging through `.github`'s normal queue.
2. From the merged trusted source, run a **new protected read-only preview**.
   Retain its source, policy, implementation and inventory bindings, every
   repository result and every proposed action. Never reuse a pilot plan.
3. Compare with the expected 19 queue-only updates. Disclose additional actions,
   newly observed required checks, strict-check incompatibility, stronger existing
   queues, and unknown/unresolved evidence. Resolve material differences; do not
   silently broaden the approved scope or remove existing protections.
4. Show Aaron the exact resulting plan and obtain confirmation immediately before
   live application, plus the required protected-environment approval. The broad
   rollout direction is not a substitute for that exact-plan confirmation.
5. Apply only that saved plan through the existing protected controller; retain
   strict full-inventory readback and actual queue trials. Report settings
   enforcement separately from which tests are required and from robot outcomes.

All-inventory planning can expose unrelated drift. It remains outside intended
scope until specifically approved. Manual-only observations remain unverified.
Queue support/API acceptance on the other repositories and their actual first
queue behavior are unverified until application/readback/trial. This proposal
changes no controller or workflow and does not dispatch an apply.
