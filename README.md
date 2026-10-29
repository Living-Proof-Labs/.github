# Living Proof Labs

Helping robots help humans through clear capability requirements, inspectable
evidence, and understandable reports.

**[Start with the welcome page](profile/README.md)** for the vision, a released
fixture demo, and a short guide to the projects.

This repository hosts our public GitHub organization profile. The welcome page
is published from `profile/README.md`; contributor guidance is in
[AGENTS.md](AGENTS.md).

## Organization operations

This is the operator entry point for organization-wide repository inventory,
GitHub App definitions, settings audit, and drift evidence. Start with
`task github:apps:check` to validate the versioned App manifests, then read the
[bootstrap runbook](docs/github-app-bootstrap.md). Use
`task github:settings:report` for an on-demand non-mutating audit and
`task github:settings:check` for the strict read-only verification used after
an approved apply and by scheduled drift detection. The generic policy and
tool remain released dependencies of `collaboration-guidelines`; this
repository supplies the organization inventory and operating decisions.

On Debian Linux (amd64 or arm64), `task` first lists these operations and
`task setup` installs the pinned, checksum-verified Node runtime under this
checkout's `.tools/` directory. It also installs the pinned Task binary there.
On a host without Task, start once with `bash tools/setup.sh`, then run
`bash tools/task.sh setup` (or add no shell configuration; the wrapper stays in
the checkout). It does not use `sudo` or alter system packages. Codespaces
uses `.devcontainer/devcontainer.json` and exposes the same Task binary after
creation.
The App helper entry points are `task github:apps:form:help`,
`task github:apps:callback:help`, and `task github:apps:exchange:help`; the
exchange helper is dry-run until its explicit `--execute` flag.

## Repository directory

[`config/github/repositories.json`](config/github/repositories.json) is the
sole canonical inventory of Living Proof Labs repositories. Register a new
project there through a pull request. The inventory is validated locally with
`npm run check` and `npm test`.

The reusable GitHub repository-settings policy is pinned in
[`config/github/repository-policy.json`](config/github/repository-policy.json)
to a published release tag, exact commit, and verified tool blob. Run
`task github:settings:check` to fail on policy drift or incomplete state, or
`task github:settings:report` for the same read-only audit without treating
existing drift as a CI failure. Both download and verify the released tool
before executing it with this inventory. The released policy keeps its UI-only
preferences (sponsorships, Archive Program preservation, Git LFS archives,
ref-update limits, and linked-issue closing) explicit for manual review; the
API audit does not misrepresent them as enforced. Neither task applies settings.
Applying any settings or branch policy remains a separately authorized operation.

Pull requests block on the inventory and tool tests, while their live settings
report is deliberately informational: repository administrators can make a
legitimate out-of-band change while a pull request is open. On `main`, a manual
dispatch, and the daily `16:17 UTC` schedule (02:17 AEST / 03:17 AEDT), the
same audit is strict and fails for drift or unverified state. It never
auto-remediates drift. JUnit results and a 14-day artifact are published on
every run. GitHub cron is UTC and cannot follow Sydney daylight-saving changes.

The workflow token is intentionally insufficient for complete organization-wide
administration reads. Until a separately approved App is configured, strict
runs accurately fail as incomplete. A durable setup uses a selected-repository
GitHub App: an Administration-read audit identity, plus an Administration-write
apply identity kept only in a protected `repository-administration` environment
on `main`. A write-capable read is required to verify ruleset bypass actors,
because GitHub hides that field otherwise. Store the App client ID in
`REPO_ADMIN_APP_CLIENT_ID` and private key only as
`REPO_ADMIN_APP_PRIVATE_KEY` in that protected environment; do not make either
available to pull-request or fork-controlled code. Credential and environment
creation are deliberately outside this repository change.

The versioned [GitHub App bootstrap recipe](docs/github-app-bootstrap.md)
records the requested infrastructure-as-code manifests, exact owner-consent
boundary, and the future encrypted-secret bootstrap path without storing or
creating any credential.
