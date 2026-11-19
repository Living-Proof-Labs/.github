# CI Automation: blocked activation candidate

Work for [verification #105](https://github.com/Living-Proof-Labs/livingproof-verification/issues/105).
The reference template in this directory remains outside `.github/workflows` and
cannot run on its own. The reference manifest remains outside `config/github/apps`.
However, [draft #144](https://github.com/Living-Proof-Labs/.github/pull/144) includes
an installed candidate at `.github/workflows/bundle-completion.yml`, an enrolled
manifest at `config/github/apps/ci-automation.manifest.json`, and its access registry
entry. **Merging #144 installs the hourly/manual writer on trusted main and is an
activation step.** The schedule may run after merge; no later template-copy PR is
needed. Keep this draft blocked until independent review, separately authorized
protection application/readback and hosted enforcement evidence are complete.
This change does not provision an App, key or environment, or grant permissions.
Do not reuse the administration App or an all-repository agent key.

## Custody and execution

Confirmed service name: **CI Automation**, owned by Living Proof Labs. This is the
general CI service identity; Renovate bundle completion is its first use case.
Additional uses require separately reviewed adapters and scope decisions.
Recorded installation scope: **selected repositories**,
initially only `Living-Proof-Labs/livingproof-verification`. `.github` does not need to
be selected: its ordinary read-only workflow token checks out operations code and
handles same-run artifacts. Keep the private key solely in `.github`'s dedicated
`ci-automation` environment as `CI_AUTOMATION_APP_PRIVATE_KEY`; keep the App ID in
`CI_AUTOMATION_APP_ID`. Restrict that environment to the exact `main` branch, exclude tags,
and review its deployment policy before any binding. No repository/organization-wide
key and no reusable workflow accepting arbitrary caller commands or `secrets: inherit`.

The scheduled/manual workflow must run from `.github` main. Each job checks out
`github.sha` without persistent credentials. A local guard additionally checks the
repository, ref, event and workflow identity before token creation. This is defense
in depth: the GitHub environment branch restriction is the actual key-access boundary;
a local guard cannot constrain malicious workflow code already trusted on main.

The preparation job has no environment/key. It captures verification's current main
SHA, checks out that immutable SHA, and uses the existing repository-specific adapter
(`bundle_proposal.py`, `update_bundle.py`). This deliberately permits trusted target
main code rather than a release tag: eligibility requires current main and the exact
same SHA is reused for publication/queue. The exception lasts while this adapter
requires current-main comparison. PR blobs remain inert input; no PR checkout occurs.
This first adapter assumes a public repository; private targets require a separately
reviewed read-token isolation design, not adding the key to generation.

Publication and queue run on separate fresh hosted runners. They execute only captured
trusted code, install no dependencies and never check out the candidate. Each mints
its own one-repository token with explicit permissions; the pinned token action revokes
it at job end (including failure). The token's visible repository list must contain
exactly the target before use. Missing or excessive scope fails closed. No token/key
is passed through job outputs or uploaded. Abrupt runner loss can prevent revocation;
installation tokens expire after one hour.

Publication verifies the prepare digest, same-run artifact name (run ID and attempt),
main/head/branch/file allowlists and lease before producing validated outputs through
verification's `bundle_operations.py`. It then saves a publication receipt containing
the repository, PR, branch, completion head, captured base, plan digest, central workflow
SHA/ref, run ID/attempt and timestamp. The same-run immutable artifact ID and receipt
SHA-256 come from the successful publication job outputs, never candidate input.

Queue downloads that exact artifact without a cross-run token. Admission requires
individual successful `checks`, `bundle-release-engine`, `renovate` and
`verification` check runs from GitHub Actions App 15368. Each must have a unique
check identity and the exact published head, bound through its suite to the unique
successful `pull_request` run of its canonical workflow and captured base. A successful
workflow summary does not substitute for a missing, skipped or neutral check. All four
check identities and their trusted run/attempt identities are snapshotted and
revalidated immediately before enqueue. Public REST
reads carry no App credential; denial/rate limiting, missing, truncated, ambiguous,
pending, failed, skipped or stale evidence refuses. No Checks/Actions grant is added.

Admission also requires active no-bypass rulesets with strict required status contexts
`checks`, `bundle-release-engine`, `renovate` and `verification`, each attributed to
GitHub Actions App 15368, and an ALLGREEN merge queue. All four must be present;
accepting optional additional contexts is not sufficient. The first three contexts
come from `checks.yml`, whose complete successful run is required above; `verification`
comes from `verify.yml`. Existing PR and merge-group workflows supply these checks. Server enforcement provides
fresh merge-group verification for a base race after the client's final base read;
client checks alone cannot atomically lease the base. Missing protections cause refusal;
this proposal never applies them. Queue retains `expectedHeadOid` and `jump: false`.

Queue waits for not-yet-reported or pending CI with at most 25 admission reads, one
minute apart. Failed/skipped/ambiguous checks, inaccessible evidence, protection
failures and uncertain mutations are never automatically retried. The 30-minute
job timeout remains below installation-token expiry. After a failed queue job, rerun **failed jobs only** on the original workflow run. Its
successful publication outputs identify the immutable receipt, even when run attempt
changes. The receipt allows at most two additional attempts and expires after 24 hours;
artifact retention is one day. Queue first reads current PR/queue state: already queued
at the recorded head is a no-op; an uncertain read or changed head/base refuses. Each
retry revalidates CI and protections; never repeat publication as recovery. This avoids
rediscovering a completion through Renovate's single-original-commit discovery filter.

If publication succeeded but output/receipt persistence was interrupted, or the receipt
expired/is unavailable, automatic recovery refuses. Inspect the remote and seek a new
reviewed recovery decision in issue #105; do not fabricate a receipt or republish. A
closed/merged PR likewise refuses without mutation. No claim is made that a partial
upload, lost output or changed base can be recovered automatically.
Only one writer may be activated: concurrency groups are repository-local, so the old
verification-local template must remain dormant even though its group name matches.

## Permission review

| Permission | Reason |
| --- | --- |
| Metadata read | Repository identity and token repository readback |
| Contents write | Create blobs/tree/commit, push descendant with exact-head lease; retain repository write access for normal queue entry |
| Workflows write | Publication can change `.github/workflows/verify.yml`; omitted from the queue token |
| Pull requests write | Eligibility reads and normal enqueue mutation |

No Administration, Actions, Checks, Issues, bypass role or organization permission.
Prepare uses the `.github` read-only token for public reads; same-run artifact download
uses Actions' built-in run access, not App Actions permission. Post-merge observation
is separate and may need a separately scoped read credential.

GitHub documents [explicit token repository/permission narrowing](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app),
[workflow-file write permission](https://docs.github.com/en/rest/git/trees#create-a-tree),
and [write access for queue entry](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue).
The pinned `actions/create-github-app-token` v3.3.0 action schema supports the explicit
permission inputs. This is a code/API requirement review, not a successful live token
or enqueue permission probe. Confirm accepted grants and real enqueue behavior during
separately authorized provisioning; do not broaden automatically on refusal.

## Audit limitation and activation handoff

`config/github/app-access.json` requires real positive App/installation IDs and records
installed identities. This candidate records the previously verified nonsecret App
and installation IDs, selected target and permission justifications, and enrolls the
manifest. Registry enrollment documents existing access; it is not a new permission
grant or proof of live scope. Never invent placeholder IDs.

The current audit compares registration/installation identity, accepted permissions,
suspension and `repository_selection`. For `selected`, it explicitly returns
**unverified**: `/orgs/{owner}/installations` does not enumerate full membership.
Neither our narrowed `/installation/repositories` result nor a selected token response
proves the installation has no additional repositories. Keep that limitation visible.
For independent provisioning review, capture dated owner installation-settings readback
of the full selected list, App/installation IDs and accepted grants. Retain the audit's
machine status as unverified until a separately reviewed authoritative full-membership
collector exists. Do not turn manual evidence or narrowed visibility into a compliant
machine result. Existing audit tests assert this refusal.

Remaining activation prerequisites:

1. Independent review of both draft changes, including the trusted adapter output API.
2. Reconfirm the recorded **CI Automation** identity, selected installation scope,
   environment branch policy, key custody/rotation/revocation and accepted permissions
   using owner readback. No bypass or Administration may be granted.
3. After merging the reviewed adapter, independently verify public read access using the
   workflow token and assess central/target main trust and environment restrictions.
4. Separately authorize and apply the four-context strict, no-bypass protection
   contract, then record fresh readback and successful/failing merge-group evidence.
   This draft does not apply protections. Authorizing merge of #144 is authorizing
   writer installation; keep it blocked until these prerequisites are satisfied.
5. Demonstrate distinct reporter and verifier releases from discovery through automatic
   completion/normal queue/mainline reports/Pages. Preserve custom commits, demonstrate
   concurrent stale-head refusal, and link exact runs and publication evidence. Mocked
   tests and draft PR CI do not establish either live-release demonstration.
