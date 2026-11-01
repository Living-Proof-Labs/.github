# Living Proof Labs

Helping robots help humans through clear capability requirements, inspectable
evidence, and understandable reports.

- **New to LPL?** Start with the [welcome page](profile/README.md).
- **Working on verification?** Read the [verification architecture proposal](docs/architecture/verification-architecture.md).
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
