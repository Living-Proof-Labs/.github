<!-- SPDX-License-Identifier: CC-BY-4.0 -->

# Quickstart

Go from a fresh clone to a passing demo, then open a report a person reads.
Everything here uses recorded fixture data: no robot, simulator, model call or
live human review is involved. The
[capability verifier v1.0.1 README](https://github.com/Living-Proof-Labs/capability-verifier/tree/v1.0.1)
owns the details.

!!! tip "No Docker?"
    Skip to [step 3](#3-open-a-rendered-report). It needs only a browser and a
    download.

## 1. Install the prerequisites

Install [Git](https://git-scm.com/downloads),
[Docker with Compose v2](https://docs.docker.com/compose/install/) and
[Task 3.54.0](https://taskfile.dev/docs/installation), then start Docker.
You do not need Python, uv or Node.js; the project's Dockerfile supplies the
runtime.

## 2. Clone the released demo and run it

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

## 3. Open a rendered report

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
- Choose a [project manual](index.md#published-manuals) for your part of the work.
