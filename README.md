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

This repository is the operator entry point for the organization inventory and
repository-settings policy. The generic policy/tool is a released dependency of
`collaboration-guidelines`; this repository supplies the inventory and
organization-specific operating choices.

### Quick start

| Goal | Command | Result |
| --- | --- | --- |
| List available operations | `task` | Shows organization tasks |
| Bootstrap a Debian host | `task setup` | Installs pinned Node and Task under `.tools/` |
| Validate this checkout | `bash tools/task.sh verify` | Checks inventory and tests |
| Inspect settings drift | `task github:settings:report` | Read-only report; does not fail for existing drift |
| Enforce settings policy | `task github:settings:check` | Read-only audit that fails for drift or unverified state |
| Preview the pinned policy | `scripts/apply-repo-policy --dry-run` | Prints current -> desired for every org repository; no writes |
| Apply the pinned policy | `scripts/apply-repo-policy --apply` | Writes only settings that differ; requires `GH_TOKEN` |

If Task is not installed, run `bash tools/setup.sh` once, then use
`bash tools/task.sh <task>`. The local setup uses no `sudo`, does not modify
shell profiles, and keeps tools in this checkout. Codespaces uses the same
interface through `.devcontainer/devcontainer.json`.

## Apply repository policy

`scripts/apply-repo-policy` compares the collaboration-guidelines repository
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
echoes the token, and it does not send the token when it downloads the policy.
A later helper may print an installation token; this command only consumes
`GH_TOKEN`.

The token must be able to see the organization's repositories. An installation
token only lists repositories the App installation can access. Discovery is
`GET /orgs/{org}/repos?type=all` (followed by `GET /repos/{owner}/{repo}` and
the settings endpoints below). The command does not call `/user` or
`/user/repos`, so an installation token and a PAT both work. An empty list is
a failure, not a clean run.

### Where the policy comes from

By default the command reads the pin in
[`config/github/repository-policy.json`](config/github/repository-policy.json):
the `commit` and `policy_blob_sha` of `config/github/repository-policy.json` in
collaboration-guidelines. It downloads that commit over HTTPS and refuses to
continue unless the git blob SHA matches. The tag is recorded in the pin and
is not the fetch ref, because a moved tag would change the policy without a
review in this repository. That is the same commit-and-blob pin the settings
audit already uses.

`--policy FILE` reads a local JSON file and does not check a blob SHA. Use it
to review a policy revision before this repository's pin moves. A normal apply
uses the pin.

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
repository failed. Settings in `manual_or_unavailable_settings` are named and
skipped; they have no API.

The command does not create a GitHub Pages site. A repository with no site is
skipped for Pages. A 404 from a repository whose `has_pages` is not `false` is
a permission failure, not an absent site.

### Enforce HTTPS

`pages.https_enforced` (boolean) is Enforce HTTPS. When the policy sets it and
the repository already has a Pages site, a difference becomes
`PUT /repos/{owner}/{repo}/pages` with only the Pages fields that differ
(`https_enforced` and, when it also differs, `build_type`). The custom domain
is not sent.

The pinned policy blob `2e268a4208f5c55d85f4b3ecb7e21ef9a1e56927`
(collaboration-guidelines `v7.9.0`, commit
`abd193684ab2baad7abaa1a843d802dc2353faf5`) sets `pages.build_type` to
`workflow` and `pages.https_enforced` to `true`. `--apply` writes Enforce
HTTPS when an existing Pages site differs. If GitHub rejects that write, the
report names the repository, the Pages setting, and GitHub's error message,
then continues with the remaining repositories and exits non-zero.

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

Metadata read alone cannot change settings. The App manifests already in this
repository request Administration and Metadata only, so they cannot enforce
HTTPS until the App that mints `GH_TOKEN` also has Pages: Read and write.
This command does not install an App or mint a token.

## Repository directory

[`config/github/repositories.json`](config/github/repositories.json) is the
sole inventory of Living Proof Labs repositories. Register a project there by
pull request, then run the validation command above.

Useful references:

- [Pinned repository policy](config/github/repository-policy.json)
- [Manual UI-setting evidence](config/github/manual-settings-evidence.json)
- [Repository operations guide](docs/repository-operations.md)
- [Manual GitHub App setup](docs/github-app-bootstrap.md)

## Organization documentation

This repository is the single authored source for the organization overview,
vision, architecture and directory published at
[docs.livingprooflabs.com](https://docs.livingprooflabs.com/).
[`docs/site.json`](docs/site.json) lists the published pages, their navigation
order and redirects; [`docs/directory.json`](docs/directory.json) describes the
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
| Apply repository settings | Manually dispatched trusted-main workflow | Previews one registered repository, then writes only after explicit inputs and environment approval |

Audits never auto-remediate drift. The apply workflow always previews first;
ordinary settings, main protection, and release immutability are separately
scoped inputs. It follows every apply attempt with strict fleet verification.

The audit credential is available only to trusted-main workflows. Never expose
the App key to pull-request, fork, or local shell-profile code. The
[GitHub App guide](docs/github-app-bootstrap.md) covers the selected-repository
installation and the `repository-audit` / `repository-administration`
environment split.
