<!-- SPDX-License-Identifier: Apache-2.0 -->

# Releasing the organization source

This repository publishes versioned releases (`vX.Y.Z` tags with GitHub
Releases) so other repositories can pin a named version of its content instead of
a bare commit. A release is a label for a commit that has already been verified.
It is not a deployment and not an approval.

## What a version identifies

A version names exactly one commit on `main` and so the whole repository tree at
that commit:

- **Policy:** the desired repository settings, inventory and GitHub App
  definitions under [`config/github/`](config/github/) and the
  [repository operations guide](docs/repository-operations.md).
- **Tools:** the settings, audit and bootstrap tooling in [`tools/`](tools/) and
  [`scripts/`](scripts/), their tests, the [`Taskfile.yml`](Taskfile.yml) and the
  workflows in [`.github/workflows/`](.github/workflows/).
- **Documentation source:** the organization pages under [`docs/`](docs/) that
  `living-proof-labs.github.io` publishes, and the [`profile/`](profile/) README.

A version does **not** identify:

- the live state of any GitHub repository or organization setting,
- the published documentation site (that is the publisher's revision plus the
  content it pins),
- any robot, simulator, evaluator or other project's own release.

## What publishing does not do

Publishing a release **does not run `apply-repository-settings`** and does not
change any live setting. That workflow stays manual
(`workflow_dispatch`) and needs its own protected-environment approval every
time it applies anything. A release also **implies no environment approval**:
the `repository-audit` and `repository-administration` environments are not used
by the release job, and nothing here widens their access. A release job has only
`contents: write` for tagging and creating the Release; it gets no secrets, no
environment, and no App token. A tag created with the repository token does not
start other workflows.

A version therefore says "this is the verified source at this commit", never
"this policy is applied" or "this has been approved".

## How a release is cut

The `release` job in [`verify.yml`](.github/workflows/verify.yml) follows
[Call after verification](https://github.com/Living-Proof-Labs/collaboration-guidelines/blob/v9.6.10/docs/releases.md#call-after-verification)
in the shared releases guide and calls the shared semantic-release workflow at
one published release tag, with no branch or commit reference. The tag is the
pin; each pull request that moves it records the commit the tag resolves to as
review evidence. Renovate proposes newer tags by pull request, together with the
preset pin; `tests/github/guidelines-pins.test.mjs` keeps both on one tag.

- The job needs `verification-gate`, the aggregate that requires every
  verification job of that run to have the result expected for the event. If any
  of them failed, was cancelled or was skipped, the gate fails and the release job
  is skipped.
- A red push to `main` publishes no release. That includes strict live-settings
  drift caught by `trusted-repository-settings`. Nothing is retried: the next green
  push to `main` releases every unreleased commit together.
- It runs only on a `push` to `main`. Pull requests, merge queue runs, the daily
  schedule and manual dispatches never publish.
- It publishes only when the commits since the last tag are releasable. A repeat
  run on a commit that already has a tag publishes nothing and never moves or
  recreates a tag. Published tags are not retargeted.
- Nothing rewrites history: the engine adds a tag and a Release and creates no
  commit.

`tests/github/release-workflow.test.mjs` and
`tests/github/verification-gate-blocks-release.test.mjs` prove these conditions offline by
reading the workflow and running the real gate script for every result.

### Commit messages and the version

Merges to `main` use the repository's merge queue with merge commits, so the
pull request's commits and its title are what the engine reads. Use
Conventional Commit types from the shared
[policy](https://github.com/Living-Proof-Labs/collaboration-guidelines/blob/v9.6.10/docs/releases.md#policy):
`feat` raises the minor version; `fix`, `perf`, `docs`, `chore`, `build`, `ci`,
`test`, `refactor`, `style` and `revert` raise the patch version; a `!` marker or
a `BREAKING CHANGE:` footer raises the major version. Messages with no recognised type
produce no release.

### First release

This repository had no tags before this change, so the engine's first release is
`v1.0.0` on the first verified push to `main` that has releasable commits, and its
notes summarize the history since the repository began. Existing commits and
branches are not touched. After the first publication, check:

```sh
gh release view v1.0.0 --repo Living-Proof-Labs/.github --json tagName,targetCommitish,isDraft,body
gh api repos/Living-Proof-Labs/.github/git/ref/tags/v1.0.0 --jq .object      # type commit
gh run list --repo Living-Proof-Labs/.github --workflow "Verify group directory" --branch main --event push --limit 3
```

The tag's commit must equal the commit of the push run whose `Repository
verification gate` and `Publish repository release` jobs both succeeded, and
`main` must still contain it with its history unchanged.

## Pinning a release from the documentation publisher

`living-proof-labs.github.io` pins this repository in `content.lock.json` with a
bare `commit`. Once a release exists, the lock can record the released tag and
the commit it resolves to, as the shared guide's
[integration through released tags](https://github.com/Living-Proof-Labs/collaboration-guidelines/blob/v9.6.10/docs/releases.md#integration-through-released-tags)
describes:

- the pin pull request in the publisher moves the lock to the new tag and
  records the commit the tag resolves to; the publisher's content check fails if
  the tag does not resolve to that same recorded commit,
- the publisher keeps recording the content revision and its own revision in
  `build.json` and on every page, so source and publisher provenance are kept,
- the publisher keeps its own documentation-only, no-automated-release exception;
  this repository's release does not publish the site or change that exception.

Until that publisher change merges, its bare commit pin remains valid.
