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

## Settings ownership

This checkout owns `config/github/repository-policy.json`, the audit tool,
controllers and their tests. Policy changes and implementation changes are
reviewed together here. Audit, preview and apply load local files; none fetches
settings code or policy from collaboration-guidelines. The workflow still binds
preview and apply to the same reviewed source revision and policy digest.

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
failure by itself, but required Pages absence counts as Pages drift. Inaccessible
Pages is unverified. The local policy lists `website`
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

The strict main/scheduled audit and normal reconciliation share the same
non-weakening ruleset resolver. Protection that meets or exceeds the baseline
passes both; weaker or missing protection is drift, and inaccessible or conflicting
protection is unverified. The read-only wrapper replaces the local audit helper's
exact ruleset comparison before rendering the summary and JUnit, while retaining
all other setting evidence and dated manual observations. It does not perform
ruleset writes or expand token permissions.

UI-only evidence lives in
[`config/github/manual-settings-evidence.json`](../config/github/manual-settings-evidence.json).
It is dated evidence, not a current API measurement.

## Apply a reviewed change

Open **Actions → Apply repository settings → Run workflow** on `main`.
**Apply** is the only input and defaults to false. Every run previews the entire
canonical inventory; there is no repository selector, HTTPS mode, or scope
checkbox. Normal reconciliation includes general settings, sponsorships, known
immutable-release state, Pages setup and HTTPS. Repository-specific HTTPS
exceptions come from the local policy manifest with validated names and reasons.
The `website` exemption leaves HTTPS unmanaged, never disabled.

Review the JSON plan and per-repository summary before approving
`repository-administration`. The plan binds source, implementation bytes,
inventory, policy, identity and writable observations. Global binding changes
refuse all writes; stale repository evidence blocks that repository, while later
entries continue. Every write has a fresh state check and readback. After a successful settings
write, a readback that exactly repeats the complete known pre-write snapshot
can be read again after 1, 2 and 4 seconds. Writes are never repeated. Only an
exact expected whole-settings snapshot allows the settings loop to continue;
unknown values, read errors or unrelated changes stop it immediately. A mismatch
that outlasts the read budget remains a failure even if the final audit passes.
The JSON and JUnit reports retain `settingsReadbacks`: the setting, before and
expected snapshots, each observed snapshot (or read error), attempt number,
delay and outcome. Existing credential redaction covers these artifacts and
standard output. Final strict verification and per-repository isolation remain
required. Unknown
immutable state never authorizes enabling it. Rulesets are reconciled without lowering protection: create missing named
repository rulesets, preserve extra rules, retain higher review counts and
stricter review flags, intersect merge methods and preserve branch coverage.
Each ruleset action has an exact saved-plan check before writing and fresh
readback. Newly readable ruleset state cannot authorize an unreviewed action;
unrelated reviewed work can continue.

Bypass actors, excluded branches, inherited or unknown ownership, incomplete
fields and incompatible merge methods remain explicit unresolved results. Hidden
bypass details at preview therefore prevent that update. This is a real access
boundary, not a successful reconciliation. No new token grant is included.
The only supported repository-specific exception schema is the local policy's
HTTPS `repo`/`reason` entries; generic overrides are not implemented.

The full local interface is:

```sh
task github:settings:reconcile -- --dry-run --plan-output artifacts/settings-plan.json
task github:settings:reconcile -- --apply --expected-plan artifacts/settings-plan.json
```

Preview and apply both use the protected `repository-administration` environment.
Preview requests a short-lived Administration write / Pages read token because
GitHub withholds ruleset bypass actors without write-level access. Its planner
disables REST writes and GraphQL mutations. Preview approval authorizes reads
only; apply requires a separate approval of its saved plan and Pages write access.
The shared App key can mint broader tokens, so trusted-main access remains a
security boundary; see the [App guide](github-app-bootstrap.md).

Partial failures and certificate-not-ready remain unresolved, with a nonzero
apply exit and full-inventory readback. JSON, JUnit and summaries are retained
for 14 days. Compliant repositories receive no writes. A partial run needs a
fresh reviewed preview before retry. GitHub cannot atomically bind these reads
to writes; external changes in that interval remain a risk. Pages setup does not
deploy content. Manual-only settings remain explicitly unverified by this controller.

## Apply the local policy with a token

[`scripts/apply-repo-policy`](../scripts/apply-repo-policy) compares the policy
checked in
[`config/github/repository-policy.json`](../config/github/repository-policy.json)
with every repository from `GET /orgs/Living-Proof-Labs/repos`. `--dry-run`
prints `current -> desired` and does not write. `--apply` writes only settings
that differ. The credential is `GH_TOKEN` in the environment: a personal
access token or a dedicated repository-settings App installation token with
separately approved settings authority. Rivet's engineering App has no
Administration grant and is not the settings credential. The command lists
repositories with the organization endpoint and does not call `/user`.

Token permissions, the Pages Enforce HTTPS field, and examples are in the
[repository README](../README.md#apply-repository-policy). The workflow above
remains the environment-gated apply path. The local policy sets
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
