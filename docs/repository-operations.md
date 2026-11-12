# Repository operations

Use this guide to register repositories, audit their settings, and run the
review-gated apply workflow. It complements the
[manual GitHub App setup](github-app-bootstrap.md), which explains the
credential and environment configuration.

## Local interface

| Task | Use |
| --- | --- |
| `task` | List organization operations |
| `task setup` | Install pinned local Node and Task on supported Debian hosts |
| `bash tools/task.sh verify` | Validate the inventory and run unit tests |
| `task github:settings:report` | Read-only report; existing drift does not change its exit status |
| `task github:settings:check` | Read-only audit; drift or unverified state fails |

If Task is absent, use `bash tools/setup.sh` once and then
`bash tools/task.sh <task>`. Tools stay in `.tools/`; setup neither uses
`sudo` nor changes a shell profile.

## Register a repository

1. Add the repository name to
   [`config/github/repositories.json`](../config/github/repositories.json).
2. Update the App installation selection when access is intentionally scoped to
   selected repositories.
3. Run `bash tools/task.sh verify` and open a pull request.

The inventory is the only organization-wide repository list. Do not duplicate
it in policy tooling or another repository.

## Interpret audit results

| Result | Meaning | Next step |
| --- | --- | --- |
| Pass | Automated measurement matches policy | None |
| Failure | An observable, programmatically manageable setting differs | Review and use the apply workflow when authorized |
| Warning | A dated manual observation conflicts with policy | Correct it manually and refresh evidence |
| Unverified | The setting cannot be read or has no current observation | Obtain the required read access or record a fresh manual observation |
| Error | The audit encountered an unexpected application programming interface (API) or execution error | Diagnose before treating the setting as compliant |

The strict audit compares `pages.https_enforced` on a repository that already
has a Pages site. A repository with no Pages site is not an Enforce HTTPS
failure. The pinned collaboration-guidelines v7.10.0 policy lists `website`
in `pages.https_enforced_exempt` with reason `HTTPS terminated at Cloudflare`.
That repository is reported as `exempt (HTTPS terminated at Cloudflare)` and
is not drift. The exemption list must be non-empty, and it is accepted only
when `pages.https_enforced` is true. When a non-exempt site exists and
`pages.https_enforced` cannot be read, strict mode is incomplete (exit 3):
the summary names the unknown value, and the audit is not compliant. The
unknown value is not counted as drift. Confirmed drift still counts; if
unknown evidence and drift are both present, the exit stays incomplete and
the summary keeps the difference count. Report mode prints that same
incomplete summary and exits 0.

UI-only evidence lives in
[`config/github/manual-settings-evidence.json`](../config/github/manual-settings-evidence.json).
It is dated evidence, not a current API measurement.

## Apply a reviewed change

Open **Actions → Apply repository settings → Run workflow** on `main`. Select
one registered repository and leave **Apply** unchecked for the initial
preview.

| Input | Effect |
| --- | --- |
| `apply` | Writes ordinary pinned settings after the preview |
| `apply_main_ruleset` | Adds the separately scoped main-ruleset change |
| `include_release_immutability` | Allows immutability writes when the API state is unknown |

An apply run uses `repository-administration`, requires its environment review,
and finishes with strict all-repository verification plus a 14-day JUnit
test-result artifact. It never runs from pull-request or fork code.

## Apply the pinned policy with a token

[`scripts/apply-repo-policy`](../scripts/apply-repo-policy) compares the policy
pinned in
[`config/github/repository-policy.json`](../config/github/repository-policy.json)
with every repository from `GET /orgs/Living-Proof-Labs/repos`. `--dry-run`
prints `current -> desired` and does not write. `--apply` writes only settings
that differ. The credential is `GH_TOKEN` in the environment: a personal
access token or a GitHub App installation token. Rivet's installation token
comes from the [Bot GitHub Apps owner guide](GITHUB-APPS.md). The command lists
repositories with the organization endpoint and does not call `/user`.

Token permissions, the Pages Enforce HTTPS field, and examples are in the
[repository README](../README.md#apply-repository-policy). The workflow above
remains the environment-gated apply path. The pinned v7.10.0 policy sets
`pages.https_enforced` and exempts `website`. The command applies that boolean
on other repositories that already have a Pages site, and it does not send
Enforce HTTPS for an exempt repository. A Pages write that GitHub rejects is
reported for that repository; the command continues with the others.

## Automation behavior

Pull requests run an informational, secret-free report. Trusted `main`, manual
dispatch, and the daily schedule run the strict audit through
`repository-audit`; they fail for drift or unverified state and retain JUnit
artifacts for 14 days. The schedule is `16:17` Coordinated Universal Time
(UTC): 02:17 Australian Eastern Standard Time or 03:17 Australian Eastern
Daylight Time. GitHub cron does not track daylight-saving transitions.

No audit auto-remediates drift. Review a policy change and use the manual apply
workflow when a write is intended.
