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
### Run the demo
The [quickstart](quickstart.md) takes you from a fresh clone to a rendered
report, using recorded fixture data.
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
who owns each step from robot selection to a published report, and what is
implemented today.
</div>
<div markdown>
### Find your part
Choose a [project manual](#published-manuals) for commands, contracts, execution,
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
    Today, versioned specifications, deterministic fixtures, recorded/mock
    assessments and portable reports demonstrate parts of this loop. Standalone
    MuJoCo and Gazebo examples exercise native simulation engines. Connected simulation
    verification, physical-robot execution, live evaluator providers and automated
    diagnosis-to-code workflows remain integration work. Reports do not certify
    safety, and an engine demonstration is not evidence of an integrated pipeline.

Search on this site covers this introduction and its local reference pages.
Open a project's manual to search that project's documentation.

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
