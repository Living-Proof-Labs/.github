<!-- SPDX-License-Identifier: CC-BY-4.0 -->

# Quickstart

Verify a real controller in simulation with Living Proof Verification™: the
Unitree G1 stock controller walks a MuJoCo hallway for 20 seeded trials, the
capability verifier assesses each trial, and the capability report grades the
result against an 18-of-20 pass bar. No robot is involved; this is simulation.

## 1. Run the demo with Docker

All you need is git and Docker. No Python setup, no GPU:

```sh
git clone https://github.com/Living-Proof-Labs/livingproof-verification.git && cd livingproof-verification
docker run --rm -u "$(id -u):$(id -g)" -v "$PWD:/work" ghcr.io/living-proof-labs/capability-verifier-hallway:1.15.2 capability verify run --reporter source verifications/unitree-g1-stock-mujoco-hallway.toml
```

Expect `12/20` trials to pass: `FAIL` against a bar of 18 of 20, in about a
minute on a decent CPU. The image runs natively on amd64 and arm64, and it
needs a real `git clone`, not a git worktree.

## 2. Develop in the devcontainer

To change controllers or verifications, open the repository in its
devcontainer, for example with VS Code **Reopen in Container**. It is the
recommended setup. For a manual setup (Python 3.12), follow the
[livingproof-verification README](https://github.com/Living-Proof-Labs/livingproof-verification#readme).

## 3. Read the result

The run ends with the tally, also saved as
`artifacts/runs/unitree-g1-stock-mujoco-hallway/summary.json`:

```text
12/20 trials PASS (needs 18), Wilson 95% [0.3866, 0.7812]: FAIL
{
  "definition": "unitree-g1-stock-mujoco-hallway.toml",
  "bundle-version": "1.1.0",
  "configurations": {
    "stock": {
      "FAIL": 8,
      "PASS": 12
    }
  }
}
```

Open `artifacts/runs/unitree-g1-stock-mujoco-hallway/stock/reports/report.html`
in a browser. `report.md` and `report.json` sit beside it.

The stock controller passes some trials and not others, so the result is
`FAIL`: below the pass bar of 18 of 20. That is expected. Living Proof
Verification shows what breaks, trial by trial, with the evidence behind each
one. Compare yours with the
[live report](https://docs.livingprooflabs.com/livingproof-verification/).

## No simulator? Start with the fixtures

No simulator or Linux machine to hand? The fixture demo runs the same verifier
on recorded evidence with just Docker and Task, in about a minute. The
[capability verifier v1.0.1 README](https://github.com/Living-Proof-Labs/capability-verifier/tree/v1.0.1)
owns the details.

### Install the prerequisites

Install [Git](https://git-scm.com/downloads),
[Docker with Compose v2](https://docs.docker.com/compose/install/) and
[Task 3.54.0](https://taskfile.dev/docs/installation), then start Docker.
You do not need Python, uv or Node.js; the project's Dockerfile supplies the
runtime.

### Clone the released demo and run it

```sh
git clone --branch v1.0.1 https://github.com/Living-Proof-Labs/capability-verifier.git
cd capability-verifier
task demo
```

`task demo` builds the Docker runtime and runs five Gherkin examples from
[robot-capability-specs v1.1.0](https://github.com/Living-Proof-Labs/robot-capability-specs/tree/v1.1.0/specs/v1).
The first run needs network access for base images, Debian packages, Python
dependencies and the public specification catalog; later runs use Docker's cache.

The command succeeds when all five examples pass. Three of them show the results
you should expect:

| Evidence fixture | Verification result | Why the test passes |
| --- | --- | --- |
| Valid pause in 120 ms | `PASS` | The requirement is met |
| Motion not inhibited; other evaluators favorable | `FAIL` | The failure is detected, not averaged away |
| Elapsed time missing | `INSUFFICIENT_EVIDENCE` | Missing data never passes silently |

`artifacts/demo.xml` keeps each full report.

!!! note "If the build stops at `apt-get update`"
    The first build installs Debian packages from `deb.debian.org`. A network or
    proxy that blocks that host stops the build before any test runs. Retry from
    a network that can reach `deb.debian.org`.

### Open a rendered report

The demo prints JSON. To see the report a person reads, download a published
example bundle and open its `report.html`. This bundle comes from the
[capability verifier v1.3.0 release](https://github.com/Living-Proof-Labs/capability-verifier/releases/tag/v1.3.0);
it is not the output of the demo you just ran.

```sh
BASE=https://github.com/Living-Proof-Labs/capability-verifier/releases/download/v1.3.0
BUNDLE=capability-verifier-v1.3.0-baseline-22ce11f3-4bbe-5ee8-b0cf-a357ad5e41a8-amd64-40284818922-1.zip

curl -fsSLO "$BASE/$BUNDLE"
curl -fsSLO "$BASE/BUNDLE-SHA256SUMS"
sha256sum --check --ignore-missing BUNDLE-SHA256SUMS   # prints "...zip: OK"
unzip -q "$BUNDLE" -d baseline
```

On macOS, use `shasum -a 256 --check --ignore-missing BUNDLE-SHA256SUMS`.

Open `baseline/report.html` in a browser. It shows one result, `PASS`, under the
`all-required-v1` policy, with the reason "All required assessments pass with
verified evidence". The same folder holds the manifest, evidence, provenance and
checksums behind it.

## Next steps

- See how the same observation can
  [meet one requirement and fail another](vision.md#see-it-today).
- Read [what a grade does, and does not, mean](vision.md#evaluation-is-not-diagnosis).
- Choose a [project manual](index.md#project-directory) for your part of the work.
