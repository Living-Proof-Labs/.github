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

If Task is not installed, run `bash tools/setup.sh` once, then use
`bash tools/task.sh <task>`. The local setup uses no `sudo`, does not modify
shell profiles, and keeps tools in this checkout. Codespaces uses the same
interface through `.devcontainer/devcontainer.json`.

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

## Bot GitHub Apps

Living Proof Labs uses one private GitHub App for each bot. The manifests
live with the repository-settings manifests in
[`config/github/apps/`](config/github/apps/):

| Bot | Manifest | Role |
| --- | --- | --- |
| Rivet | [`rivet.manifest.json`](config/github/apps/rivet.manifest.json) | Head of Engineering and Delivery |
| Cody | [`cody.manifest.json`](config/github/apps/cody.manifest.json) | Software engineer |
| Vera | [`vera.manifest.json`](config/github/apps/vera.manifest.json) | Verification |
| Keel | [`keel.manifest.json`](config/github/apps/keel.manifest.json) | Strategy |

Register an App with the organization manifest flow already supported here
(`task github:apps:form:help`, then the callback and exchange helpers).
Webhooks are off. Only Rivet's manifest requests Administration write and
Pages write, which `scripts/apply-repo-policy` needs when it writes repository
settings and GitHub Pages. The repository-settings audit and apply manifests
stay Administration and Metadata only. They are the trusted-main workflow
credential, separate from these bots.

### Mint an installation token

`scripts/app-token <bot>` reads the App id and the RSA private key from the
environment, signs a short-lived JSON Web Token, finds the App installation
on Living-Proof-Labs, and exchanges it for an installation token. The token
is the only text on standard output.

```bash
GH_TOKEN=$(scripts/app-token rivet) scripts/apply-repo-policy --dry-run
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
