# Fleet queue delivery and historical required-check candidates

Delivery verified: 2026-11-16 UTC. Historical workflow scan: earlier that day. Owner: Keel. Tracking: [issue 98](https://github.com/Living-Proof-Labs/.github/issues/98).

This ledger records readiness, not executable enrollment policy or apply authority.
The sole scope source is [canonical inventory](../config/github/repositories.json),
read at `272e907fd059b6f2e8619f891f057257b71e6482`. The table below was produced
by iterating its entries in order, cloning each default branch, recording `HEAD`,
and reading every `.github/workflows/*.yml` and `*.yaml` at that revision.
It is a dated evidence projection, not a second registry. Refresh from the inventory;
a new or missing entry is **unassessed**, never silently excluded or considered ready.

## Delivered fleet queues

[Apply run 43829155236](https://github.com/Living-Proof-Labs/.github/actions/runs/43829155236)
completed successfully on trusted source `887d4788421aec3bb5f33447c1a8e479acd0e359`.
It added only a merge-queue rule to each of the other 19 repositories; `.github`
remained unchanged. Apply and strict readback each verified all 20 canonical
repositories with zero failures; final readback had zero remaining changes.
[Results artifact 14208036773](https://github.com/Living-Proof-Labs/.github/actions/runs/43829155236/artifacts/14208036773)
has ZIP SHA256 `ca1778e27b3b6d412552148e9f7e9eedceed24dfda2802a9f87dead9ba00854b`.
Independent live GETs matched the planned rules, conditions and bypass lists on
all 20 active rulesets. Fleet queue settings are delivered and verified.

The preceding [classic-protection collection 43828994015](https://github.com/Living-Proof-Labs/.github/actions/runs/43828994015)
reported complete evidence for all 20 default branches, with no classic branch
protections or classic required contexts at collection time. This does not mean
ruleset protection is absent. The only selected required-check contract remains
`.github`'s `Repository verification gate`, App `15368`. No new required checks
were added elsewhere; informational checks remain informational.

Real queue trials on the newly enrolled 19 repositories remain unverified here;
settings enforcement does not establish fleet required-test coverage or robot
capability success. Four manual observation categories remain unverified:
archive-program inclusion, Git LFS archive inclusion, ref-update limit and
linked-issue autoclose. No further settings changes are authorized by this ledger.

## Historical pilot evidence

The earlier [pilot apply 43794530229](https://github.com/Living-Proof-Labs/.github/actions/runs/43794530229)
changed only `.github`; its then-unchanged other 19 repositories were subsequently
enrolled by the fleet apply above.

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

## Historical inventory-derived workflow scan

At the exact revisions below, only `.github/verify.yml` declared `merge_group`.
These are historical source observations, not current enrollment blockers. All
20 now have verified active queues. Absence of a trigger for informational jobs
is not a queue prerequisite. Before any future required-check adoption, refresh
only the proposed contract's applicable queue behavior and producer evidence.
The rows do not claim a fresh scan of today's repository heads.

| Repository | Batch | Exact default-branch revision / workflows | Historical observation |
| --- | --- | --- | --- |
| `.github` | Pilot | [272e907fd059b6f2e8619f891f057257b71e6482](https://github.com/Living-Proof-Labs/.github/tree/272e907fd059b6f2e8619f891f057257b71e6482/.github/workflows) | Pilot had queue coverage |
| `capability-verifier` | A | [1e1330a5671db081b786767d35013880b26a1720](https://github.com/Living-Proof-Labs/capability-verifier/tree/1e1330a5671db081b786767d35013880b26a1720/.github/workflows) | No merge_group at recorded revision |
| `collaboration-guidelines` | C | [f98c2864d53585dc53ce7744c441f4593fb48f83](https://github.com/Living-Proof-Labs/collaboration-guidelines/tree/f98c2864d53585dc53ce7744c441f4593fb48f83/.github/workflows) | No merge_group at recorded revision |
| `living-proof-labs.github.io` | C | [cd339643f206770be0c1af25a7199aac4f2b4739](https://github.com/Living-Proof-Labs/living-proof-labs.github.io/tree/cd339643f206770be0c1af25a7199aac4f2b4739/.github/workflows) | No merge_group at recorded revision |
| `livingproof` | B | [934f82e065f89d17d0c06c7074f4d8b968ea711c](https://github.com/Living-Proof-Labs/livingproof/tree/934f82e065f89d17d0c06c7074f4d8b968ea711c/.github/workflows) | No merge_group at recorded revision |
| `livingproof-booster-t1` | B | [8da4ee58745163ed0aca6e217ba5aa61430556a6](https://github.com/Living-Proof-Labs/livingproof-booster-t1/tree/8da4ee58745163ed0aca6e217ba5aa61430556a6/.github/workflows) | No merge_group at recorded revision |
| `livingproof-capability-report` | B | [d1666e1c01a14166d2ece9a51b6a9d29994f4d9a](https://github.com/Living-Proof-Labs/livingproof-capability-report/tree/d1666e1c01a14166d2ece9a51b6a9d29994f4d9a/.github/workflows) | No merge_group at recorded revision |
| `livingproof-common` | B | [81871cb2367575e17cf0e5d7098653dd0104a4a4](https://github.com/Living-Proof-Labs/livingproof-common/tree/81871cb2367575e17cf0e5d7098653dd0104a4a4/.github/workflows) | No merge_group at recorded revision |
| `livingproof-evaluator` | B | [51a14a200c4477da359ab78403012f6479e1d277](https://github.com/Living-Proof-Labs/livingproof-evaluator/tree/51a14a200c4477da359ab78403012f6479e1d277/.github/workflows) | No merge_group at recorded revision |
| `livingproof-evaluator-run` | C | [1deba5bc9250fc8534b386481de4203327200607](https://github.com/Living-Proof-Labs/livingproof-evaluator-run/tree/1deba5bc9250fc8534b386481de4203327200607/.github/workflows) | No merge_group at recorded revision |
| `livingproof-evaluator-scenario` | B | [287f6ae3155e2bc8eb8a5490ad8dbb17b6787413](https://github.com/Living-Proof-Labs/livingproof-evaluator-scenario/tree/287f6ae3155e2bc8eb8a5490ad8dbb17b6787413/.github/workflows) | No merge_group at recorded revision |
| `livingproof-sim-gazebo` | A | [f2ed3e8800ff29ee45d64158872e7abd8e873659](https://github.com/Living-Proof-Labs/livingproof-sim-gazebo/tree/f2ed3e8800ff29ee45d64158872e7abd8e873659/.github/workflows) | No merge_group at recorded revision |
| `livingproof-sim-mujoco` | A | [7331df1c6adcafaa1bca16efb3ec3c17083d6301](https://github.com/Living-Proof-Labs/livingproof-sim-mujoco/tree/7331df1c6adcafaa1bca16efb3ec3c17083d6301/.github/workflows) | No merge_group at recorded revision |
| `livingproof-unitree-g1` | B | [dcfcf27e3803d83ebc7f1030ddbd99edf52a8a73](https://github.com/Living-Proof-Labs/livingproof-unitree-g1/tree/dcfcf27e3803d83ebc7f1030ddbd99edf52a8a73/.github/workflows) | No merge_group at recorded revision |
| `livingproof-unitree-go1` | B | [7a375c39ee51dfb77b27d6a92f51a7af89f124b7](https://github.com/Living-Proof-Labs/livingproof-unitree-go1/tree/7a375c39ee51dfb77b27d6a92f51a7af89f124b7/.github/workflows) | No merge_group at recorded revision |
| `livingproof-verification` | C | [c4be9a8898d0dbe615d0200a4d23c678b9ba583a](https://github.com/Living-Proof-Labs/livingproof-verification/tree/c4be9a8898d0dbe615d0200a4d23c678b9ba583a/.github/workflows) | No merge_group at recorded revision |
| `livingproof-worlds` | A | [29484d3cdbcbc31d9a6b931c03acd13607f6b5c9](https://github.com/Living-Proof-Labs/livingproof-worlds/tree/29484d3cdbcbc31d9a6b931c03acd13607f6b5c9/.github/workflows) | No merge_group at recorded revision |
| `robot-capability-specs` | A | [c3662d50376ef14f2e9c8eea09e7940bea923dbf](https://github.com/Living-Proof-Labs/robot-capability-specs/tree/c3662d50376ef14f2e9c8eea09e7940bea923dbf/.github/workflows) | No merge_group at recorded revision |
| `unitree-foxglove-sdk` | D | [2afda1bbad7c9c2f549e7cfca16ad6c1012262a3](https://github.com/Living-Proof-Labs/unitree-foxglove-sdk/tree/2afda1bbad7c9c2f549e7cfca16ad6c1012262a3/.github/workflows) | No merge_group at recorded revision |
| `website` | C | [12cef24c9ae60ae54a534e8111f0ee04117a8c0c](https://github.com/Living-Proof-Labs/website/tree/12cef24c9ae60ae54a534e8111f0ee04117a8c0c/.github/workflows) | No merge_group at recorded revision |

## Historical Batch A candidates for possible future required contracts

These candidate analyses are not selected contracts or mandatory gates. Their
coverage suggestions apply only if that work is explicitly selected for future
required enforcement; informational work does not block merging.

Checks below were read from the paginated Checks API at each exact source revision
above. Names and producer IDs are observed on main/push evidence; no Batch A
queue check or future aggregate name/producer has been verified. An omitted
result or unfinished run is not success. Recheck real PR and queue evidence after
local changes; App binding alone does not distinguish workflows with the same name.

### capability-verifier

Candidate coverage is `verify`, **both amd64 and arm64** `report` legs, `report-results`, `documentation`, and both `hallway-image-pr` matrix legs. At that revision, that last job requires `event_name == pull_request`, so merely adding a queue trigger silently skips image testing. Include matrix completeness and missing artifact checks, not only a successful dependency aggregate. The `verify`, `report`, `report-results` and `documentation` checkouts use PR-head SHA with `github.sha` fallback. In contrast, the [hallway-image-pr checkout at this revision](https://github.com/Living-Proof-Labs/capability-verifier/blob/1e1330a5671db081b786767d35013880b26a1720/.github/workflows/verify.yml#L547) sets `ref` only to `github.event.pull_request.head.sha`, without a fallback. Its queue adoption must explicitly select the merge-group SHA as well as broaden the job condition; verify both architecture legs check out that SHA. The separate livingproof-verification checkout in this job remains bound to the image lock commit, not the queue SHA. Existing artifact names using PR-head SHA with `github.sha` fallback do not prove that this checkout is queue-safe. No workflow-wide concurrency is declared. Keep release, registry image publishing and documentation deployment out of queue runs. The reusable scenario/walk-hallway workflows are not the repository's required verification contract: capability FAIL is data, while infrastructure/reproducibility failures remain failures. Do not convert expected fixture FAIL verdicts into pipeline failures.

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

Candidate coverage spans `verify.yml` job `verify` **and** `manual.yml` job `build`. If both are selected as required coverage, both workflows need queue coverage; requiring only verify omits manual validation and publication-completeness checks. A cross-workflow aggregate needs explicit complete evidence for the same SHA, or require a reviewed unique complete set. Both checkouts fall back from PR head to `github.sha`. No verification-wide concurrency is declared; the deployment lock is separate. Keep release and Pages deployment excluded; manual deployment currently requires a non-PR event and main ref, which must be tested for queue events.

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

## Historical remaining candidate batches

Batch membership is recorded in the inventory-derived table, following the
[coordination plan](https://github.com/Living-Proof-Labs/.github/issues/98#issuecomment-6907918290).

- **B — matrix/package verification:** establish all architectures, reusable-workflow jobs and packaging checks in the complete contract; retain per-leg evidence, cancellation/timeout/missing-leg tests and publishing separation. Exact context/producer and cost/runtime assessment remain unverified here.
- **C — multiple workflows and sites:** define read-only PR/queue checks independently of publish/deploy. At the recorded revision, `website` has only deploy/release workflow files, without a dedicated PR validation workflow. `livingproof-verification/checks.yml` needs review of PR-number concurrency and PR-head SHA assumptions; do not gate its robot-verdict/deployment pipeline wholesale. Exact complete contexts/producers remain unverified.
- **D — explicit special contract:** A future required contract for `unitree-foxglove-sdk` needs separation of unit/lint health from documented unstable locomotion capability outcomes. Rivet must obtain the precise blocking-evidence contract; no silent exclusion or weakened verdict semantics. Queue behavior and trusted context remain unverified.

## Future required-contract work and ownership

Keel owns this ledger and settings coordination. Rivet remains the sole route for
repository-local implementation; refresh the [existing coordination thread](https://github.com/Living-Proof-Labs/.github/issues/98#issuecomment-6907918290)
before proposing work, without duplicating teammates' changes. The earlier scan
had no Rivet reply; that is historical, not a claim about today's issue state.
Issue assignee and project Owner are distinct; this document updates neither.

If a new required contract is requested, keep these evidence questions separate:

1. Which jobs/artifacts are actually selected as required? Do not promote every
   candidate or informational check. Record trusted context/App identity, matrix
   coverage, legitimate skips and robot-verdict semantics for that selected scope.
2. Does that contract report correctly on its exact PR and merge-group SHA,
   including failed, cancelled, missing and unexpectedly skipped required work?
   Keep release/deploy side effects off queue events and coordinate through Rivet.
3. Does a separately authorized policy change preserve stronger existing rules,
   contexts, branch coverage and bypass boundaries? A queue-only rollout does not
   itself select more required checks.
4. Before any further live change, inspect a fresh bound all-inventory plan and
   obtain precise action-time and protected-environment approval. Retain strict
   readback; do not reuse the completed fleet apply plan or broaden credentials.
5. Record actual queue trials separately from settings enforcement. Future trial
   or contract evidence gaps do not undo the verified queue delivery above and
   are not invented gates on informational work or this documentation PR.

Refresh source observations from the canonical inventory when evaluating a new
contract. The current ledger preserves immutable historical evidence, including
the PR-only hallway-image checkout distinction, rather than implying it describes
newer teammate changes. Issue 98 can track any remaining separately requested
contract or trial work without claiming that fleet queue settings are pending.
