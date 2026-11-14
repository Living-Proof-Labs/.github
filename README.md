# Living Proof Labs

Helping robots help humans through clear capability requirements, inspectable
evidence, and understandable reports.

- **Start here:** Visit the [welcome page](profile/README.md).
- **Working on verification?** Read the [verification architecture](docs/architecture/verification-architecture.md).
- **Editing the documentation site?** The organization pages published at
  [docs.livingprooflabs.com](https://docs.livingprooflabs.com/) are authored in
  [`docs/`](docs/site.json); see [organization documentation](#organization-documentation).
- **Operating this organization?** Use the quick start below, then the
  [repository operations guide](docs/repository-operations.md).

## Organization operations

This repository owns the organization inventory, desired repository settings,
and every settings audit and apply tool. Review policy and implementation changes
together here; no settings source is downloaded from collaboration-guidelines.

### Quick start

| Goal | Command | Result |
| --- | --- | --- |
| List available operations | `task` | Shows organization tasks |
| Bootstrap a Debian host | `task setup` | Installs pinned Node and Task under `.tools/` |
| Validate this checkout | `bash tools/task.sh verify` | Checks inventory and tests |
| Inspect settings drift | `task github:settings:report` | Read-only report; does not fail for existing drift |
| Enforce settings policy | `task github:settings:check` | Read-only audit that fails for drift or unverified state |
| Preview the local policy | `scripts/apply-repo-policy --dry-run` | Prints current -> desired for every org repository; no writes |
| Apply the local policy | `scripts/apply-repo-policy --apply` | Writes only settings that differ; requires `GH_TOKEN` |

If Task is not installed, run `bash tools/setup.sh` once, then use
`bash tools/task.sh <task>`. The local setup uses no `sudo`, does not modify
shell profiles, and keeps tools in this checkout. Codespaces uses the same
interface through `.devcontainer/devcontainer.json`.

## Set up Pages only

For documentation rollout, use `task github:pages:setup -- --help`. This separate
command requires one named repository in the canonical inventory and a reviewed
saved preview. It refuses `unitree-foxglove-sdk`, archived, disabled, private, or
unverified repositories. The normal workflow reconciles the full inventory, including general settings
and Pages with HTTPS; use the scoped command for a Pages-only request.

After `task setup`, with an existing authorized `GH_TOKEN` in the environment:

```sh
task github:pages:setup -- --repo livingproof-evaluator --dry-run --plan-output pages-plan.json
# Review pages-plan.json before the separately authorized apply:
task github:pages:setup -- --repo livingproof-evaluator --apply --expected-plan pages-plan.json
```

The command creates a confirmed-missing site or changes its build type to
Actions (`workflow`), then reuses the HTTPS-only controller and its policy
exemptions. It never sends a custom domain or source field. The write guard
allows only the selected repository's Pages endpoint and a single
`build_type: workflow` or `https_enforced: true` field. It cannot change general
preferences, release immutability, rulesets, credentials, or permissions.
Existing token access must already permit the requested Pages operation; this
command does not provision access or change the settings workflow.

The saved plan binds repository identity, Pages configuration (including custom
domain and source), the local policy, and inventory. Any mismatch prevents
writes. State is read again immediately before each write, and setup and HTTPS
are verified afterward. GitHub's Pages API does not provide an atomic
compare-and-swap here: concurrent external changes in the final read/write
interval cannot be prevented. A failed or partial operation is not rolled back;
inspect the reported failure and review a fresh preview before retrying.
Certificate provisioning can require a later retry. The plan is a review
precondition, not a credential or authorization grant.

This command configures Pages only. Each repository still needs its reviewed
documentation workflow deployed and its live site verified separately. It does
not dispatch workflows, merge changes, or claim a successful content deployment.

## Apply repository policy

`scripts/apply-repo-policy` compares the local repository
policy with every repository returned by `GET /orgs/Living-Proof-Labs/repos`
and can write the settings that differ. `task github:policy:apply -- --dry-run`
is the same command. It is separate from the reviewed GitHub App workflow in
the [repository operations guide](docs/repository-operations.md): this command
uses only the `GH_TOKEN` you export in the shell.

### Prerequisites

Run `bash tools/setup.sh` once so the wrapper can find the pinned Node. Export
`GH_TOKEN` to a classic personal access token, a fine-grained personal access
token, or a GitHub App installation token. The command reads that variable and
does not accept the token as an argument. It never writes, caches, logs, or
echoes the token. Policy loading reads this checkout without network access.
A later helper may print an installation token; this command only consumes
`GH_TOKEN`.

The token must be able to see the organization's repositories. An installation
token only lists repositories the App installation can access. Discovery is
`GET /orgs/{org}/repos?type=all` (followed by `GET /repos/{owner}/{repo}` and
the settings endpoints below). The command does not call `/user` or
`/user/repos`, so an installation token and a PAT both work. An empty list is
a failure, not a clean run.

### Where the policy comes from

The desired settings are checked in at
[`config/github/repository-policy.json`](config/github/repository-policy.json).
The audit tool, controllers and tests are also local. Every desired setting and
its implementation must be reviewed in this repository. No cross-repository
commit or blob fetch pin is used. The protected workflow binds its saved preview
to the source revision, implementation, policy and inventory before applying it.

`--policy FILE` reads another local JSON file for an explicit policy preview.
Normal operation uses the checked-in file.

### Preview and apply

```bash
export GH_TOKEN  # already set in the environment; do not commit or echo it
scripts/apply-repo-policy --dry-run
scripts/apply-repo-policy --apply
```

`--dry-run` prints each difference as `setting: current -> desired`, then
`outcome: not written (dry-run)`. It sends no REST write and no GraphQL
mutation. It does send read requests, including a GraphQL `query` for
`hasSponsorshipsEnabled`, because that value is not on the REST repository
object. `--apply` writes only the differing settings, then a second run reports
no changes when the reads match the policy. Choose exactly one of the two
flags. `--org` and `--repo` limit the organization list (`--repo` is a name,
not `owner/name`).

A failure to read or write one setting is reported on that repository and the
command continues with the others. The process exits non-zero if any
repository failed. When GitHub omits a merge setting from the repository
object, the error names the missing permission, `Administration: read`.
Settings in `manual_or_unavailable_settings` are named and skipped; they have
no API.

The command does not create a GitHub Pages site. A repository with no site is
skipped for Pages. A 404 from a repository whose `has_pages` is not `false` is
a permission failure, not an absent site. An archived repository is reported
as `skipped (archived)` in both dry-run and apply, and it is left unread and
unwritten.

### Enforce HTTPS

`pages.https_enforced` (boolean) is Enforce HTTPS. When the policy sets it and
the repository already has a Pages site, a difference becomes
`PUT /repos/{owner}/{repo}/pages` with only the Pages fields that differ
(`https_enforced` and, when it also differs, `build_type`). The custom domain
is not sent.

The local policy sets `pages.build_type` to
`workflow` and `pages.https_enforced` to `true`. It exempts `website`
(`HTTPS terminated at Cloudflare`), so `--apply` does not send Enforce HTTPS
for that repository. Other existing Pages sites are updated when Enforce HTTPS
differs. If GitHub rejects a write, the report names the repository, the Pages
setting, and GitHub's error message, then continues with the remaining
repositories and exits non-zero.

### Token permissions

Classic personal access tokens need the `repo` scope. Fine-grained tokens and
GitHub App installation tokens need repository permissions on the
repositories the installation can access:

| Setting | API | Fine-grained PAT / GitHub App |
| --- | --- | --- |
| `repository.*` (wiki, issues, merge, and the other REST fields) | `PATCH /repos/{owner}/{repo}` | Administration: Read and write |
| `graphql.hasSponsorshipsEnabled` | GraphQL `updateRepository` | Administration: Read and write |
| `immutable_releases` | `PUT` or `DELETE /repos/{owner}/{repo}/immutable-releases` | Administration: Read and write |
| `main_ruleset` | `/repos/{owner}/{repo}/rulesets` | Administration: Read and write. If bypass actors are unreadable, the ruleset is not written. |
| `pages.build_type`, `pages.https_enforced` | `GET` and `PUT /repos/{owner}/{repo}/pages` | Pages: Read and write, and Administration: Read and write. Pages writes are an additional permission on top of Administration. |
| Organization repository list | `GET /orgs/{org}/repos` | Metadata: Read (GitHub Apps receive this automatically). Private repositories still require the installation to include them. |
| `manual_or_unavailable_settings` | not called | none; these stay manual |

Metadata read alone cannot change settings. Rivet's engineering App has no
Administration grant. Use the separately approved repository-settings credential
for settings changes; do not broaden Rivet to run this command.

## Repository directory

[`config/github/repositories.json`](config/github/repositories.json) is the
sole inventory of Living Proof Labs repositories. Register a project there by
pull request, then run the validation command above.
[`config/github/agents.json`](config/github/agents.json) is the directory of
agents that have GitHub Apps. It names Rivet, Cody, Vera, and Keel, with each role,
GitHub identity, and App manifest path. An agent without an App is not listed.

Useful references:

- [Local repository policy](config/github/repository-policy.json)
- [Manual UI-setting evidence](config/github/manual-settings-evidence.json)
- [Repository operations guide](docs/repository-operations.md)
- [Manual GitHub App setup](docs/github-app-bootstrap.md)
- [Bot GitHub Apps owner guide](docs/GITHUB-APPS.md)
- [Agent directory](config/github/agents.json)

## Organization documentation

This repository is the single authored source for the organization overview,
vision, architecture and directory published at
[docs.livingprooflabs.com](https://docs.livingprooflabs.com/).
[`docs/site.json`](docs/site.json) lists the published pages, their navigation
order and redirects, including the
[Bot GitHub Apps owner guide](docs/GITHUB-APPS.md).
[`docs/directory.json`](docs/directory.json) describes the
manual and project tables and may name only repositories in the inventory above.
The [root site repository](https://github.com/Living-Proof-Labs/living-proof-labs.github.io)
is the publisher: it builds one pinned commit of this repository and owns the
theme, search, redirect pages and deployment. It keeps no editable copy.

Run `task docs:check` (also part of `task verify`) for missing pages, broken local
links or fragments, unknown directory entries and unsupported Mermaid. The CI job `docs-preview`
also builds this checkout with the publisher at the commit pinned in
`.github/workflows/verify.yml` and runs its link, redirect, navigation, search and
browser checks offline; the preview is uploaded as a review artifact. That
publisher build copies declared Markdown pages only, so the preview job then
copies `docs/media/` into the built site before those checks. Production does
not use that preview step. After a change merges here, the publisher repins
`content.lock.json` in its own reviewed pull request and has to copy
`docs/media/` in its build before the recording is served from the published
site. Publication remains separately authorized.

## Read, verify, and apply

| Operation | Where it runs | Behavior |
| --- | --- | --- |
| Pull-request report | Pull requests | Informational and secret-free; it never changes settings |
| Strict audit | Trusted `main`, manual dispatch, and daily schedule | Fails for observable drift, access errors, or unverified required state |
| Apply repository settings | Manually dispatched trusted-main workflow | Previews every registered repository, then applies its saved plan after environment approval |

Audits never auto-remediate drift. The apply workflow always previews first;
the only workflow choice is preview or protected apply. Both use the complete
checked-in inventory, including `unitree-foxglove-sdk`. Its exclusion in the older
Pages-only command was task-specific, not a standing settings exception.

Use `task github:settings:reconcile -- --dry-run --plan-output artifacts/settings-plan.json`
to inspect the exact changes. After review, use the same task with
`--apply --expected-plan artifacts/settings-plan.json`. The normal workflow saves
and transfers this plan automatically within one run, pinned to its source commit.
It binds inventory, implementation bytes, policy, repository identity and observed
writable state. Ruleset actions have their own exact saved-plan check; newly
visible ruleset details cannot authorize an unreviewed protection change. Changed configuration refuses the whole apply; changed repository state
blocks that repository while the rest continue. Every write has a fresh state
check and readback. Already compliant repositories receive no writes.

General preferences, sponsorships, known immutable-release state and Pages setup
with HTTPS are reconciled. Exceptions must be reviewed in the local policy
manifest with a repository and nonempty reason; unknown or duplicate repository
exceptions fail before requests. The existing `website` Cloudflare exemption
leaves HTTPS unmanaged; it never disables it. Required missing Pages is drift;
unreadable state and certificate-not-ready remain unresolved. Unknown immutable
state (including 404) never authorizes a write. An unreadable component remains
reported while other independently verified components can converge.

Rulesets are reconciled as a **minimum protection baseline**, not an exact
replacement. Missing named repository rulesets are created. Updates preserve
extra rules and unknown parameters, retain higher review counts and stricter
review flags, intersect allowed merge methods, retain existing branch coverage,
and activate enforcement. Every security-sensitive action is disclosed in the
saved plan and must match fresh evidence before the protected apply. No ruleset
is deleted and inherited rulesets are never edited.

Existing bypass actors, excluded branches, unknown ownership, incomplete
protection fields and incompatible merge methods remain unresolved rather than
silently weakening protection or erasing a possible exception. GitHub requires
write-level ruleset access to disclose bypass actors even for a read. Missing
bypass data is unverified, not evidence that bypass actors exist. The supported repository
exception schema is **HTTPS exemptions only**, with `repo` and `reason` in the
local policy. Generic repository overrides are not implemented. Manual-only
settings remain explicitly unverified by this controller; dated legacy audit
evidence is not a fresh measurement. The strict main/scheduled audit uses the
same non-weakening ruleset resolver, so preserved stronger protections pass
both paths; other audit comparisons and manual evidence remain intact.

Every inventory member has JSON and JUnit outcomes plus a job-summary table.
Partial failures do not roll back successful writes or hide later repositories;
apply exits unsuccessfully and requires a fresh preview to retry. Every apply
attempt is followed by another complete read-only audit, with artifacts retained
14 days. Preview uses a short-lived Administration write / Pages read token behind
the protected `repository-administration` environment. The planner disables REST
writes and GraphQL mutations; the token itself technically permits administration
writes. Approving preview authorizes reads only, not a settings apply. Inaccessible
fields still remain unresolved. A reviewer
approves the disclosed verified subset as well as the unresolved entries.
GitHub offers no atomic compare-and-swap for these endpoints, so an external
change in the final read/write interval remains possible. Workflow concurrency
serializes this workflow only. No content deployment or live-manual verification
is implied by Pages setup.

`task github:settings:scenarios` runs the mocked safety scenarios and writes
`artifacts/settings-scenarios.xml`; CI publishes individual results. This work
supersedes the ordinary workflow orchestration proposed in draft #68; that draft
must be reconciled before any later merge. The dedicated Pages command from #71
and legacy CLI remain available, but the normal workflow no longer calls the
legacy unbound apply path.

The audit credential is available only to trusted-main workflows. Never expose
the App key to pull-request, fork, or local shell-profile code. The
[GitHub App guide](docs/github-app-bootstrap.md) covers the selected-repository
installation and the `repository-audit` / `repository-administration`
environment split.

## Bot GitHub Apps

Living Proof Labs uses one private GitHub App for each bot. The manifests
live in [`config/github/apps/`](config/github/apps/). Repository-settings
examples live separately in [`config/github/app-reference-manifests/`](config/github/app-reference-manifests/)
and are not registration targets. The
[owner guide](docs/GITHUB-APPS.md) is the procedure for registering each App,
installing it, and storing the private key. The
[agent directory](config/github/agents.json) lists the agents that have
GitHub Apps, with each role, identity, and manifest path.

| Bot | Manifest | Role |
| --- | --- | --- |
| Rivet | [`rivet.manifest.json`](config/github/apps/rivet.manifest.json) | Head of Engineering and Delivery |
| Cody | [`cody.manifest.json`](config/github/apps/cody.manifest.json) | Software engineer |
| Vera | [`vera.manifest.json`](config/github/apps/vera.manifest.json) | Verification |
| Art | [`art.manifest.json`](config/github/apps/art.manifest.json) | Style and product guidance |
| Keel | [`keel.manifest.json`](config/github/apps/keel.manifest.json) | Repository review and coordination |

Use the [repeatable discovery and owner handoff](docs/GITHUB-APPS.md#repeatable-bootstrap-and-discovery)
before registering anything. Both bootstrap and audit automatically enroll all
manifest files; adding a manifest needs no second App list.

Register an App with the organization manifest flow already supported here
(`task github:apps:form:help`, then the callback and exchange helpers).
Webhooks are off. Engineering Apps do not request Administration. Rivet's
permissions and installation scope are recorded in
[`app-access.json`](config/github/app-access.json), with reasons for each grant.
The dedicated repository-settings credential remains separate.

`task github:apps:audit` checks registration and installation permissions without
changing access. It fails on drift or unavailable evidence. See the
[access audit and limits](docs/GITHUB-APPS.md#audit-existing-app-access).

### Mint an installation token

`scripts/app-token <bot>` reads the App id and the RSA private key from the
environment, signs a short-lived JSON Web Token, finds the App installation
on Living-Proof-Labs, and exchanges it for an installation token. The token
is the only text on standard output.

```bash
scripts/app-token rivet >/dev/null && printf 'Rivet authentication OK\n'
```

| Bot | App id | Private key | Installation id (optional) |
| --- | --- | --- | --- |
| rivet | `RIVET_GITHUB_APP_ID` | `RIVET_GITHUB_APP_PRIVATE_KEY` | `RIVET_GITHUB_APP_INSTALLATION_ID` |
| cody | `CODY_GITHUB_APP_ID` | `CODY_GITHUB_APP_PRIVATE_KEY` | `CODY_GITHUB_APP_INSTALLATION_ID` |
| vera | `VERA_GITHUB_APP_ID` | `VERA_GITHUB_APP_PRIVATE_KEY` | `VERA_GITHUB_APP_INSTALLATION_ID` |
| keel | `KEEL_GITHUB_APP_ID` | `KEEL_GITHUB_APP_PRIVATE_KEY` | `KEEL_GITHUB_APP_INSTALLATION_ID` |

Put the PEM text in the private-key variable. A file path is rejected. A
value stored with literal `\n` sequences is accepted. When the installation
id is unset, the command looks up
`GET /orgs/Living-Proof-Labs/installation`. `GITHUB_APP_ORG` selects a
different organization login. Errors go to standard error and omit the key,
the signed JSON Web Token, and the installation token. Both secrets stay in
memory. `task github:app-token:help` prints the same usage text.

Creating each App from its manifest, installing it on the organization, and
storing the private key are owner steps. This public repository holds no
secrets.
