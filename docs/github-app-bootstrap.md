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

Run this manifest handshake from a local desktop Linux/macOS terminal, not a
Codespace. The manifest redirect must reach the receiver that owns the state
file. A Codespace's `127.0.0.1` is remote, while its forwarded URL is dynamic
and must remain private; this repository does not yet configure that private
port/callback path. The Dev Container is supported for inventory and policy
tooling, but not for this secret-bearing registration exchange.

If the local form is inconvenient, an organization owner can use GitHub's
**Settings → Developer settings → GitHub Apps → New GitHub App** page and copy
the reviewed manifest fields exactly: private App, no webhooks, the listed URL
and callback URL, **Metadata: read**, and **Administration: read** for the
audit App or **Administration: write** for the apply App. Install each on
**Only select repositories** from the committed inventory. This manual route
does not use the manifest exchange and GitHub generates the private key in its
normal App settings flow.

1. Review both manifests with `task github:apps:check`.
2. For one manifest, generate and open a local owner-consent form:

   ```sh
   node tools/github/render-app-manifest-form.mjs \
     --manifest config/github/apps/repository-settings-audit.manifest.json \
     --organization Living-Proof-Labs --output /tmp/repository-settings-audit.html \
     --state-output /tmp/repository-settings-audit.state
   open /tmp/repository-settings-audit.html
   ```

   This is a local HTML form that posts only the reviewed manifest to GitHub's
   organization registration page; no hosted service is involved.
3. Before submitting that form, start the included loopback-only receiver in a
   second terminal. It writes the one-time code once to the named, new file
   with mode `0600` and never prints the code:

   ```sh
   node tools/github/receive-app-manifest-code.mjs --output /tmp/audit-code \
     --state-file /tmp/repository-settings-audit.state
   ```

4. The conversion command is dry-run unless `--execute` is supplied. After
   owner approval, exchange the code within one hour and save the response to a
   secure, new path. The response contains the PEM and other secrets.

   ```sh
   node tools/github/exchange-app-manifest-code.mjs \
     --code-file /tmp/audit-code --output /secure/location/audit-app.json
   node tools/github/exchange-app-manifest-code.mjs \
     --code-file /tmp/audit-code --output /secure/location/audit-app.json --execute
   ```

   Repeat steps 2–4 for the apply manifest. Record only the non-secret client
   ID/App ID in the organization password or secrets-management record.
5. Install each App on **Only select repositories**, selecting exactly the
   committed repository inventory and `.github`. Do not select all current or
   future organization repositories.
6. Create `repository-settings-audit` and
   `repository-administration` environments in `.github`, restricted to
   `main`. The latter requires an authorized owner review; allow self-review
   only if the sole owner must both dispatch and approve an apply.
7. Put each App's client ID in a configuration variable and its PEM only in the
   corresponding environment secret. The apply identity names are
   `REPO_ADMIN_APP_CLIENT_ID` and `REPO_ADMIN_APP_PRIVATE_KEY`.
8. Before wiring a workflow, run a read-only request with each installation
   token against the inventory. The audit App may not reveal ruleset bypass
   actors; a trusted read using the apply App is required for that assertion.

Environment, variable, and encrypted-secret APIs exist, so step 6–7 can be
performed without hand-entering a PEM. These are opt-in commands—not part of
the manifest tools—and require the owner's action-time authorization:

```sh
# Set OWNER_NUMERIC_ID from a reviewed owner account, then create/update the
# protected environment. This uses protected branches; enable it after main is
# protected, or use the deployment-branch-policy endpoint for a custom main-only rule.
printf '%s' "{\"prevent_self_review\":false,\"reviewers\":[{\"type\":\"User\",\"id\":${OWNER_NUMERIC_ID}}],\"deployment_branch_policy\":{\"protected_branches\":true,\"custom_branch_policies\":false}}" \
  | gh api --method PUT repos/Living-Proof-Labs/.github/environments/repository-administration --input -

gh variable set REPO_ADMIN_APP_CLIENT_ID --repo Living-Proof-Labs/.github \
  --env repository-administration --body "$APP_CLIENT_ID"
gh secret set REPO_ADMIN_APP_PRIVATE_KEY --repo Living-Proof-Labs/.github \
  --env repository-administration < /secure/location/app-private-key.pem
```

`gh secret set` encrypts the secret for GitHub; it does not reveal its value in
the command output. Use a local file with restrictive permissions, never a
shell variable or committed file. The same pattern applies to the audit App's
environment. Review the resulting environment read-back before wiring a
credentialed workflow.

## Workflow boundary

The audit identity is for trusted, read-only jobs. The apply identity is only
for an explicitly dispatched, environment-approved `main` job. Neither key may
be exposed to fork pull requests, `pull_request_target` jobs that execute pull
request code, or mutable action references.

See GitHub's [manifest flow](https://docs.github.com/developers/apps/building-github-apps/creating-a-github-app-from-a-manifest),
[environment API](https://docs.github.com/rest/deployments/environments), and
[secrets API](https://docs.github.com/rest/actions/secrets).
