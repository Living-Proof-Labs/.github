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

The tradeoff is intentional: ordinary preview and the strict audit receive
Administration write and Pages read because GitHub otherwise cannot reveal all
managed ruleset data. HTTPS-only preview requests Administration read instead. The apply
job requests Administration write and Pages write. The same App key is present
in both environments, so the audit environment could mint broader tokens if
trusted workflow code were changed. Its task is read-only, not its underlying
credential authority. It runs
only trusted `main` code and its task is read-only, but anyone able to merge
malicious workflow code to `main` could misuse that token. Keep `main` write
access limited to trusted maintainers and retain the selected-repository App
installation scope. The write workflow adds an independent reviewer gate.

Then use **Actions → Apply repository settings → Run workflow**, selecting
`main`. Choose a registered repository, enter `all`, or leave the repository
field blank for an inventory preview or HTTPS-only operation. Ordinary apply
requires one named repository; blank or `all` is refused before requesting a token.
Registration defines the managed selection;
it does not automatically run an apply when a repository is added.

- **HTTPS-only mode** previews or applies only `pages.https_enforced` on existing,
  readable Pages sites, preserving the pinned `website` exemption. It never
  changes a source, domain, ruleset, release setting, or creates a missing site.
- **Ordinary mode** uses the pinned shared settings helper. Its separate
  **Include Pages setup** option enables the helper's `--apply-pages` behavior,
  creating a confirmed-missing Pages site or correcting its source to GitHub
  Actions. It does not deploy content or create a documentation workflow. A
  repository can have Pages enabled before its first documentation deployment.
- **Apply** is false by default. Start with a preview and review its artifacts.
  The preview finishes before the reviewer gate. Both jobs use the same source
  revision. HTTPS apply compares fresh observations against the saved preview
  plan and refuses changed evidence before writing. Ordinary apply is limited to
  one named repository because it does not bind writes to a saved plan.
  Dispatched runs are serialized. An apply uses the protected
  `repository-administration` environment and needs
  the owner's reviewer approval. Main-ruleset and release-immutability options
  remain separate, deliberate selections; do not select them for HTTPS-only work.

An HTTPS preview can produce a usable plan while reporting blocked repositories.
Its original outcome is recorded in the job summary and its report; it is not a
claim of compliance. After approval, apply may change the eligible sites only if
the complete plan, including blocked outcomes, still matches. Unresolved sites
keep the final operation failing even when some writes succeed.

Each apply reads settings back and runs the strict all-inventory report. Review
both the scoped operation results and the strict report; a completed write is
not proof that the entire inventory is compliant. Missing sites, access failures
and unavailable certificate state remain unresolved, not successful enforcement.
A second compliant HTTPS-only run should make no writes. No workflow here
silently remediates later drift or expands the App installation's repository scope.

GitHub documents App registration and installation in its
[GitHub App guide](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app)
and [installation guide](https://docs.github.com/en/apps/using-github-apps/installing-your-own-github-app).

Pages setup also reconciles HTTPS for that same repository after the pinned
helper succeeds, using the existing HTTPS controller and policy exemptions.
A certificate-not-ready or unreadable result fails the operation; it is not
reported as complete and is not retried indefinitely. Re-run the approved
single-repository operation when GitHub is ready. Without **Include Pages
setup**, ordinary mode makes no HTTPS writes. HTTPS-only mode remains unchanged.

The pinned helper prints a pre-write snapshot. Ordinary application therefore
always finishes with a fresh read-only target audit (also after partial failure),
retained as `target-settings-readback.xml`. The HTTPS stage has its own
`pages-setup-https.xml` result. These do not replace the strict all-inventory
audit; unrelated drift or unknown release immutability can still fail that audit.

## What remains before applying settings

An installation token from this App can read ruleset bypass actors and perform
authorized settings changes. It is minted only in trusted-main audit code or
the protected manual write workflow, never in a pull-request or fork workflow.

The released generic helper’s ordinary `--apply` mode also manages release
immutability. Before using it, review its complete
proposed change set—not only the general settings and main ruleset—and make a
deliberate decision about release immutability. The separate acknowledgement
allows the helper to apply it when its current API state is unknown; it is not
a general switch that excludes release immutability from ordinary apply. Use
HTTPS-only mode when no other setting should change. The workflow reads every
target back through strict verification. The App setup above is the minimal correct
credential preparation, without creating a second App or storing an
administrator key in an untrusted workflow.

## Optional versioned manifests

The JSON files in `config/github/apps/` and the `github:apps:*` helper tasks
remain optional infrastructure-as-code references. They are not required for
the manual setup above. The manifest path is useful only when an owner already
has the necessary App-registration access and wants to reproduce the same
configuration programmatically.

`repository-settings-audit.manifest.json` and
`repository-settings-apply.manifest.json` describe the settings credential
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
