<!-- SPDX-License-Identifier: CC-BY-4.0 -->

# How to read a robot report

A report answers **what this robot configuration did in this scenario, with
these inputs**. It is not a general rating of the robot. Start with the
[robot reports](https://docs.livingprooflabs.com/livingproof-verification/), then
open one dated run rather than relying only on the latest-result page.
The [glossary](vision.md#glossary) defines trials, assessments, grades, pass bars
and Wilson intervals.

## 1. Identify what was tested

Read the scenario, robot software configuration, world, simulator and run identity.
The robot package release and the controller's software version are different
identities. Check the specification revision and the pinned releases in the
report's provenance or full lossless report, not today's newest release tags.

A verification manifest and lock describe the intended input bundle. Recorded
source identities and digests are the evidence for what was actually consumed;
a declared pin alone does not prove execution used those bytes. Missing or
conflicting provenance limits what you can conclude.

When comparing runs, check what changed: controller, control mode, pose source,
world traversal, specification, trial plan and evaluator versions can all matter.
A fixed-forward hallway test and a route-following corner test do not isolate the
same control behavior. Reusing a world does not make two scenarios equivalent.

## 2. Read the evaluators separately

| Result | Question it answers | What it does not establish |
| --- | --- | --- |
| **Scenario** | Did the observed behavior meet the scenario's requirements? Expand each step for the measurement, limit, time and trial result. | Why a failure happened, or whether the evidence is complete. |
| **Run Integrity** | Did the run satisfy the listed test-system checks? Read the evaluator version, individual checks and findings. | That the robot passed the scenario, or that every possible provenance and sensing problem was checked. |

For example, Run Integrity's completeness check can confirm that every planned
trial has an observation file. A 100% completeness result is not 100% robot
reliability. A test-system `ERROR` is not a failed robot capability. Missing
evidence must not silently become a pass. Older report versions may omit an
evaluator card; inspect the underlying JSON rather than assume it ran or passed.

The verifier stores the assessments and policy decisions. The reporter renders
them; reopening a report does not rerun the robot or regrade its evidence.
A green continuous-integration workflow can successfully publish a robot FAIL.

## 3. Read the trial plan before the percentage

Look for the number of trials, how many passed and how many the plan required.
Use this run's pass bar, not a universal threshold. `PASS`, `FAIL` and
`INSUFFICIENT_EVIDENCE` describe the stored policy outcome; they are not diagnoses.
The reported 95% confidence interval expresses uncertainty in the success tally,
not a separate pass condition or a guarantee about deployment.

For a concrete, dated example, the [T1 left-corner run from 18 November 2026](https://docs.livingprooflabs.com/livingproof-verification/booster-t1/stock-mujoco-corner-left/runs/44253837813/)
records one pass out of one simulated trial, with one required. Its Wilson 95%
interval is approximately 21–100%. That is evidence of one success, not proof
of reliable physical-robot performance. Repeating an identical deterministic
trial also does not demonstrate robustness across different conditions.

## 4. Inspect the limits and the evidence

Use the scenario's stated limits and their inputs. Where a lateral limit is
robot-normalised, a wider robot can have less permitted deviation in the same
hallway. The example above uses half the clear hallway width minus half the
robot width: `1.5 / 2 - 0.541 / 2 = 0.4795 m`. That is the declared route-deviation
limit, not a universal robot score or a substitute for wall-contact checks.

Open the trial observations and available video or MCAP recording to investigate
the measurements. Read the evidence-retention notice: downloadable recordings
can expire even while the report and its stored decisions remain available.
An expired or missing file is unavailable evidence, not fresh verification of
its contents. Preserve the run-specific link, identities and checksums when
sharing a finding. Each new execution should retain its own identity and evidence;
a moving latest-result page is navigation, not an immutable comparison reference.

## 5. State the conclusion at the right scope

Prefer “T1 stock passed this left-corner scenario in one MuJoCo trial” to “T1 can
navigate corners reliably.” These simulation reports are not physical-robot
verification or safety certification. Simulator-supplied pose can support a
control test without testing perception; check the actual configuration before
claiming either. A suggested cause of failure remains a hypothesis.

For the tools behind the report, see the
[verification architecture](architecture/verification-architecture.md#responsibilities),
[verifier manual](https://docs.livingprooflabs.com/capability-verifier/) and
[reporter manual](https://docs.livingprooflabs.com/livingproof-capability-report/).
