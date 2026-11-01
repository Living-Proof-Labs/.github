<!-- SPDX-License-Identifier: Apache-2.0 -->

# Helping robots help humans

!!! info "An evolving system, with explicit limits"
    The current demonstrations use recorded fixtures and portable reports.
    A standalone MuJoCo engine example is available; capability-pipeline simulation,
    physical-robot execution and live evaluator integrations are future work.
    The workflow below describes both the implemented pieces and the direction.

Robots earn our confidence through what they can do, under conditions we can
understand. **Living Proof Labs is building an open way to connect robot capability
requirements, observed behavior, and evidence people can inspect.**

Imagine a developer asking: *Does this robot pause when asked? How quickly? What
changed after the last software update?* We want the answer to lead from a clear
requirement to a run, its evidence, and a useful next step.

## From a requirement to the next improvement

**Continuous integration is the execution platform we are building toward for
simulation verification:** software changes trigger repeatable scenarios, evidence
capture, and reports. Today's fixtures already run in continuous integration;
capability-pipeline simulator adapters are future work. A standalone MuJoCo engine
example exists; it does not establish that integration. Physical robot runs need their own hardware
execution environment and controls. We do not control hardware from continuous
integration today.

This is the intended loop, with future execution paths marked explicitly:

1. Version software, requirements, and scenarios.
2. Execute fixtures in continuous integration today; simulation and separate
   hardware execution environments are planned.
3. Collect evidence and logs with their versioned context.
4. Retain evaluator assessments and apply an explicit versioned grading policy.
5. Produce a traceable report.
6. Developers investigate diagnosis hypotheses, change software, and rerun.

Agent-assisted diagnosis and live evaluation are future integration paths.


Deterministic checks, human review, and agent-assisted evaluations should retain
separate assessments and disagreements. An explicit policy determines the grade.
Log analysis and coding agents then help developers investigate possible root
causes and test improvements, comparing each new run in its exact context.

An evaluation asks whether evidence meets a requirement. A diagnosis suggests why
something happened: it is a hypothesis to investigate, not proof of root cause or
authority to change a grade. These reports do not certify robot safety. Our vision
spans diverse robots, simulators, evaluation providers, and developer tools;
those connections are not claims of implemented integrations or partnerships.

## Start with the software under test

A run is meaningful only when its context is clear. The intended system connects
an identified software revision with a capability requirement, scenario, input
conditions and execution environment. A changed controller, requirement, policy
or environment can change the result for different reasons; those versions must
stay visible rather than collapsing into one unqualified score.

For example, a pause requirement might specify the initial motion, the pause
request and a time limit. A scenario makes those conditions concrete. The executor
collects observations; the evaluator checks what the observations support. The
report should let a developer trace the conclusion back through those steps.
The current pause examples use recorded fixture data, not a moving robot.

## Simulation and eventual hardware

Simulation can make scenarios repeatable and allow software changes to be checked
before a physical run. The MuJoCo project currently demonstrates native engine
execution; connecting that execution to capability scenarios, evidence manifests
and evaluation is a separate integration boundary, not a delivered end-to-end flow.

Hardware adds physical conditions, device configuration and operational controls.
It needs a dedicated execution environment and people responsible for operating
it. A passing fixture or simulation result does not establish real-world behavior.
The vision is to compare evidence within its actual context, not substitute one
kind of execution for another or control hardware from ordinary CI jobs.

## Evaluation is not diagnosis

**Evaluation asks whether evidence supports a requirement. Diagnosis asks why a
behavior occurred.** These are different jobs, with different uncertainty.

- Deterministic checks can apply explicit rules to measurements and report missing
  inputs. Their precision depends on the observation and rule being appropriate.
- Human assessments add judgment and rationale. Recorded human fixture assessments
  are examples, not evidence that a live reviewer participated in a new run.
- Agentic evaluators could interpret supported evidence representations and retain
  their inputs, model/tool versions, reasoning summaries and evidence references.
  Today's examples use scripted mock assessments, not live provider calls.

Keep disagreements visible. The supported, versioned policy decides the grade;
adding an evaluator does not automatically make its output compatible with a
policy. Missing evidence must not silently become a pass. An understandable report
shows what was assessed, the applicable requirement, supporting observations and
remaining limits. Rendering a stored report does not silently recompute its grade.

## From logs to the next software change

After a failure or surprising change, a developer needs more than a label.
Traceable logs and original evidence can support hypotheses about timing,
configuration or software behavior. A future analysis adapter might extract
signals, frames or summaries from a recording while retaining links to the
original data and recording its transformations. A file format alone does not
prove a provider can interpret it; input support and retention need explicit design.

Log-analysis tools and coding agents could help investigate a hypothesis, suggest
a patch or build a reproducer. Those suggestions are not proof of root cause and
do not override a grade. Developers inspect the proposed change and rerun the
scenario with the new software version. Comparing reports in their versioned
contexts closes the loop. This connected agent-assisted workflow is a direction,
not a claim of delivered provider integrations, autonomous fixes or partnerships.

## What goes in, what comes out

| Piece | What it means |
| --- | --- |
| **Specification** | The versioned capability requirement, operating conditions, and acceptance criteria: what must be true. |
| **Scenario** | A concrete situation and expected behavior used to exercise that requirement. |
| **Evidence and manifest** | Observations and logs are the evidence. A manifest indexes result context, specification and software versions, assessments, and relative evidence paths with integrity digests. It describes collected results, not commands for a robot. |
| **Assessments** | Evaluators' findings, reasons, and evidence references, kept separately so disagreement stays visible. |
| **Policy** | Explicit, versioned rules that turn supported assessments and evidence checks into a grade. Missing evidence must not silently pass. |
| **Report and grade** | The understandable record of decisions and their supporting context. The grade is an outcome within that report; rendering a saved report does not regrade it. |

The released [portable bundle schema](https://github.com/Living-Proof-Labs/livingproof-capability-report/blob/v1.6.0/src/livingproof_capability_report/bundle.schema.json)
provides the technical detail. A manifest can contain multiple results, so a
bundle need not represent a single robot execution. Keep its referenced evidence
files with it; different specification and software contexts remain separate in
grading.

In a reporting workflow, the execution pipeline supplies the manifest, evidence,
and assessments. The installed reporter validates that input, grades under its
supported policy, and renders the stored decisions. Our examples supply recorded
fixtures in place of observations from a robot or simulator.

## See it today

Here is a plain-language reading of the released pause fixture, not a live robot
run or an executable command:

```text
Given motion is inhibited after a recorded pause of 300 milliseconds
When that evidence is assessed against a 500-millisecond pause limit
Then the fixture passes
When the same evidence is assessed against a 250-millisecond pause limit
Then the fixture fails
And the report retains the requirement versions and supporting evidence
```

The observation has not changed; the requirement has. Missing elapsed time instead
produces insufficient evidence. Today's demonstration uses deterministic checks,
scripted mock agent assessments, and recorded human assessments. No simulator,
robot, model call, or live human review is involved.

**Download a complete example** from [capability verifier v1.3.0](https://github.com/Living-Proof-Labs/capability-verifier/releases/tag/v1.3.0):

- [Baseline pass](https://github.com/Living-Proof-Labs/capability-verifier/releases/download/v1.3.0/capability-verifier-v1.3.0-baseline-22ce11f3-4bbe-5ee8-b0cf-a357ad5e41a8-amd64-40284818922-1.zip): 120 milliseconds meets the 500-millisecond limit.
- [Stricter requirement](https://github.com/Living-Proof-Labs/capability-verifier/releases/download/v1.3.0/capability-verifier-v1.3.0-strict-8099ea9d-76e0-577f-bdda-1609583bcbce-amd64-40284818922-1.zip): 300 milliseconds exceeds the 250-millisecond limit.
- [Required behavior fails](https://github.com/Living-Proof-Labs/capability-verifier/releases/download/v1.3.0/capability-verifier-v1.3.0-negative-191b6fd4-68bc-5f57-b485-6a8bb02379e0-amd64-40284818922-1.zip): motion is not inhibited; favorable assessments cannot hide the failure.
- [Missing measurement](https://github.com/Living-Proof-Labs/capability-verifier/releases/download/v1.3.0/capability-verifier-v1.3.0-missing-measurement-61961d98-eace-51eb-8983-7b252aa89bf7-amd64-40284818922-1.zip): absent elapsed time leaves insufficient evidence.
- [Compatibility comparison](https://github.com/Living-Proof-Labs/capability-verifier/releases/download/v1.3.0/capability-verifier-v1.3.0-compatibility-matrix-762ce2a2-703e-53de-9598-ff79388e0053-amd64-40284818922-1.zip): four requirement/executor combinations show passes, a failure, and an unsupported pairing.

Unzip any example into its own folder and open `report.html`. Each archive keeps
its manifest, evidence, reports, provenance, checksums, and regeneration instructions
together. These are portable data bundles; the architecture in a filename records
where it was built, not a restriction on where you can read it.

The [download catalog](https://github.com/Living-Proof-Labs/capability-verifier/releases/download/v1.3.0/CATALOG.md)
maps the examples, and [published checksums](https://github.com/Living-Proof-Labs/capability-verifier/releases/download/v1.3.0/BUNDLE-SHA256SUMS)
let you check download integrity. Reports preserve their recorded specification
versions and keep different contexts separate; there is no combined grade.


[Choose a rendered manual](https://docs.livingprooflabs.com/#published-manuals).

Adapted from the Living Proof Labs organization profile,
[original source](https://github.com/Living-Proof-Labs/.github/blob/cce66579ff8b0e26279d35a715c0ffac4c70891b/profile/README.md),
under Apache-2.0.
