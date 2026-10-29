# GitHub App bootstrap

The two manifests in `config/github/apps/` are versioned infrastructure
definitions. They do not create an App, install it, generate a private key, or
change a repository. Those remaining bootstrap actions intentionally require an
organization owner's consent and handling of a secret that GitHub returns only
once.

## Why a browser step remains

GitHub's App Manifest flow starts with an owner consenting in a browser. GitHub
then redirects to the manifest's local callback with a short-lived code. Within
one hour, the owner exchanges that code through
`POST /app-manifests/{code}/conversions`; the response includes the App ID,
private key, client secret, and webhook secret. The private key and secret must
never be committed, pasted into a pull request, or printed in an action log.

There is no equivalent authenticated REST endpoint that creates an App directly
from a user token. The conversion endpoint is the documented programmatic half
of the owner-approved manifest handshake.

## Owner runbook

1. Review both manifests with `node tools/github/verify-app-manifests.mjs`.
2. Register each manifest through the organization Manifest flow, using an
   owner-controlled local callback at `127.0.0.1:8787`. Do not use a public
   callback service merely to bootstrap these credentials.
3. Exchange the callback code locally within one hour. Store the returned PEM
   outside the repository and record only the non-secret client ID/App ID in
   the organization password or secrets-management record.
4. Install each App on **Only select repositories**, selecting exactly the
   committed repository inventory and `.github`. Do not select all current or
   future organization repositories.
5. Create `repository-settings-audit` and
   `repository-administration` environments in `.github`, restricted to
   `main`. The latter requires an authorized owner review; allow self-review
   only if the sole owner must both dispatch and approve an apply.
6. Put each App's client ID in a configuration variable and its PEM only in the
   corresponding environment secret. The apply identity names are
   `REPO_ADMIN_APP_CLIENT_ID` and `REPO_ADMIN_APP_PRIVATE_KEY`.
7. Before wiring a workflow, run a read-only request with each installation
   token against the inventory. The audit App may not reveal ruleset bypass
   actors; a trusted read using the apply App is required for that assertion.

Environment, variable, and encrypted-secret APIs exist, so steps 5–6 can be
automated after the initial secret is securely available. They are deliberately
not automated here: doing so would require passing a private key to a command,
which risks logging or persisting it. Any future bootstrap command must accept
the PEM only via standard input, encrypt it with GitHub's environment public
key, and make no secret-bearing output.

## Workflow boundary

The audit identity is for trusted, read-only jobs. The apply identity is only
for an explicitly dispatched, environment-approved `main` job. Neither key may
be exposed to fork pull requests, `pull_request_target` jobs that execute pull
request code, or mutable action references.

See GitHub's [manifest flow](https://docs.github.com/developers/apps/building-github-apps/creating-a-github-app-from-a-manifest),
[environment API](https://docs.github.com/rest/deployments/environments), and
[secrets API](https://docs.github.com/rest/actions/secrets).
