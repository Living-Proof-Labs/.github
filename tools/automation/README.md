# CI Automation: dormant bundle operations

Proposal for [verification #105](https://github.com/Living-Proof-Labs/livingproof-verification/issues/105).
Nothing here creates an App, installs it, changes permissions, creates an environment,
or activates a workflow. The template deliberately remains outside `.github/workflows`.
The reference manifest is outside `config/github/apps`, so bootstrap cannot enroll it.
Do not reuse the administration App or an all-repository agent key.

## Custody and execution

Confirmed service name: **CI Automation**, owned by Living Proof Labs. This is the
general CI service identity; Renovate bundle completion is its first use case.
Additional uses require separately reviewed adapters and scope decisions.
Proposed installation: **selected repositories**,
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
main/head/branch/file allowlists and lease before producing validated head/PR/branch
outputs via verification's `bundle_operations.py`. Queue consumes those outputs only,
with the existing `expectedHeadOid` and `jump: false`. Optional CI is informational;
configured GitHub protections are authoritative. Do not add status gates or bypasses.
If publication or enqueue has an uncertain outcome, inspect the remote before retry.
A failed queue may be rerun from retained successful job outputs; do not rerun the
entire publication flow to recover. Recovery after output expiration is not implemented.
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

## Audit limitation and provisioning handoff

`config/github/app-access.json` requires real positive App/installation IDs and records
installed identities. Leave it unchanged until registration/installation is authorized
and their actual identities are known; never invent placeholder IDs. At that time add
this manifest to registration enrollment and record the selected target and each
permission justification in the access registry.

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

Rivet handoff, all still pending:

1. Independent review of both draft changes, including the trusted adapter output API.
2. The App name is **CI Automation**. Owner confirms an available slug and approves
   registration, initial selection, environment
   branch policy, key custody/rotation/revocation and accepted permissions. No provisioning
   is performed by this proposal. No bypass or Administration may be granted.
3. After merging the reviewed adapter, independently verify public read access using the
   workflow token and assess central/target main trust and environment restrictions.
4. A separate activation PR installs only this central template; audit the existing
   repository protections and record the informational-check risk without changing them.
5. Demonstrate distinct reporter and verifier releases from discovery through automatic
   completion/normal queue/mainline reports/Pages. Preserve custom commits, demonstrate
   concurrent stale-head refusal, and link exact runs and publication evidence. Mocked
   tests and draft PR CI do not establish either live-release demonstration.
