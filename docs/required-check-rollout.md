# Required-check and merge-queue rollout readiness

Evidence snapshot: 2026-11-16 UTC. Owner: Keel. Tracking: [issue 98](https://github.com/Living-Proof-Labs/.github/issues/98).

This ledger records readiness, not executable enrollment policy or apply authority.
The sole scope source is [canonical inventory](../config/github/repositories.json),
read at `272e907fd059b6f2e8619f891f057257b71e6482`. The table below was produced
by iterating its entries in order, cloning each default branch, recording `HEAD`,
and reading every `.github/workflows/*.yml` and `*.yaml` at that revision.
It is a dated evidence projection, not a second registry. Refresh from the inventory;
a new or missing entry is **unassessed**, never silently excluded or considered ready.

## Completed pilot, incomplete fleet

Only `.github` is enrolled and verified. [Apply and strict readback evidence](https://github.com/Living-Proof-Labs/.github/issues/108#issuecomment-6906158990)
records run [43794530229](https://github.com/Living-Proof-Labs/.github/actions/runs/43794530229)
on `d7f06e1711d62ecf35bd6593bb62d5005920f606`: one ruleset PUT, other 19 unchanged,
then 20 compliant with zero remaining changes/failures. This is compliance with
the enrolled policy, not proof all 20 require checks. Four manual observations
remain unverified: archive-program inclusion, Git LFS archive inclusion,
ref-update limit, and linked-issue autoclose.

[Vera's final queue-trial PASS](https://github.com/Living-Proof-Labs/.github/issues/102#issuecomment-6907470862)
records real queued merges #106 and #109. Runs
[43801525273](https://github.com/Living-Proof-Labs/.github/actions/runs/43801525273)
and [43801526861](https://github.com/Living-Proof-Labs/.github/actions/runs/43801526861)
passed `Repository verification gate` from App `15368` on queue SHAs
`d781d6565622b2b661caedc511a931c413e7d35d` and
`272e907fd059b6f2e8619f891f057257b71e6482`. The latter's main audit
[43801706065](https://github.com/Living-Proof-Labs/.github/actions/runs/43801706065)
passed. These are linked retained review findings; this ledger refresh did not
repeat a live apply or queue trial. Old preview plans are superseded and must
never be reused for rollout.

## Inventory-derived source ledger

Only `.github/verify.yml` declares `merge_group` in this snapshot. All other rows
are **blocked: queue trigger absent**, with producer/complete contract/queue behavior
unverified unless separately evidenced below. A successful push check alone is
not readiness. Revision links expose all workflow files inspected.

| Repository | Batch | Exact default-branch revision / workflows | Readiness |
| --- | --- | --- | --- |
| `.github` | Pilot | [272e907fd059b6f2e8619f891f057257b71e6482](https://github.com/Living-Proof-Labs/.github/tree/272e907fd059b6f2e8619f891f057257b71e6482/.github/workflows) | Verified pilot |
| `capability-verifier` | A | [1e1330a5671db081b786767d35013880b26a1720](https://github.com/Living-Proof-Labs/capability-verifier/tree/1e1330a5671db081b786767d35013880b26a1720/.github/workflows) | Blocked; no merge_group |
| `collaboration-guidelines` | C | [f98c2864d53585dc53ce7744c441f4593fb48f83](https://github.com/Living-Proof-Labs/collaboration-guidelines/tree/f98c2864d53585dc53ce7744c441f4593fb48f83/.github/workflows) | Blocked; no merge_group |
| `living-proof-labs.github.io` | C | [cd339643f206770be0c1af25a7199aac4f2b4739](https://github.com/Living-Proof-Labs/living-proof-labs.github.io/tree/cd339643f206770be0c1af25a7199aac4f2b4739/.github/workflows) | Blocked; no merge_group |
| `livingproof` | B | [934f82e065f89d17d0c06c7074f4d8b968ea711c](https://github.com/Living-Proof-Labs/livingproof/tree/934f82e065f89d17d0c06c7074f4d8b968ea711c/.github/workflows) | Blocked; no merge_group |
| `livingproof-booster-t1` | B | [8da4ee58745163ed0aca6e217ba5aa61430556a6](https://github.com/Living-Proof-Labs/livingproof-booster-t1/tree/8da4ee58745163ed0aca6e217ba5aa61430556a6/.github/workflows) | Blocked; no merge_group |
| `livingproof-capability-report` | B | [d1666e1c01a14166d2ece9a51b6a9d29994f4d9a](https://github.com/Living-Proof-Labs/livingproof-capability-report/tree/d1666e1c01a14166d2ece9a51b6a9d29994f4d9a/.github/workflows) | Blocked; no merge_group |
| `livingproof-common` | B | [81871cb2367575e17cf0e5d7098653dd0104a4a4](https://github.com/Living-Proof-Labs/livingproof-common/tree/81871cb2367575e17cf0e5d7098653dd0104a4a4/.github/workflows) | Blocked; no merge_group |
| `livingproof-evaluator` | B | [51a14a200c4477da359ab78403012f6479e1d277](https://github.com/Living-Proof-Labs/livingproof-evaluator/tree/51a14a200c4477da359ab78403012f6479e1d277/.github/workflows) | Blocked; no merge_group |
| `livingproof-evaluator-run` | C | [1deba5bc9250fc8534b386481de4203327200607](https://github.com/Living-Proof-Labs/livingproof-evaluator-run/tree/1deba5bc9250fc8534b386481de4203327200607/.github/workflows) | Blocked; no merge_group |
| `livingproof-evaluator-scenario` | B | [287f6ae3155e2bc8eb8a5490ad8dbb17b6787413](https://github.com/Living-Proof-Labs/livingproof-evaluator-scenario/tree/287f6ae3155e2bc8eb8a5490ad8dbb17b6787413/.github/workflows) | Blocked; no merge_group |
| `livingproof-sim-gazebo` | A | [f2ed3e8800ff29ee45d64158872e7abd8e873659](https://github.com/Living-Proof-Labs/livingproof-sim-gazebo/tree/f2ed3e8800ff29ee45d64158872e7abd8e873659/.github/workflows) | Blocked; no merge_group |
| `livingproof-sim-mujoco` | A | [7331df1c6adcafaa1bca16efb3ec3c17083d6301](https://github.com/Living-Proof-Labs/livingproof-sim-mujoco/tree/7331df1c6adcafaa1bca16efb3ec3c17083d6301/.github/workflows) | Blocked; no merge_group |
| `livingproof-unitree-g1` | B | [dcfcf27e3803d83ebc7f1030ddbd99edf52a8a73](https://github.com/Living-Proof-Labs/livingproof-unitree-g1/tree/dcfcf27e3803d83ebc7f1030ddbd99edf52a8a73/.github/workflows) | Blocked; no merge_group |
| `livingproof-unitree-go1` | B | [7a375c39ee51dfb77b27d6a92f51a7af89f124b7](https://github.com/Living-Proof-Labs/livingproof-unitree-go1/tree/7a375c39ee51dfb77b27d6a92f51a7af89f124b7/.github/workflows) | Blocked; no merge_group |
| `livingproof-verification` | C | [c4be9a8898d0dbe615d0200a4d23c678b9ba583a](https://github.com/Living-Proof-Labs/livingproof-verification/tree/c4be9a8898d0dbe615d0200a4d23c678b9ba583a/.github/workflows) | Blocked; no merge_group |
| `livingproof-worlds` | A | [29484d3cdbcbc31d9a6b931c03acd13607f6b5c9](https://github.com/Living-Proof-Labs/livingproof-worlds/tree/29484d3cdbcbc31d9a6b931c03acd13607f6b5c9/.github/workflows) | Blocked; no merge_group |
| `robot-capability-specs` | A | [c3662d50376ef14f2e9c8eea09e7940bea923dbf](https://github.com/Living-Proof-Labs/robot-capability-specs/tree/c3662d50376ef14f2e9c8eea09e7940bea923dbf/.github/workflows) | Blocked; no merge_group |
| `unitree-foxglove-sdk` | D | [2afda1bbad7c9c2f549e7cfca16ad6c1012262a3](https://github.com/Living-Proof-Labs/unitree-foxglove-sdk/tree/2afda1bbad7c9c2f549e7cfca16ad6c1012262a3/.github/workflows) | Blocked; no merge_group |
| `website` | C | [12cef24c9ae60ae54a534e8111f0ee04117a8c0c](https://github.com/Living-Proof-Labs/website/tree/12cef24c9ae60ae54a534e8111f0ee04117a8c0c/.github/workflows) | Blocked; no merge_group |

## Batch A: candidates, not approved required contexts

Checks below were read from the paginated Checks API at each exact source revision
above. Names and producer IDs are observed on main/push evidence; no Batch A
queue check or future aggregate name/producer has been verified. An omitted
result or unfinished run is not success. Recheck real PR and queue evidence after
local changes; App binding alone does not distinguish workflows with the same name.

### capability-verifier

Candidate coverage is `verify`, **both amd64 and arm64** `report` legs, `report-results`, `documentation`, and both `hallway-image-pr` matrix legs. That last job currently requires `event_name == pull_request`, so merely adding a queue trigger silently skips image testing. Include matrix completeness and missing artifact checks, not only a successful dependency aggregate. The `verify`, `report`, `report-results` and `documentation` checkouts use PR-head SHA with `github.sha` fallback. In contrast, the [hallway-image-pr checkout at this revision](https://github.com/Living-Proof-Labs/capability-verifier/blob/1e1330a5671db081b786767d35013880b26a1720/.github/workflows/verify.yml#L547) sets `ref` only to `github.event.pull_request.head.sha`, without a fallback. Its queue adoption must explicitly select the merge-group SHA as well as broaden the job condition; verify both architecture legs check out that SHA. The separate livingproof-verification checkout in this job remains bound to the image lock commit, not the queue SHA. Existing artifact names using PR-head SHA with `github.sha` fallback do not prove that this checkout is queue-safe. No workflow-wide concurrency is declared. Keep release, registry image publishing and documentation deployment out of queue runs. The reusable scenario/walk-hallway workflows are not the repository's required verification contract: capability FAIL is data, while infrastructure/reproducibility failures remain failures. Do not convert expected fixture FAIL verdicts into pipeline failures.

Observed candidate checks (App `15368` for every linked row):

- [`report-results`](https://github.com/Living-Proof-Labs/capability-verifier/actions/runs/43813097387/job/133119886410): success; check `133119886410`.
- [`report (amd64, ubuntu-24.04)`](https://github.com/Living-Proof-Labs/capability-verifier/actions/runs/43813097387/job/133119683723): success; check `133119683723`.
- [`report (arm64, ubuntu-24.04-arm)`](https://github.com/Living-Proof-Labs/capability-verifier/actions/runs/43813097387/job/133119683679): success; check `133119683679`.
- [`documentation`](https://github.com/Living-Proof-Labs/capability-verifier/actions/runs/43813097387/job/133118933056): success; check `133118933056`.
- [`verify`](https://github.com/Living-Proof-Labs/capability-verifier/actions/runs/43813097387/job/133118932900): success; check `133118932900`.

Existing open PRs at inspection: [#108](https://github.com/Living-Proof-Labs/capability-verifier/pull/108), [#107](https://github.com/Living-Proof-Labs/capability-verifier/pull/107). These were dependency updates, not evidence of queue readiness. Rivet must reconcile newer work before implementation.

### livingproof-sim-mujoco

Candidate coverage is `verify` (development container, tests, docs, package and smoke) plus an explicitly reviewed `publish-tests` contract. Publication skips fork PRs; queue runs are non-PR under the current condition. A Checks API warning is not proof a custom check was published, so do not require that custom context without guaranteed emission. Documentation steps have artifact-presence conditions: require evidence completeness when applicable. Checkout/provenance use PR-head SHA with `github.sha` fallback. No workflow-wide concurrency; Pages has its own lock. Keep deploy-docs, release and draft assembly off queue events. This revision's verify check was unfinished at observation; no pass claimed.

Observed candidate checks (App `15368` for every linked row):

- [`verify`](https://github.com/Living-Proof-Labs/livingproof-sim-mujoco/actions/runs/43812894302/job/133118293270): unfinished; conclusion absent; check `133118293270`.

Existing open PRs at inspection: [#60](https://github.com/Living-Proof-Labs/livingproof-sim-mujoco/pull/60), [#58](https://github.com/Living-Proof-Labs/livingproof-sim-mujoco/pull/58), [#57](https://github.com/Living-Proof-Labs/livingproof-sim-mujoco/pull/57). These were dependency updates, not evidence of queue readiness. Rivet must reconcile newer work before implementation.

### livingproof-sim-gazebo

Candidate coverage is `verify` (development container, tests, docs, package and smoke), with a defined `publish-tests` requirement/skip policy for fork PRs and queue events. The workflow uses `gazebo-verification-${{ github.ref }}` with cancellation disabled; preserve queue-ref isolation. Checkout uses the event default: verify actual queue SHA. Deployment is push/main-only. Reporter failure/missing output must remain visible; do not require a legitimately skipped fork publication job or infer completeness from a skipped result.

Observed candidate checks (App `15368` for every linked row):

- [`verify`](https://github.com/Living-Proof-Labs/livingproof-sim-gazebo/actions/runs/43812884392/job/133118261894): success; check `133118261894`.

Existing open PRs at inspection: [#16](https://github.com/Living-Proof-Labs/livingproof-sim-gazebo/pull/16), [#15](https://github.com/Living-Proof-Labs/livingproof-sim-gazebo/pull/15). These were dependency updates, not evidence of queue readiness. Rivet must reconcile newer work before implementation.

### livingproof-worlds

Candidate coverage spans `verify.yml` job `verify` **and** `manual.yml` job `build`. Both workflows need queue coverage; requiring only verify omits manual validation and publication-completeness checks. A cross-workflow aggregate needs explicit complete evidence for the same SHA, or require a reviewed unique complete set. Both checkouts fall back from PR head to `github.sha`. No verification-wide concurrency is declared; the deployment lock is separate. Keep release and Pages deployment excluded; manual deployment currently requires a non-PR event and main ref, which must be tested for queue events.

Observed candidate checks (App `15368` for every linked row):

- [`verify`](https://github.com/Living-Proof-Labs/livingproof-worlds/actions/runs/43807518425/job/133101562264): success; check `133101562264`.
- [`build`](https://github.com/Living-Proof-Labs/livingproof-worlds/actions/runs/43807518253/job/133101561989): success; check `133101561989`.

Existing open PRs at inspection: [#20](https://github.com/Living-Proof-Labs/livingproof-worlds/pull/20), [#19](https://github.com/Living-Proof-Labs/livingproof-worlds/pull/19). These were dependency updates, not evidence of queue readiness. Rivet must reconcile newer work before implementation.

### robot-capability-specs

Continue [existing issue 44](https://github.com/Living-Proof-Labs/robot-capability-specs/issues/44), do not duplicate it. `verify.yml` covers manifests, catalog/manual expectations, preview and complete result publication. **Two workflows emit `verify` at this revision** (verification and release); choose an unambiguous gate/context before enrollment. App 15368 alone cannot disambiguate them. Checkout/artifact naming falls back to `github.sha`; PR-title preview falls back to `chore: branch preview`, which requires explicit queue semantics. No verify concurrency is declared. Pages/release workflows must stay outside queue events; do not require their main-only build/deploy jobs.

Observed candidate checks (App `15368` for every linked row):

- [`verify`](https://github.com/Living-Proof-Labs/robot-capability-specs/actions/runs/43812913996/job/133118354339): success; check `133118354339`.
- [`build`](https://github.com/Living-Proof-Labs/robot-capability-specs/actions/runs/43812913636/job/133118352805): success; check `133118352805`.
- [`verify`](https://github.com/Living-Proof-Labs/robot-capability-specs/actions/runs/43812913631/job/133118352453): success; check `133118352453`.

Existing open PRs at inspection: [#56](https://github.com/Living-Proof-Labs/robot-capability-specs/pull/56), [#53](https://github.com/Living-Proof-Labs/robot-capability-specs/pull/53). These were dependency updates, not evidence of queue readiness. Rivet must reconcile newer work before implementation.

## Remaining batches and prerequisites

Batch membership is recorded in the inventory-derived table, following the
[coordination plan](https://github.com/Living-Proof-Labs/.github/issues/98#issuecomment-6907918290).

- **B — matrix/package verification:** establish all architectures, reusable-workflow jobs and packaging checks in the complete contract; retain per-leg evidence, cancellation/timeout/missing-leg tests and publishing separation. Exact context/producer and cost/runtime assessment remain unverified here.
- **C — multiple workflows and sites:** define read-only PR/queue checks independently of publish/deploy. `website` currently has only deploy/release workflow files, without a dedicated PR validation workflow. `livingproof-verification/checks.yml` needs review of PR-number concurrency and PR-head SHA assumptions; do not gate its robot-verdict/deployment pipeline wholesale. Exact complete contexts/producers remain unverified.
- **D — explicit special contract:** `unitree-foxglove-sdk` requires separation of unit/lint health from documented unstable locomotion capability outcomes. Rivet must obtain the precise blocking-evidence contract; no silent exclusion or weakened verdict semantics. Queue behavior and trusted context remain unverified.

## Exit criteria and ownership

Keel owns this ledger, policy enrollment and protected preview/apply coordination.
Rivet coordinates repository-local implementation and independent review through
[the existing request](https://github.com/Living-Proof-Labs/.github/issues/98#issuecomment-6907918290).
At this snapshot that issue has no Rivet reply; local work acceptance and linked
implementation PRs are pending. Do not assign parallel implementation directly
to other team members. The issue assignee and project Owner are distinct fields;
this document does not claim to update project fields.

For each repository, retain these stages separately:

1. **Contract reviewed:** list all applicable jobs and matrix legs, required artifacts, exact expected skips by event, robot-verdict semantics, checkout SHA, concurrency and publishing boundaries. Choose unique trusted check contexts or a complete always-running gate; record real check name, App ID, SHA and URL. Unknown evidence blocks readiness.
2. **Local change verified/merged:** support `pull_request` and `merge_group`; exercise missing, failed, cancelled, timed-out and unexpectedly skipped work. Check artifact/test publication completeness and legitimate skip cases. Every queue test uses the merge-group SHA; no release, deployment or external PR-comment side effect. Link exact-head CI and independent review through Rivet. Queue-event behavior remains unverified until observed.
3. **Policy reviewed:** enroll only ready entries in a separate independently reviewed `.github` PR. Preserve extra existing checks, stronger rules/reviews, branch coverage and bypass boundaries. Queue enrollment uses compatible non-strict branch updates and creation enforcement; do not weaken non-queue protections. No policy change is made by this ledger.
4. **Plan approved/applied:** obtain a fresh trusted-main all-inventory preview and compare every action and unresolved result to precise approved scope. Retain source, policy, implementation and inventory bindings. Aaron's action-time approval and protected environment approval are separate requirements; pilot approval covers no additional repository. Stop on extra/unresolved changes. Never reuse old previews or broaden credentials.
5. **Enforcement and trial proven:** retain actual live ruleset readback plus full-inventory strict readback, then a real queue merge with exact merge-group SHA/check producer and postmerge audit. Do not label a policy merge or green baseline audit fleet completion. Keep issue 98 open until every inventory entry reaches this stage or Aaron approves an explicit documented exception.

Refresh this snapshot from the canonical inventory when source revisions or local
work changes. Record the observation date and new evidence; invalidate readiness
when the contract changes. Reconcile inventory additions/removals before choosing
a batch. Renovate preset adoption in issue 103 is related but does not enable queues.
