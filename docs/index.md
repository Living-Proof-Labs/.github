<!-- SPDX-License-Identifier: CC-BY-4.0 -->

# Prove what your robot can do, every software version.

<a id="living-proof-labs-documentation"></a>

<div class="lead" markdown>
Open tools for robotics teams to write capability requirements as user stories,
run them repeatably, and get a traceable report, not an unexplained score.
</div>

<div class="hero-actions" markdown>
[Try the quickstart](quickstart.md){ .md-button .md-button--primary }
[See the robot reports](https://docs.livingprooflabs.com/livingproof-verification/){ .md-button }
[Talk to us about a design partnership](https://livingprooflabs.com/#contact){ .hero-tertiary }
</div>

## The problem

Your robot passed yesterday. After today's software update, does it still pause
when asked? Under which conditions? And can you show why? A single score cannot
answer that. You need the requirement, the run and the evidence behind each
result, kept together for every software version.

## How it works

<div class="how-steps" markdown>
<div markdown>
### 1. Write the story
State a capability as a user story with conditions and acceptance criteria.
[Robot capability specifications](https://docs.livingprooflabs.com/robot-capability-specs/)
</div>
<div markdown>
### 2. Run it
Run the scenario repeatably in simulation and keep the evidence.
[Capability verifier](https://docs.livingprooflabs.com/capability-verifier/)
</div>
<div markdown>
### 3. Assess the evidence
Check each requirement against the evidence, then grade with an explicit, versioned policy.
[Capability reporter](https://docs.livingprooflabs.com/livingproof-capability-report/)
</div>
<div markdown>
### 4. Read the report
See what passed, what did not, and why, traced back to the evidence.
[Robot reports](https://docs.livingprooflabs.com/livingproof-verification/)
</div>
</div>

[Walk through the full loop](vision.md#from-a-requirement-to-the-next-improvement)
and [learn what a grade does—and does not—mean](vision.md#evaluation-is-not-diagnosis).

## What you bring, what you get

**You build the robot software. We provide the verification workflow. You get
evidence of what it can do, version after version.**

<div class="how-steps" markdown>
<div markdown>
### You bring
- The software that runs your robot, meaning its controller or policy.
- Your robot model and a thin adapter.
- Your CI compute. Runs work on CPU runners, so no GPU is needed.
</div>
<div markdown>
### We provide
**Living Proof Verification™**, open source:

- Capability specs written as user stories.
- Versioned simulation worlds and a runner.
- The verifier, the reporter and a reusable CI workflow.
</div>
<div markdown>
### You get
- A pass or fail for each capability, with the evidence and the grade behind it.
- The same check on every software version, so you can see what changed.
- A report you can share with partners.
</div>
</div>

See [responsibilities](architecture/verification-architecture.md#responsibilities) in the architecture.

**Where we fit:** Living Proof Verification™ is for anyone building robot
software who wants proof it's getting better: a developer comparing two
controllers, or a quality team checking a release. It isn't a training or
machine-learning tool. Picture opening one report that shows which version
handles the hallway better, what changed, and the evidence behind each result.

## Current scope: available now / next

<div class="now-building" markdown>
<div markdown>
<span class="badge badge-now">Available now</span>

**Living Proof Verification™**, open source:

- Robot verification in MuJoCo simulation for the Unitree G1 and Go1: CI in
  [livingproof-verification](https://github.com/Living-Proof-Labs/livingproof-verification)
  runs the walk-hallway capability for each pinned robot configuration
- Versioned capability specifications and an explicit, versioned grading policy
- [Robot reports](https://docs.livingprooflabs.com/livingproof-verification/) with
  the latest grade, run history and evidence per robot and variant
</div>
<div markdown>
<span class="badge badge-next">Next</span>

- More robots and variants on the published reports
- Gazebo as a second simulator
- Physical robots running the same scenarios, with partner companies
- **Living Proof Diagnosis™**: agents and people reviewing evidence and code
  together to suggest a path to a fix
</div>
</div>

**Not supported:** physical-robot execution. Reports are evidence for engineering
decisions, not safety certification; a simulation result applies only to its
declared context.

## Who it's for

- Robot software engineers who need to know what a change did to behavior.
- Test and QA leads who need repeatable, explainable results.
- Robot companies and integrators who need evidence they can share.

## Choose your path

<div class="reading-paths" markdown>
<div markdown>
### Run a verification
The [quickstart](quickstart.md) takes you from a fresh clone to a rendered
report: the Unitree G1 stock controller, 20 seeded trials in a MuJoCo hallway
simulation. A fixture demo is the fallback when no simulator is available.
</div>
<div markdown>
### Understand the vision
Follow the [requirement-to-improvement loop](vision.md), with a shared vocabulary
for specifications, evidence, assessments and policy.
</div>
<div markdown>
### See how verification fits together
Read the [verification architecture](architecture/verification-architecture.md):
who owns each step from robot selection to a published report, what is
delivered and what is still being migrated.
</div>
<div markdown>
### Find your part
Choose a [project manual](#published-manuals) for commands, contracts, execution,
reporting or contribution. Each project owns its technical detail.
</div>
</div>

Search on this site covers this introduction and its local reference pages.
Open a project's manual to search that project's documentation.

## Find your task

Start from what you are trying to do. Each project owns and publishes its own
manual; this table points you to the right one.

| I want to… | Start with | You will find |
| --- | --- | --- |
| Verify a controller end to end | [Quickstart](quickstart.md) | A fresh clone, a G1 hallway simulation run and a rendered report; fixture demo as fallback |
| Write or review a capability specification | [Robot capability specifications](https://docs.livingprooflabs.com/robot-capability-specs/) | Requirements, conditions and acceptance criteria |
| Run verification and grade the evidence | [Capability verifier](https://docs.livingprooflabs.com/capability-verifier/) | Execution, portable evidence and grading |
| See how a robot performs in simulation today | [Robot verification reports](https://docs.livingprooflabs.com/livingproof-verification/) | The latest grade, run history and evidence per robot and variant |
| Read and share reports | [Capability reporter](https://docs.livingprooflabs.com/livingproof-capability-report/) | Bundle validation and reports of the verifier's stored grades in JSON, HTML and CSV |
| Use the command line and plugins | [LivingProof](https://docs.livingprooflabs.com/livingproof/) | Command entry point and installed plugins |
| Try a simulation engine | [MuJoCo simulator](https://docs.livingprooflabs.com/livingproof-sim-mujoco/) | The MuJoCo engine the robot verification runs in |
| Contribute to any project | [Collaboration guidelines](https://docs.livingprooflabs.com/collaboration-guidelines/) | Shared contribution and engineering standards |

<a id="livingproof"></a>

## Published manuals

Each manual is independently published. Its documentation source revision may
be newer than its package release; check Version and source before installation.

<!-- directory:manuals -->
The published-manual table is generated from [`directory.json`](directory.json),
which may list only repositories in the canonical
[repository inventory](../config/github/repositories.json).
<!-- /directory:manuals -->

## Project directory

These links open the current project repositories. A repository listing does not
mean that a hosted manual or a planned integration is available.

<!-- directory:projects -->
The project table is generated from [`directory.json`](directory.json) and the
canonical [repository inventory](../config/github/repositories.json).
<!-- /directory:projects -->

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
