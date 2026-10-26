# Helping robots help humans

Robots earn our confidence through what they can do, under conditions we can
understand. **Living Proof Labs is building an open way to connect robot capability
requirements, observed behavior, and evidence people can inspect.**

Imagine a developer asking: *Does this robot pause when asked? How quickly? What
changed after the last software update?* We want the answer to lead from a clear
requirement to a run, its evidence, and a useful next step.

## From a requirement to the next improvement

The loop we are building brings developers, reviewers, and their tools together:

1. **Describe the capability.** Version the requirement, operating conditions, and
   acceptance criteria so everyone knows what is being checked.
2. **Exercise the software.** Run a scenario in simulation or on hardware. Capture
   observations and logs alongside the software, robot, and environment versions.
3. **Evaluate the evidence.** Combine deterministic checks, human review, and
   agent-assisted assessments, keeping their reasoning and disagreements visible.
   An explicit, versioned policy determines the grade.
4. **Make the result understandable.** Produce a traceable report that connects each
   decision to its requirement, evidence, evaluators, and policy. Missing evidence
   should be visible, not quietly treated as a pass.
5. **Investigate, improve, and repeat.** Log analysis and coding agents help
   developers explore possible root causes and propose software changes. Developers
   test those ideas, rerun the scenario, and compare results in their exact contexts.

An evaluation asks whether the evidence meets a requirement. A diagnosis suggests
why something happened. Those are different claims: an agent's explanation is a
hypothesis to investigate, not proof of root cause or authority to change a grade.
These reports do not certify robot safety.

Our vision spans different simulators, robots, evaluation providers, and developer
tools. Those connections are future integration work. **Today's released demo uses
fixtures: it does not run a robot or simulator, call a model, or conduct live human
review.** It demonstrates portable evidence and reports, with deterministic checks,
clearly labeled mock agent assessments, and recorded human assessments.

## See it today

**Start with a result.** Download the [example HTML report](https://github.com/Living-Proof-Labs/capability-verifier/releases/download/v1.2.0/report.html)
and open it locally, or read the [plain-text report](https://github.com/Living-Proof-Labs/capability-verifier/releases/download/v1.2.0/report.txt).
Both come from [capability verifier v1.2.0](https://github.com/Living-Proof-Labs/capability-verifier/releases/tag/v1.2.0).

For a concrete example, a recorded pause of 300 milliseconds meets a 500-millisecond
limit but fails a 250-millisecond limit. The observation has not changed; the
requirement has. Preserving both versions makes that difference explainable.

**Make your own report from the fixture bundle.** Follow the
[livingproof v1.4.0 installation guide](https://github.com/Living-Proof-Labs/livingproof/blob/v1.4.0/README.md#get-started)
first. In that same Python environment, install the released reporter explicitly:

```sh
livingproof plugins install livingproof-capability-report --version 1.6.0
livingproof plugins status livingproof-capability-report
```

Then follow [Produce a report](https://github.com/Living-Proof-Labs/livingproof/blob/v1.4.0/README.md#produce-a-report)
to download and checksum-verify the reporter v1.6.0 source archive and extract its
example `bundle` directory. With that directory in place:

```sh
livingproof capability report validate bundle/manifest.json
livingproof capability report grade bundle/manifest.json -o report.json
livingproof capability report render report.json --format html -o report.html
```

Open `report.html` locally. Keep the complete bundle with its evidence files;
use new output filenames when repeating the commands. Grading saves the policy's
decisions; rendering displays them without regrading. A fixture's failure or
insufficient-evidence grade can be the correct result of a successful demo.

## Find your next step

These links open released documentation. Each project gets more technical as you
dig in; the demo retains its own recorded specification versions rather than
silently adopting the newest catalog.

| If you want to… | Start here |
| --- | --- |
| Install tools and manage the reporter plugin | [Living Proof command, v1.4.0](https://github.com/Living-Proof-Labs/livingproof/tree/v1.4.0) |
| Explore capability requirements and examples | [Robot capability specifications, v1.2.1](https://github.com/Living-Proof-Labs/robot-capability-specs/tree/v1.2.1) |
| See how fixtures become portable evidence | [Capability verifier, v1.2.0](https://github.com/Living-Proof-Labs/capability-verifier/tree/v1.2.0) |
| Understand grading and report formats | [Capability reporter, v1.6.0](https://github.com/Living-Proof-Labs/livingproof-capability-report/tree/v1.6.0) |
| Build on shared version-identification tools | [Common library, v1.0.0](https://github.com/Living-Proof-Labs/livingproof-common/tree/v1.0.0) |

Have a capability you need to explain, a confusing result, or an integration you
want to explore? Bring a concrete example to the relevant repository's Issues tab.
Tell us what you expected, what you observed, and which versions were involved.
Small, inspectable examples help us build this together.
