# Manual GitHub App setup

Use this short browser-based procedure when an organization owner is ready to
give the settings audit its own credential. It does not require Node,
Codespaces, a manifest callback, or any command from this repository.

## What this enables today

The existing workflow only performs **read-only repository-settings audits**.
It can use an App credential once a future workflow change wires one in. The
current workflow does **not** read `REPO_ADMIN_APP_CLIENT_ID` or
`REPO_ADMIN_APP_PRIVATE_KEY`, and it has no settings-apply job. Do not create
an environment or secret merely expecting it to be used by the current PR.

The built-in `GITHUB_TOKEN` deliberately remains `contents: read`; it produces
an access-limited report. It cannot complete the fleet audit or verify hidden
ruleset bypass actors.

## Manual owner checklist

1. In GitHub, open **Living-Proof-Labs → Settings → Developer settings →
   GitHub Apps → New GitHub App**.
2. Name it `Living Proof Labs repository settings audit`. Set an owner-visible
   description such as “Read-only audit of registered repository settings.”
   Set the homepage URL to `https://github.com/Living-Proof-Labs/.github`.
   Disable the webhook.
3. Under **Repository permissions**, choose **Administration: Read-only**.
   GitHub supplies Metadata read automatically. Request no other permissions
   and subscribe to no events. Create the App.
4. Generate a private key and store the downloaded PEM in a password manager
   or another secure local secret store. It is shown only at download time;
   never commit it, paste it into a PR, or put it in a shell profile. Record
   the App's **Client ID** separately; it is not secret.
5. Click **Install App**. Choose **Living-Proof-Labs**, then **Only select
   repositories**. Select exactly the repositories in
   [`config/github/repositories.json`](../config/github/repositories.json),
   including `.github`. Do not choose “All repositories.”
6. Stop here until the credentialed read-only workflow is reviewed and merged.
   At that point, put the client ID and PEM only in the environment/secrets
   named by that workflow, then run its manual audit and inspect the result.

GitHub documents App registration and installation in its
[GitHub App guide](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app)
and [installation guide](https://docs.github.com/en/apps/using-github-apps/installing-your-own-github-app).

## A note on complete ruleset verification

Read-only Administration access is the smallest useful audit permission. It
cannot prove the absence of ruleset bypass actors because GitHub hides those
actors from callers without ruleset write access. If that exact assertion later
needs automated verification, create a **separate** Administration-write App
and keep its key only in a protected, manually dispatched workflow. Do not give
the read-only audit App write access just to avoid an `unknown` result.

## Optional versioned manifests

The JSON files in `config/github/apps/` and the `github:apps:*` helper tasks
remain optional infrastructure-as-code references. They are not required for
the manual setup above. The manifest path is useful only when an owner already
has the necessary App-registration access and wants to reproduce the same
configuration programmatically.
