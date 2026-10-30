# Manual GitHub App setup

Use this short browser-based procedure when an organization owner is ready to
give the settings audit its own credential. It does not require Node,
Codespaces, a manifest callback, or any command from this repository.

## What this enables

This draft adds two trusted uses of the App after it is merged and the two
environments below are configured: an unattended strict audit on `main` and
the daily schedule, plus an explicitly dispatched, one-repository
preview/apply workflow. Pull-request audits remain **read-only, informational,
and secret-free**.

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
3. Under **Repository permissions**, choose **Administration: Read and write**.
   GitHub supplies Metadata read automatically. Request no other permissions
   and subscribe to no events. Create the App. This single App can later mint
   a short-lived token for both audit and deliberately reviewed settings changes.
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

After this draft is merged, configure these two environments in `.github`.

1. Create **`repository-audit`**. Restrict deployments to `main`; do **not**
   add a required reviewer. Add `REPO_ADMIN_APP_CLIENT_ID` as an environment
   variable and the PEM as `REPO_ADMIN_APP_PRIVATE_KEY` environment secret.
   This lets the post-merge and daily strict audits run without a daily owner
   approval prompt, including their ruleset-bypass checks.
2. Create **`repository-administration`**. Restrict deployments to `main`, add
   the owner as a required reviewer, and add the same Client ID variable and
   PEM secret. This environment gates only the manually dispatched write path.

The tradeoff is intentional: the audit receives an Administration-write App
token because GitHub otherwise cannot reveal all managed ruleset data. It runs
only trusted `main` code and its task is read-only, but anyone able to merge
malicious workflow code to `main` could misuse that token. Keep `main` write
access limited to trusted maintainers and retain the selected-repository App
installation scope. The write workflow adds an independent reviewer gate.

Then use **Actions → Apply repository settings → Run workflow**, selecting
`main` and one registered repository. Leave **Apply** unchecked for the first
run: it produces a preview only. A write requires both **Apply** and the
release-immutability acknowledgement. Select the main-ruleset option only when
that separately scoped change has been reviewed. Every apply run finishes with
a strict all-repository JUnit verification; it does not auto-remediate later
drift.

GitHub documents App registration and installation in its
[GitHub App guide](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app)
and [installation guide](https://docs.github.com/en/apps/using-github-apps/installing-your-own-github-app).

## What remains before applying settings

An installation token from this App can read ruleset bypass actors and perform
authorized settings changes. It is minted only in trusted-main audit code or
the protected manual write workflow, never in a pull-request or fork workflow.

There is one deliberate blocker in the released generic helper: its `--apply`
mode also enables release immutability. Before using it, review its complete
proposed change set—not only the general settings and main ruleset—and make a
deliberate decision about release immutability. The protected workflow requires
an explicit acknowledgement before it can use that mode and reads every target
back through strict verification. The App setup above is the minimal correct
credential preparation, without creating a second App or storing an
administrator key in an untrusted workflow.

## Optional versioned manifests

The JSON files in `config/github/apps/` and the `github:apps:*` helper tasks
remain optional infrastructure-as-code references. They are not required for
the manual setup above. The manifest path is useful only when an owner already
has the necessary App-registration access and wants to reproduce the same
configuration programmatically.
