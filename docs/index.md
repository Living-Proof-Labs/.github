<!-- SPDX-License-Identifier: CC-BY-4.0 -->

# Helping robots help humans

<a id="living-proof-labs-documentation"></a>

<div class="lead" markdown>
A capability claim should lead somewhere you can inspect: a requirement, a run,
the evidence behind its assessment, and a useful next step.
**Living Proof Labs is building that connection.**
</div>

A software change can alter what a robot does. We want developers to ask
*“Does it still pause when asked—and under which conditions?”* and follow the
answer from versioned software through a repeatable scenario to an explainable
report. When a result changes, evidence should help people investigate and improve
it, not leave them with an unexplained score.

<div class="reading-paths" markdown>
<div markdown>
### Run a verification
The [quickstart](quickstart.md) takes you from a fresh clone and a single
`docker run` to a rendered report: the Unitree G1 stock controller, 20 seeded trials in a MuJoCo hallway
simulation. A fixture demo is the fallback when no simulator is available.
</div>
<div markdown>
### Understand the vision
Follow the [requirement-to-improvement loop](vision.md), with a shared vocabulary
for specifications, evidence, assessments and policy.
</div>
<div markdown>
### Explore what works today
Start with [recorded fixture examples](vision.md#see-it-today). Inspect how the
same observation can meet one requirement and fail another.
</div>
<div markdown>
### See how verification fits together
Read the [verification architecture](architecture/verification-architecture.md):
who owns each step from robot selection to a published report, what is
delivered and what is still being migrated.
</div>
<div markdown>
### Find your part
Choose a [project manual](#project-directory) for commands, contracts, execution,
reporting or contribution. Each project owns its technical detail.
</div>
</div>

## From software to a useful next step

**Versioned software and requirements → execution and evidence → separate
assessments → explicit policy → traceable report → investigation and iteration.**

The intended execution paths include repeatable simulation and, eventually,
physical robots in their own controlled environments. Evidence keeps the original
observations and their context. Deterministic checks, human judgment and agentic
evaluation should remain distinguishable; a versioned policy explains how supported
assessments become a grade. Log analysis and coding agents can then help propose
and test changes, while developers retain responsibility for investigating them.

[Walk through the full loop](vision.md#from-a-requirement-to-the-next-improvement)
and [learn what a grade does—and does not—mean](vision.md#evaluation-is-not-diagnosis).

!!! info "Current scope"
    **Delivered:** robot verification in MuJoCo simulation. CI in
    [livingproof-verification](https://github.com/Living-Proof-Labs/livingproof-verification)
    runs the walk-hallway capability for a pinned robot configuration; the capability
    verifier grades the evidence and the reporter renders that stored grade. The
    [robot reports](https://docs.livingprooflabs.com/livingproof-verification/) publish
    the latest grade, run history and evidence for each published robot and variant.
    **Planned:** more robots and variants on the published reports (Go1 next), Gazebo as a second
    simulator (unfinished), robot manifests replacing the robot repositories'
    transitional locks, live evaluator providers and diagnosis-to-code workflows.
    **Not supported:** physical-robot execution. Reports do not certify safety, and a
    simulation result applies only to its declared context.

Search on this site covers this introduction and its local reference pages.
Open a project's manual to search that project's documentation.

<a id="project-directory"></a>
<a id="published-manuals"></a>
<a id="livingproof"></a>

## Project directory

New here? Start with the [Quickstart](quickstart.md): one `docker run` from a
fresh clone to a rendered report. Then find the project for your part of the work.

| Project | Description | Repository | Manual |
| --- | --- | --- | --- |
| Robot verification | Verification definitions and the published robot reports: the latest grade, run history and evidence per robot and variant. | [livingproof-verification](https://github.com/Living-Proof-Labs/livingproof-verification) | [Robot reports](https://docs.livingprooflabs.com/livingproof-verification/) |
| Robot capability specifications | Write or review capability requirements, conditions and acceptance criteria, plus the robot manifest schema. | [robot-capability-specs](https://github.com/Living-Proof-Labs/robot-capability-specs) | [Manual](https://docs.livingprooflabs.com/robot-capability-specs/) |
| Capability verifier | Runs trials, keeps portable evidence and grades it. | [capability-verifier](https://github.com/Living-Proof-Labs/capability-verifier) | [Manual](https://docs.livingprooflabs.com/capability-verifier/) |
| Capability reporter | Validates evidence bundles and renders the verifier's stored grades as JSON, HTML and CSV reports. | [livingproof-capability-report](https://github.com/Living-Proof-Labs/livingproof-capability-report) | [Manual](https://docs.livingprooflabs.com/livingproof-capability-report/) |
| LivingProof | The command-line entry point and its installed plugins. | [livingproof](https://github.com/Living-Proof-Labs/livingproof) | [Manual](https://docs.livingprooflabs.com/livingproof/) |
| Common library | Shared version and provenance utilities. | [livingproof-common](https://github.com/Living-Proof-Labs/livingproof-common) | [Manual](https://docs.livingprooflabs.com/livingproof-common/) |
| MuJoCo simulator | The simulator the delivered robot verification runs in. | [livingproof-sim-mujoco](https://github.com/Living-Proof-Labs/livingproof-sim-mujoco) | [Manual](https://docs.livingprooflabs.com/livingproof-sim-mujoco/) |
| Gazebo simulator | A second simulator; robot verification support is unfinished. | [livingproof-sim-gazebo](https://github.com/Living-Proof-Labs/livingproof-sim-gazebo) | Not yet published |
| Test worlds | Versioned, engine-neutral robot test worlds. | [livingproof-worlds](https://github.com/Living-Proof-Labs/livingproof-worlds) | Not yet published |
| Unitree G1 | Robot package for the Unitree G1 humanoid. | [livingproof-unitree-g1](https://github.com/Living-Proof-Labs/livingproof-unitree-g1) | Not yet published |
| Unitree Go1 | Robot package for the Unitree Go1 quadruped. | [livingproof-unitree-go1](https://github.com/Living-Proof-Labs/livingproof-unitree-go1) | Not yet published |
| Booster T1 | Robot package for the Booster T1 humanoid. | [livingproof-booster-t1](https://github.com/Living-Proof-Labs/livingproof-booster-t1) | Not yet published |
| Unitree Foxglove SDK | Robot visualization example. | [unitree-foxglove-sdk](https://github.com/Living-Proof-Labs/unitree-foxglove-sdk) | Not yet published |
| Collaboration guidelines | Shared contribution and engineering standards for every project. | [collaboration-guidelines](https://github.com/Living-Proof-Labs/collaboration-guidelines) | [Manual](https://docs.livingprooflabs.com/collaboration-guidelines/) |
| Organization directory | This documentation source and the repository inventory. | [.github](https://github.com/Living-Proof-Labs/.github) | Not yet published |
| Documentation site publisher | Builds and deploys docs.livingprooflabs.com. | [living-proof-labs.github.io](https://github.com/Living-Proof-Labs/living-proof-labs.github.io) | Not yet published |
| Website | The Living Proof Labs website. | [website](https://github.com/Living-Proof-Labs/website) | Not yet published |

Each manual is published independently. Its source can be newer than its package
release; check Version and source before installation.

## Help improve the documentation

Report manual corrections in the relevant project. This introduction, the vision,
the architecture and the directory are authored in the
[`.github` repository](https://github.com/Living-Proof-Labs/.github/tree/main/docs);
[open an organization documentation issue](https://github.com/Living-Proof-Labs/.github/issues)
for corrections.

## Version and source

The root site publishes one pinned `.github` revision; its Version and source page
names both that content revision and the publisher revision. Historical rendered
copies are not maintained; use source history for earlier revisions.
Documentation identity is separate from each project's package or catalog release.

Contributors follow [guidelines v6.0.0](https://github.com/Living-Proof-Labs/collaboration-guidelines/tree/v6.0.0)
and this repository's [working agreement](../AGENTS.md). See
[license scopes](https://docs.livingprooflabs.com/license.html). No private security
reporting route is documented here.
