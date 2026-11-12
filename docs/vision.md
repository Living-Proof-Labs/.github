<!-- SPDX-License-Identifier: Apache-2.0 -->

# Helping robots help humans

!!! info "Available now, and next"
    **Available now:** Living Proof Verification™ runs real Unitree G1, Go1 and Booster T1 controllers in MuJoCo
    simulation, with recorded fixtures as a quick fallback, and produces portable reports.
    **Next:** Gazebo as a second simulator, physical-robot runs with partner companies, and Living Proof Diagnosis™.
    The workflow below describes both what is available and the direction.

Robots earn our confidence through what they can do, under conditions we can
understand. **Living Proof Labs is building an open way to connect robot capability
requirements, observed behavior, and evidence people can inspect.**

Imagine a developer asking: *Does this robot pause when asked? How quickly? What
changed after the last software update?* We want the answer to lead from a clear
requirement to a run, its evidence, and a useful next step.

## Glossary

<div class="glossary" markdown>

| Term | Plain meaning | Example |
| --- | --- | --- |
| **Living Proof Labs** | The company building these tools. | Living Proof Labs publishes this documentation. |
| **Living Proof Verification™** | The open-source verification tooling available today: specifications, runs, evidence, grading and reports. | Grading a controller in a walk-hallway simulation run. |
| **Living Proof Diagnosis™** | Our vision, not yet available: agents and people reviewing evidence and code together to suggest why a result changed and a path to a fix. | A hypothesis about a failed run, for a developer to investigate. |
| **Capability** | Something a robot should be able to do, stated so that it can be checked. | Pausing when asked. |
| **Specification** | The versioned, written requirement for a capability: the conditions, the limits and what counts as acceptable. | Pause: motion must stop within 500 milliseconds of a pause request. |
| **Scenario** | One concrete situation that exercises a specification: the starting state, what happens, and what should be observed. | A moving robot receives a pause request. |
| **Lock** | The reviewed record that pins exactly what a run uses: the robot commit and the world, simulator, specification, trial plan, verifier and reporter releases. `lock --check` refuses to run if anything has drifted. | `verifications/unitree-g1-stock-mujoco-hallway.lock.json`. |
| **Run** | One execution of a verification definition at its locked versions: plan, set up, record evidence, assess each trial, grade and render the report. The same steps run locally and in continuous integration. | `livingproof capability verify run` on the Unitree G1 hallway definition, in MuJoCo simulation. |
| **Trial** | One seeded attempt within a run. Each trial gets its own evidence, assessments and grade. | Seed 7 of 20: the simulated G1 walks the hallway. |
| **Fixture** | Recorded input data used in place of a live robot or simulator, so a run gives the same result every time. | A recording in which motion stopped 120 milliseconds after the request. |
| **Evidence** | The observations a run collected, kept with the versions they came from and checksums that show they were not altered. | Elapsed time and whether motion was inhibited, with a SHA-256 digest. |
| **Assessment** | One evaluator's judgement of whether the evidence meets the requirement, with its reason. Each evaluator's assessment is kept separately. | The pause-rules check: PASS, "Pause state and 500 ms limit assessed". |
| **Policy** | The versioned rule that combines assessments into a grade. | `all-required-v1`: any failing required assessment makes the grade FAIL, and a missing assessment gives INSUFFICIENT_EVIDENCE. |
| **Grade** | The outcome, decided in two steps. First the policy grades each trial from its assessments. Then the trial grades are aggregated k of N: the run passes only if at least the pass bar of trials pass. A grade says whether this evidence met this requirement; it is not a safety certification or an explanation of why. | PASS, FAIL or INSUFFICIENT_EVIDENCE. `12/20 trials PASS (needs 18), Wilson 95% [0.3866, 0.7812]: FAIL` reads: 12 of 20 trials passed, 18 were needed, so the run grade is FAIL. |
| **Pass bar** | The number of trials out of the planned N that must pass, fixed in the trial plan. If too few pass but trials with INSUFFICIENT_EVIDENCE could still reach it, the grade is INSUFFICIENT_EVIDENCE rather than FAIL. | 18 of 20 seeds for the G1 hallway run. |
| **Wilson interval** | A 95% confidence range for the true pass rate, given k passes in N trials. It is reported next to the grade to show how certain the tally is; the pass bar, not the interval, decides the grade. | `[0.3866, 0.7812]` for 12 of 20. |
| **Report** | The record people and tools read. It traces the grade back to the specification, evidence, assessments and policy, and opening it again does not change the grade. | `report.html` in a downloaded example bundle. |
| **Reporter** | The pinned tool that renders a report from the graded results. It runs from a locked container image, or from source when Docker is not available. | `--reporter source` renders without Docker. |

</div>

The [quickstart](quickstart.md)'s simulation run and its fixture fallback show these.
The loop below shows how they connect.

## From a requirement to the next improvement

**Continuous integration runs MuJoCo hallway verification today.** A change in
[livingproof-verification](https://github.com/Living-Proof-Labs/livingproof-verification)
runs the walk-hallway scenario for the pinned Unitree G1, Go1 and Booster T1
configurations, keeps the evidence, grades it and publishes the report. Recorded
fixtures also run in continuous integration. Gazebo is not connected to that loop
yet. Physical robot runs need their own hardware execution environment and controls.
We do not control hardware from continuous integration today.

This is the loop. MuJoCo simulation runs it now; Gazebo, hardware and diagnosis
are still next:

1. Version software, requirements, and scenarios.
2. Execute the MuJoCo hallway in continuous integration for the published Unitree
   G1, Go1 and Booster T1 configurations. Gazebo and separate hardware execution
   environments are next.
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
before a physical run. MuJoCo hallway verification is a delivered end-to-end flow
for the published Unitree G1, Go1 and Booster T1 configurations: simulation,
evidence, a grade and a published report. Gazebo demonstrates native engine
execution; connecting it to capability scenarios, evidence and evaluation is still
unfinished.

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

The released [portable bundle schema](https://github.com/Living-Proof-Labs/livingproof-capability-report/blob/v3.4.0/src/livingproof_capability_report/bundle.schema.json)
provides the technical detail. A manifest can contain multiple results, so a
bundle need not represent a single robot execution. Keep its referenced evidence
files with it; different specification and software contexts remain separate in
grading.

In a reporting workflow, the capability verifier collects the evidence, keeps
each assessment, and grades it under an explicit, versioned policy. The installed
reporter validates that bundle and renders the grades it is given. Our examples
supply recorded fixtures in place of observations from a robot or simulator.

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

**Download a complete example** from [capability verifier v1.16.3](https://github.com/Living-Proof-Labs/capability-verifier/releases/tag/v1.16.3):

- [Baseline pass](https://github.com/Living-Proof-Labs/capability-verifier/releases/download/v1.16.3/capability-verifier-v1.16.3-baseline-9c83a567-9471-5c0d-ba5b-9c8c906e215d-amd64-43152187237-1.zip): 120 milliseconds meets the 500-millisecond limit.
- [Stricter requirement](https://github.com/Living-Proof-Labs/capability-verifier/releases/download/v1.16.3/capability-verifier-v1.16.3-strict-956003ea-bd3a-5cc6-8ec2-f3f737c6529d-amd64-43152187237-1.zip): 300 milliseconds exceeds the 250-millisecond limit.
- [Required behavior fails](https://github.com/Living-Proof-Labs/capability-verifier/releases/download/v1.16.3/capability-verifier-v1.16.3-negative-48fdd88e-53e4-5e3b-9b14-3669697534c5-amd64-43152187237-1.zip): motion is not inhibited; favorable assessments cannot hide the failure.
- [Missing measurement](https://github.com/Living-Proof-Labs/capability-verifier/releases/download/v1.16.3/capability-verifier-v1.16.3-missing-measurement-efc21e00-60ee-5b9e-99f5-849b0bedf73b-amd64-43152187237-1.zip): absent elapsed time leaves insufficient evidence.
- [Compatibility comparison](https://github.com/Living-Proof-Labs/capability-verifier/releases/download/v1.16.3/capability-verifier-v1.16.3-compatibility-matrix-69e85b63-3a39-5a89-adca-b0b4a25d0c44-amd64-43152187237-1.zip): four requirement/executor combinations show passes, a failure, and an unsupported pairing.

Unzip any example into its own folder and open `report.html`. Each archive keeps
its manifest, evidence, reports, provenance, checksums, and regeneration instructions
together. These are portable data bundles; the architecture in a filename records
where it was built, not a restriction on where you can read it.

The [download catalog](https://github.com/Living-Proof-Labs/capability-verifier/releases/download/v1.16.3/CATALOG.md)
maps the examples, and [published checksums](https://github.com/Living-Proof-Labs/capability-verifier/releases/download/v1.16.3/BUNDLE-SHA256SUMS)
let you check download integrity. Reports preserve their recorded specification
versions and keep different contexts separate; there is no combined grade.


[Choose a rendered manual](https://docs.livingprooflabs.com/#project-directory).

Adapted from the Living Proof Labs organization profile,
[original source](https://github.com/Living-Proof-Labs/.github/blob/cce66579ff8b0e26279d35a715c0ffac4c70891b/profile/README.md),
under Apache-2.0.
