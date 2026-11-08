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

One recorded comparison shows that loop on a single date: the same hallway, two controllers, measured together. The caption dates the recording. Current results are on the live report linked under the video.

<figure style="margin:1.25rem 0 1.5rem;max-width:100%;padding:0.9rem 1rem;border:1px solid var(--md-default-fg-color--lightest);border-radius:0.6rem">
  <video
    controls
    playsinline
    preload="metadata"
    poster="media/g1-comparison-poster.jpg"
    width="1280"
    height="720"
    style="display:block;width:100%;max-width:100%;height:auto;background:#0b1120;border-radius:0.6rem"
    aria-describedby="g1-comparison-caption"
  >
    <source src="media/g1-comparison.mp4" type="video/mp4" />
    <track kind="captions" src="media/g1-comparison.en.vtt" srclang="en" label="English" default />
    <a href="media/g1-comparison.mp4">Download the comparison video (MP4)</a>
  </video>
  <figcaption id="g1-comparison-caption" style="margin:0.75rem 0 0">
    Snapshot recorded 1 Nov 2026, spec v1.5.0. See the
    <a href="https://docs.livingprooflabs.com/livingproof-verification/">live report →</a>
    for current results.
  </figcaption>
</figure>

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
- Your CI compute. Runs on standard CI runners, no GPU needed.
</div>
<div markdown>
### We provide
**Living Proof Verification™**, open-source:

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
controllers, or a quality team checking a release. It doesn't train models; it
verifies the controllers you build. Picture one report that shows which version
does better, whether it meets the bar, and why.

## Current scope: available now / next

<div class="now-building" markdown>
<div markdown>
<span class="badge badge-now">Available now</span>

**Living Proof Verification™**, open-source:

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

Search on this site covers this introduction and its local reference pages.
Open a project's manual to search that project's documentation.

<a id="find-your-task"></a>
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
