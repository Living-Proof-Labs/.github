# Manual GitHub App setup

Use this short browser-based procedure when an organization owner is ready to
give the settings audit its own credential. It does not require Node,
Codespaces, a manifest callback, or any command from this repository.

## What this enables

With the two environments below configured, the App supports an unattended
strict audit on `main` and the daily schedule, plus an explicitly dispatched,
inventory-wide or one-repository preview/apply workflow. Pull-request audits remain **read-only,
informational, and secret-free**.

The built-in `GITHUB_TOKEN` deliberately remains `contents: read`; it produces
an access-limited report. It cannot complete the fleet audit or verify hidden
ruleset bypass actors. The App key is available only to trusted `main` code.

## Manual owner checklist

1. In GitHub, open **Living-Proof-Labs → Settings → Developer settings →
   GitHub Apps → New GitHub App**.
2. Name it `Living Proof Labs repository settings administration`. Set an
   owner-visible description such as “Audits and administers registered
   repository settings.” Set the homepage URL to
   `https://github.com/Living-Proof-Labs/.github`. Choose **Only on this
   account**, disable the webhook, and leave the callback URL blank: this App
   does not authenticate interactive users.
3. Under **Repository permissions**, choose **Administration: Read and write**
   and **Pages: Read and write**. GitHub supplies Metadata read automatically.
   Request no other permissions
   and subscribe to no events. Create the App. This single App can later mint
   short-lived tokens for audit and deliberately reviewed settings changes.
   For an existing App, edit these permissions in its GitHub settings, save,
   then approve the update on its installation. That persistent access change
   requires explicit owner approval; merging a manifest does not change GitHub.
4. Generate a private key and store the downloaded PEM in a password manager
   or another secure local secret store. It is shown only at download time;
   never commit it, paste it into a PR, or put it in a shell profile. Record
   the App's **Client ID** separately; it is not secret. The workflow uses the
   Client ID, not the numeric App ID.
5. Click **Install App**. Choose **Living-Proof-Labs**, then **Only select
   repositories**. Select exactly the repositories in
   [`config/github/repositories.json`](../config/github/repositories.json),
   including `.github`. Do not choose “All repositories.”
6. Keep the PEM outside this checkout. It is used only as the protected
   environment secret described next; the workflow mints short-lived
   installation tokens itself. Never use the key in a pull request, fork, or
   local shell profile.

Configure these two environments in `.github`.

1. Create **`repository-audit`**. Restrict deployments to `main`; do **not**
   add a required reviewer. Add `REPO_ADMIN_APP_CLIENT_ID` as an environment
   variable and the PEM as `REPO_ADMIN_APP_PRIVATE_KEY` environment secret.
   This lets the post-merge and daily strict audits run without a daily owner
   approval prompt, including their ruleset-bypass checks.
2. Create **`repository-administration`**. Restrict deployments to `main`, add
   the owner as a required reviewer, and add the same Client ID variable and
   PEM secret. This environment gates only the manually dispatched write path.

The tradeoff is intentional: the existing strict audit receives Administration write and
Pages read to reveal managed ruleset data. The new normal preview requests
Administration read and Pages read; unavailable protection details are unverified. The apply
job requests Administration write and Pages write. The same App key is present
in both environments, so the audit environment could mint broader tokens if
trusted workflow code were changed. Its task is read-only, not its underlying
credential authority. It runs
only trusted `main` code and its task is read-only, but anyone able to merge
malicious workflow code to `main` could misuse that token. Keep `main` write
access limited to trusted maintainers and retain the selected-repository App
installation scope. The write workflow adds an independent reviewer gate.

Then use **Actions → Apply repository settings → Run workflow** on `main`.
The only input is **Apply**, false by default. Every run previews every repository
in the canonical inventory, including Pages setup and HTTPS. Registration defines
the selection; adding a repository neither applies it nor expands access.

Review the complete preview artifact and job summary, including unresolved
entries, before approving the protected apply job. The same source revision and
saved plan are used for both jobs. Inventory, implementation, policy or revision
changes refuse apply; changed writable repository evidence blocks that repository
while others continue. Writes have fresh preconditions and readback. Unknown
immutable state does not authorize writes. Rulesets are reconciled through separately bound actions that preserve stronger
review requirements, extra rules and branch coverage. The protected approval
covers the exact disclosed creations/updates; no ruleset deletion is permitted.
Inherited rulesets, existing bypass actors/exclusions and incompatible or
unreadable state remain unresolved. If apply reveals previously unreadable
ruleset details, it cannot add that unreviewed action; other reviewed changes
can proceed. In particular, hidden bypass actors may prevent previewing an
update with read authority. No broader token grant is included.

Only HTTPS repository exemptions are supported in the pinned manifest, using
`repo` and `reason`; generic overrides are not implemented. The website
Cloudflare exception remains unmanaged.

A preview may produce a complete plan with unresolved outcomes. Its original
failure is recorded in the summary. Approval authorizes only disclosed, verified
changes; unknown state is never compliant. Partial apply fails explicitly,
continues other repositories, and requires a fresh preview before retry. Each
apply is followed by complete readback. JSON, JUnit and summaries are retained
14 days. A second compliant run makes no writes. Certificate-not-ready and denied
access stay unresolved. Pages setup does not deploy documentation content.

See [repository operations](repository-operations.md) for commands and the
remaining final read/write race limitation. No workflow automatically remediates
later drift or expands the App installation's repository scope.

GitHub documents App registration and installation in its
[GitHub App guide](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app)
and [installation guide](https://docs.github.com/en/apps/using-github-apps/installing-your-own-github-app).

## What remains before applying settings

An installation token from this App can read ruleset bypass actors and perform
authorized settings changes. It is minted only in trusted-main audit code or
the protected manual write workflow, never in a pull-request or fork workflow.

The normal workflow uses a bound inventory plan and never writes unknown
immutable state. If additional authority makes previously unknown writable state
readable at apply, that changed evidence rejects the repository rather than
silently expanding the approved writes. This is a deliberate safety limit; the
workflow does not broaden preview grants to avoid it.

The legacy generic helper and local CLI remain available for separately scoped
work, but are no longer the normal workflow's write path. Their broader apply
behavior must not be confused with a Pages-only request. The existing
[Pages-only command](../README.md) remains separate; no identity or grant is added.

## Optional versioned manifests

The JSON files in `config/github/apps/` and the `github:apps:*` helper tasks
remain optional infrastructure-as-code references. They are not required for
the manual setup above. The manifest path is useful only when an owner already
has the necessary App-registration access and wants to reproduce the same
configuration programmatically.

`config/github/app-reference-manifests/repository-settings-audit.manifest.json` and
`config/github/app-reference-manifests/repository-settings-apply.manifest.json` describe the settings credential
as two role definitions: audit requests Administration read, Pages read and
Metadata read; apply requests Administration write, Pages write and Metadata
read. These reference manifests do **not** describe two installed Apps. The
manual setup above uses one shared App with write authority and deliberately
requests narrower Pages access in audit tokens. Its Administration-write audit
requirement and shared-key exposure are described above. Registering separate
Apps would be a separate design and owner-approved credential change.

`rivet.manifest.json`, `cody.manifest.json`, and `vera.manifest.json` are
private Apps, one per bot, for the same organization
manifest flow (`task github:apps:form:help`). Webhooks stay off. Only the
Rivet manifest requests Pages write; no engineering App requests Administration. Minting a bot
installation token is described in the repository README under
[Bot GitHub Apps](../README.md#bot-github-apps). Creating and installing those
Apps is the [owner guide](GITHUB-APPS.md). The
[agent directory](../config/github/agents.json) lists the agents that have
GitHub Apps, with each role and manifest path. It does not list every agent.
