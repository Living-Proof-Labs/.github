<!-- SPDX-License-Identifier: Apache-2.0 -->

# Verification architecture

Living Proof Labs verification turns a selected robot configuration, world,
scenario, and policy into retained evidence, an authoritative assessment, and
a report people can inspect. The same contracts support local development,
automated workflows, and future customer-owned verification projects.

This page describes the delivered architecture (as of November 2026) and its
tracked migrations. The Action is the way each robot repository publishes its
own report; Unitree G1, Go1 and Booster T1 are being moved onto
[verification-reports-action](https://github.com/Living-Proof-Labs/verification-reports-action/blob/v2.1.0/README.md)
([.github #164](https://github.com/Living-Proof-Labs/.github/issues/164),
[.github #173](https://github.com/Living-Proof-Labs/.github/issues/173)).
It is not a claim that every integration or hardware deployment is complete:
physical robots are not supported, and Gazebo is not yet connected. The
evaluator contract and the deterministic scenario evaluator are published
packages. Vocabulary, recording, bindings, and human or agent evaluation remain
tracked migrations.

## Start here

| Need | Read |
| --- | --- |
| Find the component responsible for a task | [Responsibilities](#responsibilities) |
| Follow a run from selection to publication | [Run and series flow](#run-and-series-flow) |
| Understand what is delivered now | [Current implementation](#current-implementation) |
| Track the remaining migrations | [Migration work](#migration-work) |

## Responsibilities

Who invokes the shared tools:

```mermaid
flowchart TD
  consumer["Verification consumer"]
  access["livingproof"]
  verifier["capability-verifier"]
  reporter["capability-report"]
  publication["Optional publication"]

  consumer --> verifier
  access --> verifier
  consumer --> reporter
  access --> reporter
  verifier --> reporter
  reporter --> publication
```

What `capability-verifier` draws on to run trials:

```mermaid
flowchart LR
  verifier["capability-verifier"]
  providers["Simulators"]
  robots["Robots"]
  worlds["Worlds"]

  verifier --> providers
  verifier --> robots
  verifier --> worlds
```

The table below names each component's repository and responsibility;
`capability-report` is `livingproof-capability-report`, the robots are the robot
repositories and the worlds are `livingproof-worlds`.

Arrows show a dependency or supplied input, not ownership of every artifact.
The consumer is intentionally thin: it selects a baseline and publishes
results; it does not copy the execution, evaluation, or rendering engines.

| Component | Responsibility | Boundary |
| --- | --- | --- |
| `.github` | Organization view, inventory, and this architecture | Does not become a verification engine |
| Verification consumer | One selected baseline, verification lock, run/series selection, and publication settings | The Action is the way each robot repository publishes its own report; G1, Go1 and T1 are being moved onto [`verification-reports-action`](https://github.com/Living-Proof-Labs/verification-reports-action/blob/v2.1.0/README.md) ([.github #164](https://github.com/Living-Proof-Labs/.github/issues/164), [.github #173](https://github.com/Living-Proof-Labs/.github/issues/173)). Renovate is intended to bump the pinned inputs. Provenance checking is being added ([verification-reports-action #4](https://github.com/Living-Proof-Labs/verification-reports-action/issues/4), in review). [verifier #20](https://github.com/Living-Proof-Labs/capability-verifier/issues/20) (verifier-owned lock) is still open |
| Robot repository | Robot manifest, adapter, assets, feature flags, simulator compatibility, and contract tests | Does not own the cross-robot verification baseline after the manifest migration |
| `livingproof` | Discovery, installation, and local invocation of installed tools | Is not a required hop for an automated workflow |
| `capability-verifier` | Resolve the lock, execute trials, retain evidence, and produce authoritative grades and comparisons | Remains the orchestration and grading authority. An internal grading interface is still open ([capability-verifier #21](https://github.com/Living-Proof-Labs/capability-verifier/issues/21)). Calling evaluators through the contract is still open ([capability-verifier #51](https://github.com/Living-Proof-Labs/capability-verifier/issues/51)) |
| `livingproof-evaluator` | Shared contract definitions at [v1.0.0](https://github.com/Living-Proof-Labs/livingproof-evaluator/releases/tag/v1.0.0), including [`schema/defs.schema.json`](https://github.com/Living-Proof-Labs/livingproof-evaluator/blob/v1.0.0/schema/defs.schema.json) | Evaluator identity, kind (`scenario` or `integrity`), execution (`deterministic` or `agentic`), and an input reference of role, URI, and SHA-256. The same tag publishes the shared result envelope, the optional 1.1 descriptor, and the run-integrity schemas. Observable vocabulary ([#2](https://github.com/Living-Proof-Labs/livingproof-evaluator/issues/2)) and the observation-binding format ([#3](https://github.com/Living-Proof-Labs/livingproof-evaluator/issues/3)) remain design. This repository ships no evaluator implementation. The `agentic` execution value is a contract field; human and agent evaluators remain unfinished on the [retained epic](https://github.com/Living-Proof-Labs/livingproof-evaluator/issues/1) |
| `livingproof-evaluator-scenario` | Deterministic per-trial results at [v1.2.1](https://github.com/Living-Proof-Labs/livingproof-evaluator-scenario/releases/tag/v1.2.1), written by [`result.py`](https://github.com/Living-Proof-Labs/livingproof-evaluator-scenario/blob/v1.2.1/src/livingproof_evaluator_scenario/result.py) | Reads a `livingproof-hallway-evidence/2.0.0` manifest and each trial's observation JSON. Each `livingproof-evaluator-result/1.1.0` document records SHA-256 digests of the observation, the manifest, and the graded thresholds. Descriptor findings are empty in this release. MCAP reconstruction, the Gherkin step vocabulary, and observation bindings remain unfinished ([scenario #1](https://github.com/Living-Proof-Labs/livingproof-evaluator-scenario/issues/1)). The authoritative run grade stays with the verifier |
| Simulator provider | Physics execution and observations | Does not grade capability |
| `livingproof-worlds` | Versioned fixtures and engine representations | Adapter code performs engine conversion |
| `livingproof-capability-report` | Render the verifier's stored run and series assessments (render-only since [v2.0.0](https://github.com/Living-Proof-Labs/livingproof-capability-report/releases/tag/v2.0.0); [#30](https://github.com/Living-Proof-Labs/livingproof-capability-report/issues/30) is done) | Must not recompute a grade or invent missing evidence |
| `livingproof-common` | Identity and build provenance | Is not a plugin manager, runner, or evaluator |

### Who owns what

In short: you build the robot software, Living Proof Labs provides the
verification workflow, and you get evidence of what it can do, version after version.

| Part | Owned by | Notes |
| --- | --- | --- |
| Controller or policy | Customer | The software under test; it runs inside the simulated robot during each trial |
| Robot repository: manifest, adapter, assets and contract tests | Customer | The robot manifest declares configurations and simulator compatibility; the thin adapter connects the controller to the simulator provider |
| Verification consumer: definitions and verification lock | Customer | The lock pins the reviewed versions, commits and digests of every tool, world and robot input; changing it is a reviewed change |
| CI runners | Customer | The reusable workflow runs on the caller's GitHub Actions runners (`ubuntu-24.04`, CPU only) |
| Evidence and reports | Customer | Evidence bundles and rendered reports are stored as workflow artifacts in the caller's repository; publishing to GitHub Pages is optional |
| Capability specs, worlds, simulator providers | Living Proof Labs (open source) | `robot-capability-specs`, `livingproof-worlds`, `livingproof-sim-*` |
| Verifier, grading policy and reusable workflow | Living Proof Labs (open source) | `capability-verifier`, including `walk-hallway.yml`. This remains the authoritative grade |
| Evaluator contract and deterministic scenario evaluator | Living Proof Labs (open source) | `livingproof-evaluator` v1.0.0 and `livingproof-evaluator-scenario` v1.2.1. They publish contract definitions and per-trial results. The verifier keeps the run grade |
| Reporter | Living Proof Labs (open source) | `livingproof-capability-report`, render-only |

The reusable workflow's main inputs: `repository` and `ref` (the robot
repository to verify, defaulting to the caller), `configurations` (which lock
configurations to run, defaulting to all), `artifact-prefix`, `check` (lint,
profile validation and the robot repository's tests), `comment` (post the
result on same-repository pull requests) and `media`. Its outputs name the
configurations that ran and the download pattern for their reports.

Where your code goes: the reusable workflow checks out your robot repository
only on your own workflow run's runners, and Living Proof Labs runs no
infrastructure that receives or pulls it. The workflow does not cache your
repository, and it does not upload source files as artifacts. What it does
upload, as workflow artifacts in your repository, are test results, evidence
(trial observations, your lock, robot and configuration profiles, the source
commit, and any extra fields your adapter's `environment()` returns), verifier
decisions, recordings and rendered reports; the optional pull request comment
posts the report there too. Anyone who can read your repository's workflow
runs can read these, so on a public repository they are public, as are the job
logs. Keep anything confidential out of adapter output, profiles and log
messages.

GitHub Pages is an optional publication destination, not a shared-tool
dependency. Shared capabilities never depend back on a consumer.

## Run and series flow

```mermaid
flowchart TD
  definition["Verification definition<br/>robot, world, scenario, policy"] --> manifest
  lock["One verification lock<br/>versions, commits, digests"] --> manifest
  manifest["Resolved run manifest<br/>inputs and expected artifact names"] --> execution
  execution["Verifier and selected providers<br/>planned trials"] --> evidence
  evidence["Evidence record<br/>actual artifacts, checksums, status by seed"] --> assessment
  assessment["Authoritative assessment<br/>sufficiency, grade, rationale"] --> report
  evidence --> report
  report["Rendered run or compatible series"] --> publication["Optional publication"]
```

| Record | What it records | Authority |
| --- | --- | --- |
| Verification definition | Selected robot configuration, world, scenario, policy, and series intent | Consumer |
| Verification lock | Reviewed versions, commits, digests, and compatibility choices | Intended design: robot repository (`verifications/*.lock.json`, beside each definition) |
| Resolved run manifest | Exact executable inputs, planned trial identities, and **expected** media/evidence-link artifact names | Verifier |
| Evidence record | **Actual** artifacts, checksums, timestamps, and pass, missing, or error status for every planned seed | Providers and verifier |
| Assessment | Evidence sufficiency, authoritative grade, rationale, and comparison result | Verifier. The scenario evaluator writes a separate per-trial result |
| Report | A supplied assessment and linked provenance for one run or a declared compatible series | Reporter |

Pipeline completion, evidence sufficiency, and a capability grade are different
signals. Planned trial count remains the denominator: a missing or errored
trial is listed by seed and is not silently removed from a series.

An evidence checksum, lock hash, and source-run link preserve provenance after
an Actions artifact expires. They do not make expired evidence retrievable, so
the published reports keep their own copies of the evidence they link
([archived livingproof-verification #11](https://github.com/Living-Proof-Labs/livingproof-verification/issues/11),
repository archived 2026-11-24, done).

Series comparison requires compatible inputs, versions, metrics, and
missing-trial treatment. Equal random seeds across engines do not prove equal
physics or results. Simulation evidence applies only to its declared context;
it never authorizes physical deployment.

## Current implementation

[verification-reports-action](https://github.com/Living-Proof-Labs/verification-reports-action/blob/v2.1.0/README.md)
is the way each robot repository publishes its own report. Unitree G1, Go1 and
Booster T1 are being moved onto it
([.github #164](https://github.com/Living-Proof-Labs/.github/issues/164),
[.github #173](https://github.com/Living-Proof-Labs/.github/issues/173)).
At [v2.1.0](https://github.com/Living-Proof-Labs/verification-reports-action/releases/tag/v2.1.0)
the reusable workflow reads the caller's definitions and sibling lock files and
uploads a `verification-report` artifact. The site step can then place a
single-robot `reports/` section in that repository's documentation: an index of
the latest result per scenario, per-scenario history, and a retained page per
run. Renovate is intended to bump the pinned inputs in the robot repository.
Provenance checking is being added
([verification-reports-action #4](https://github.com/Living-Proof-Labs/verification-reports-action/issues/4),
in review). The released workflow records the lock's verifier commit and does
not compare it yet.
[Archived livingproof-verification](https://github.com/Living-Proof-Labs/livingproof-verification)
(repository archived 2026-11-24) is the retired central consumer.
`capability-verifier` grades and writes the assessment into the bundle;
`livingproof-capability-report` (render-only since v2.0.0) only validates and
renders it.

Two evaluator packages are published beside that path.
[`livingproof-evaluator` v1.0.0](https://github.com/Living-Proof-Labs/livingproof-evaluator/releases/tag/v1.0.0)
publishes shared contract definitions in
[`schema/defs.schema.json`](https://github.com/Living-Proof-Labs/livingproof-evaluator/blob/v1.0.0/schema/defs.schema.json).
[`livingproof-evaluator-scenario` v1.2.1](https://github.com/Living-Proof-Labs/livingproof-evaluator-scenario/releases/tag/v1.2.1)
reads observation JSON from a `livingproof-hallway-evidence/2.0.0` manifest and
writes one deterministic result per trial. Each result records SHA-256 digests
of the observation, the manifest, and the graded thresholds
([`result.py`](https://github.com/Living-Proof-Labs/livingproof-evaluator-scenario/blob/v1.2.1/src/livingproof_evaluator_scenario/result.py)).
Those digests name the JSON inputs the writer read. MCAP reconstruction and a
complete observation binding remain unfinished. The published robot reports
still show the verifier's stored grade. Package checks and draft corner
scenarios stay separate from a delivered robot capability result.

`livingproof` remains the local discovery, installation, and invocation layer;
its local path and the verifier workflows the Action calls use the same
contracts and verification engine.

### Historical snapshot (October 2026)

Before the consumer existed, three robot repositories were the only automated
entry points: G1 [`21c9131`](https://github.com/Living-Proof-Labs/livingproof-unitree-g1/commit/21c9131ca79ea4ec032ad3372408ff38684cf278)
([run](https://github.com/Living-Proof-Labs/livingproof-unitree-g1/actions/runs/41338061709)),
Go1 [`cb21338`](https://github.com/Living-Proof-Labs/livingproof-unitree-go1/commit/cb21338ec490d0b39133ee6da9bc64a0452dd229)
([run](https://github.com/Living-Proof-Labs/livingproof-unitree-go1/actions/runs/41338077952)) and
T1 [`6d69ff0`](https://github.com/Living-Proof-Labs/livingproof-booster-t1/commit/6d69ff0d48c051e5c39f4834462bf45980d90cfd)
([run](https://github.com/Living-Proof-Labs/livingproof-booster-t1/actions/runs/41338094107)).
At that time the reporter still graded and the consumer was not approved; both
have since changed as described above.

### Open boundaries being migrated

- Robot repositories still carry transitional `verification.lock.json` files.
  Their manifest and contract-test migrations (G1 #4, Go1 #4, T1 #7) retire them;
  these are unfinished.
- The verifier does not yet own one verification lock that resolves robot
  manifests and fans trials out ([verifier #20](https://github.com/Living-Proof-Labs/capability-verifier/issues/20)).
- Gazebo cannot yet run robot verification; its adapter work
  ([livingproof-sim-gazebo #4](https://github.com/Living-Proof-Labs/livingproof-sim-gazebo/issues/4))
  is unfinished.
- The archived verification site's index
  ([archived livingproof-verification](https://docs.livingprooflabs.com/livingproof-verification/),
  repository archived 2026-11-24) lists three MuJoCo hallway variants from that
  publication: Unitree G1 stock (`unitree-g1` / `stock-mujoco-hallway`), Unitree
  Go1 playground (`unitree-go1` / `playground-mujoco-hallway`) and Booster T1
  stock (`booster-t1` / `stock-mujoco-hallway`). The target publication is each
  robot repository's own report section; G1, Go1 and T1 are being moved onto
  the Action
  ([.github #164](https://github.com/Living-Proof-Labs/.github/issues/164),
  [.github #173](https://github.com/Living-Proof-Labs/.github/issues/173)).
  Further robots and variants are not on that archived index.
- Observable vocabulary
  ([livingproof-evaluator #2](https://github.com/Living-Proof-Labs/livingproof-evaluator/issues/2))
  and the observation-binding format
  ([livingproof-evaluator #3](https://github.com/Living-Proof-Labs/livingproof-evaluator/issues/3))
  are still design.
- Recording and binding remain unfinished. The scenario evaluator's Gherkin
  vocabulary and MCAP runner are open
  ([livingproof-evaluator-scenario #1](https://github.com/Living-Proof-Labs/livingproof-evaluator-scenario/issues/1)).
  MuJoCo still has to write MCAP and the producer and per-trial bindings
  ([livingproof-sim-mujoco #28](https://github.com/Living-Proof-Labs/livingproof-sim-mujoco/issues/28)).
  Robot bindings remain open for the
  [G1](https://github.com/Living-Proof-Labs/livingproof-unitree-g1/issues/17),
  [Go1](https://github.com/Living-Proof-Labs/livingproof-unitree-go1/issues/12),
  and [T1](https://github.com/Living-Proof-Labs/livingproof-booster-t1/issues/17).
- Human and agent evaluation stays on the retained
  [evaluator epic](https://github.com/Living-Proof-Labs/livingproof-evaluator/issues/1#issuecomment-6891250274).
  That epic is the next priority after the corner hallway cleanup
  ([robot-capability-specs #40](https://github.com/Living-Proof-Labs/robot-capability-specs/issues/40#issuecomment-6891640909)).
  The Gazebo producer binding stays in the backlog until then
  ([livingproof-sim-gazebo #5](https://github.com/Living-Proof-Labs/livingproof-sim-gazebo/issues/5#issuecomment-6891353466)).
  Corner work so far distinguishes proposed steering, draft specification and
  world changes, and future robot reports. Package checks and those drafts are
  separate from a delivered robot capability result.

## Migration work

| Change | Tracked work | Result |
| --- | --- | --- |
| Define a generic robot manifest | [robot-capability-specs #27](https://github.com/Living-Proof-Labs/robot-capability-specs/issues/27) (done) | Robots publish what they provide: configurations, adapters, assets, feature flags, and simulator compatibility |
| Own one verification lock | [capability-verifier #20](https://github.com/Living-Proof-Labs/capability-verifier/issues/20) | The verifier resolves manifests and fans trials out and results back in |
| Publish the evaluator contract and the deterministic scenario evaluator | [livingproof-evaluator v1.0.0](https://github.com/Living-Proof-Labs/livingproof-evaluator/blob/v1.0.0/schema/defs.schema.json) `schema/defs.schema.json` and [livingproof-evaluator-scenario v1.2.1](https://github.com/Living-Proof-Labs/livingproof-evaluator-scenario/blob/v1.2.1/src/livingproof_evaluator_scenario/result.py) `result.py` | Shared contract definitions, and per-trial results that read observation JSON and record observation, manifest, and graded-threshold digests. These packages are separate from verifier orchestration and from the authoritative assessment. The reporter stays render-only |
| Finish vocabulary, recording, bindings, and human or agent evaluation | [livingproof-evaluator #1](https://github.com/Living-Proof-Labs/livingproof-evaluator/issues/1), after [robot-capability-specs #40](https://github.com/Living-Proof-Labs/robot-capability-specs/issues/40) | Retained sequence: corner hallway cleanup first, then the epic, including human and agent evaluators. Vocabulary, the binding format, MCAP recording and binding, and producer and robot bindings stay open. The Gazebo producer binding ([livingproof-sim-gazebo #5](https://github.com/Living-Proof-Labs/livingproof-sim-gazebo/issues/5)) stays in the backlog until that cleanup |
| Render supplied assessments only | [livingproof-capability-report #30](https://github.com/Living-Proof-Labs/livingproof-capability-report/issues/30) (done, reporter v2.0.0) | Reporter grading and aggregation are removed; absent assessment data remains explicit |
| Publish robot manifests and contract-test them | [G1 #4](https://github.com/Living-Proof-Labs/livingproof-unitree-g1/issues/4), [Go1 #4](https://github.com/Living-Proof-Labs/livingproof-unitree-go1/issues/4), [T1 #7](https://github.com/Living-Proof-Labs/livingproof-booster-t1/issues/7) | Robot-owned verification locks are retired |
| Add a Gazebo lock variant | [livingproof-sim-gazebo #4](https://github.com/Living-Proof-Labs/livingproof-sim-gazebo/issues/4) | Another simulator can participate through the same lock and adapter contracts |
| Create the dedicated consumer | [.github #11](https://github.com/Living-Proof-Labs/.github/issues/11) (open; [archived livingproof-verification](https://github.com/Living-Proof-Labs/livingproof-verification), repository archived 2026-11-24, published the [archived robot reports](https://docs.livingprooflabs.com/livingproof-verification/)) | One customer-like verification repository with its own definitions, locks and published reports |
| Render Mermaid in the documentation site | [living-proof-labs.github.io #18](https://github.com/Living-Proof-Labs/living-proof-labs.github.io/issues/18) (done) | The documentation site renders the diagrams above |

Until the manifest migration lands, robot repositories still contain their
existing `verification.lock.json` files. Those are transitional inputs, not a
second long-term baseline. The intended baseline is the lock beside each
definition in the robot repository (`verifications/*.lock.json`), plus that
repository's manifests and contract tests.

## First parity fixture

G1 stock is the first parity fixture. Its reusable workflow must retain the
planned trial count, record each seed's actual evidence checksum, and compare
the resolved inputs, evidence, assessment, and rendered report with the prior
path before replacing it.
