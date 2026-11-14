<!-- SPDX-License-Identifier: CC-BY-4.0 -->
<!-- markdownlint-configure-file { "MD013": { "tables": false } } -->

# Bot GitHub Apps

This is the organization owner's procedure for registering one private GitHub
App each for Rivet, Cody, Vera, and Art, then storing the App id and private key
on that bot's secret card in Grok Bot. Keel has no App in this set and must not be recreated.

The manifests, [`scripts/app-token`](../scripts/app-token), and
`task github:app-token:help` are in this repository,
[Living-Proof-Labs/.github](https://github.com/Living-Proof-Labs/.github).
Commit `c2ba2653ec7ec2685525a63f41ec29f47c70a657`
([pull request 51](https://github.com/Living-Proof-Labs/.github/pull/51))
is the minimum commit that accepts a stateless installation token. Check out
that commit or a later commit of this repository, and run every command in
this guide from the repository root so `scripts/app-token`,
`config/github/apps/`, and `tools/` resolve.

[`config/github/agents.json`](../config/github/agents.json) is the directory of
agents that have GitHub Apps. It records each role and App manifest path.
Keel is not in that directory. The manifests do not record a numeric App id, the
GitHub App slug GitHub assigns at registration, or a git commit identity, so
unrecorded fields remain null. Cody, Vera and Art now have reviewed registration IDs and slugs;
that record alone does not prove working authentication or installation.

The settings-audit credential stays separate. It uses
`REPO_ADMIN_APP_CLIENT_ID` and `REPO_ADMIN_APP_PRIVATE_KEY` on the
`repository-audit` and `repository-administration` environments, and it uses
the client id. The steps below do not register
`repository-settings-audit.manifest.json` or
`repository-settings-apply.manifest.json`.

Rivet's engineering App does not request Administration. Repository-policy
changes belong to the dedicated settings credential, not the engineering App.
The [access audit](#audit-existing-app-access) records and checks that boundary.

## Browser registration without credential exchange

Use `task github:apps:browser` to list every registration manifest and stored
identity. This path derives GitHub's supported prefilled registration URL from
the same manifests used by audit. It does not use the manifest POST/conversion
handshake described later in this guide, and does not obtain or save credentials.
No CLI token or callback receiver is required. An authorized organization-owner
browser session is required to inspect inventory and submit GitHub's form.

```sh
task github:apps:browser -- --help
task github:apps:browser -- --prepare vera --directory /absolute/private/vera-browser-session
```

Use a new directory outside the checkout whose parent already exists. The command
requires an interactive terminal and exact confirmation after inspecting the
complete owner-visible App inventory, including renamed and uninstalled Apps.
Stop for incomplete access, ambiguous identity, or an App already serving that
role. A 404 or failed audit is never absence. Coordinate with other owners.
Recorded identities, including Cody and Rivet, cannot be prepared for creation.

Open the resulting `registration_url` in the authorized owner browser. Review all
fields and permissions against `required_readback` before submitting. Private
organization-only visibility, disabled webhooks, no OAuth callbacks, no OAuth
on installation, and disabled device flow are required. Device flow has no
documented query parameter, so check it explicitly. The manifest's loopback
`redirect_url` belongs to the alternative conversion flow and is deliberately
not mapped to an OAuth callback. No image assets are stored in this repository;
set each App icon manually after confirming its agent-image mapping.

A generated URL is reusable; it is not a one-time server-side lock. The script
refuses reuse of a local session directory, but cannot prevent another owner or
browser tab from submitting. After any uncertain submission, inspect settings
and adopt the existing registration rather than creating another App.

After creation, read back the numeric App ID, assigned slug, homepage, visibility,
description, all permissions/events and disabled features from owner settings. Do not infer
the slug from the name. Save only these nonsecret fields to a local JSON file:

```json
{
  "schema_version": 1,
  "agent": "vera",
  "owner": "Living-Proof-Labs",
  "manifest_sha256": "COPY_FROM_PREPARED_SESSION",
  "source": "owner-settings-readback",
  "app_id": 123,
  "app_slug": "COPY_EXACT_REGISTERED_SLUG",
  "name": "Vera Agent - Living Proof Labs",
  "description": "Verification for Living Proof Labs. Reads code and continuous integration, comments and reviews pull requests, and files issues for verification failures.",
  "url": "https://github.com/Living-Proof-Labs/.github",
  "public": false,
  "webhook_active": false,
  "request_oauth_on_install": false,
  "device_flow_enabled": false,
  "callback_urls": [],
  "permissions": {"actions":"read","checks":"read","contents":"read","issues":"write","metadata":"read","pull_requests":"write"},
  "events": []
}
```

Replace example ID, slug and digest with observed values, then run:

```sh
task github:apps:browser -- --adopt vera --readback /absolute/private/vera-readback.json
```

The script rejects unexpected fields (including credential fields), mismatched
settings and conflicting recorded identities. It prints a nonsecret proposal;
review and commit only the ID (as a string) and slug under `github_identity` in
`config/github/agents.json`. It does not rewrite configuration automatically.
This is an owner-readback assertion, not independent authenticated verification.
Authentication and installation remain explicitly unverified. Repeated matching
adoption is a no-op proposal; conflicts require investigation, never replacement.

Cody's pilot registration was read back as **Cody Agent - Living Proof Labs**,
App ID **5754786**, slug **cody-agent-living-proof-labs**, with exactly its manifest
permissions and private/disabled-feature settings. No key was generated and no
installation was made during that registration. Aaron will generate its key
in GitHub and deliver it directly to Cody's Grok secret card. Keep key material
out of scripts, chat, logs and repositories. Key generation/delivery and selected
repository installation grants are separate authorized steps. Do not claim a
usable agent identity until App authentication and approved installation access
have been verified. Preserve Rivet.

After PR #89 merged as `9951eb991fed2d6790916835b578aca725bd205f`, the
merged script was used with fresh owner inventory inspection to register Vera
and Art. Their saved owner settings matched the names, descriptions, homepage,
permissions and disabled features in their manifests. Both remained private;
no keys or installations were created. The merged adoption validator accepted
both readbacks, with authentication and installation explicitly unverified.

| Agent | App ID | Registered slug |
| --- | --- | --- |
| Cody | 5754786 | cody-agent-living-proof-labs |
| Vera | 5754857 | vera-agent-living-proof-labs |
| Art | 5754862 | art-agent-living-proof-labs |

The preparation examples above describe the creation procedure; these recorded
Apps now refuse preparation. Use adoption for existing registrations and add a
new reviewed manifest before preparing any future agent. Keys must be generated
and delivered through each agent's approved secret destination; selected
repository installation scope still needs an explicit decision.

GitHub documents this supported browser flow in
[registering a GitHub App using URL parameters](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-using-url-parameters).
The legacy manifest-conversion commands below remain an alternative that returns
secrets; they are not part of this no-secret browser procedure.

## Checkout

From the repository root of that checkout, install the pinned Node and Task.
`task setup` runs `bash tools/setup.sh`. When the `task` command is not
installed, run `bash tools/setup.sh` directly. That script installs Node and
Task under `.tools` and does not need `sudo`. Repository tasks then go through
`bash tools/task.sh`, which is the pinned Task even when a `task` command is
absent from `PATH`.

```sh
bash tools/setup.sh
bash tools/task.sh github:apps:check
```

`github:apps:check` reads the manifests on disk and does not contact GitHub.
It prints `GitHub App manifests are valid.` when they match the checked-in
permission sets.

## Permissions

These tables are the `default_permissions` objects in the bot manifests.
Each manifest sets `public` to false, `default_events` to `[]`, and no
webhook. GitHub still adds Metadata read for an App; the manifests request it
explicitly.

### Rivet

Manifest:
[`config/github/apps/rivet.manifest.json`](../config/github/apps/rivet.manifest.json).
Name: `Rivet Agent - Living Proof Labs`.

| Permission | Access |
| --- | --- |
| actions | write |
| checks | read |
| contents | write |
| issues | write |
| metadata | read |
| pages | write |
| pull_requests | write |
| statuses | read |
| deployments | read |
| workflows | write |
| organization_projects | write |

### Cody

Manifest:
[`config/github/apps/cody.manifest.json`](../config/github/apps/cody.manifest.json).
Name: `Cody Agent - Living Proof Labs` (30 characters).

| Permission | Access |
| --- | --- |
| actions | read |
| checks | read |
| contents | write |
| issues | write |
| metadata | read |
| pull_requests | write |
| workflows | write |

### Vera

Manifest:
[`config/github/apps/vera.manifest.json`](../config/github/apps/vera.manifest.json).
Name: `Vera Agent - Living Proof Labs` (30 characters).

| Permission | Access |
| --- | --- |
| actions | read |
| checks | read |
| contents | read |
| issues | write |
| metadata | read |
| pull_requests | write |

GitHub App names are unique across GitHub and are limited to 34 characters.
The bot names above are inside that limit. Keep the manifest name on the
confirmation page. If GitHub reports that a name is already taken, stop and
change the manifest in the repository before trying again.

## Repeatable bootstrap and discovery

The manifest directory is the registration source of truth. Both
`task github:apps:bootstrap` and `task github:apps:audit` enumerate every
`config/github/apps/*.manifest.json` in sorted order. Adding a valid manifest
is sufficient for enrollment: there is no second bootstrap list. The token
helper uses the same directory and validates each manifest; no bot-name list or
agent-directory entry is required. It resolves the directory relative to its own
script, so calling it from another working directory does not change enrollment.
Hyphens in names become underscores in credential environment names (for example,
`design-review` uses `DESIGN_REVIEW_GITHUB_APP_ID`). Existing App ID, private-key,
installation lookup and token handling remain required and unchanged.

The two repository-settings examples now live in
[`config/github/app-reference-manifests/`](../config/github/app-reference-manifests/).
They remain checked by manifest validation but are not registration targets,
token-helper identities or missing installation-policy entries. They describe
alternative scopes for the existing administration credential, not two Apps to
create. Promoting an example into the registration directory would require a
reviewed, valid registration manifest and the same identity/absence safeguards.

The **Bootstrap agent App identities** workflow runs on relevant pushes to
`main` and manual dispatch, with read-only repository permissions and serialized runs. It emits a
sanitized plan artifact retained for 14 days. It cannot register or install Apps,
generate keys, or accept new permissions. Its repository token usually cannot
read private registrations or the organization's installation inventory; an
unverified result is expected in that case, never permission to create an App.
Run the same task locally with existing authorized `GH_TOKEN` read access to
improve evidence. Do not introduce a broad owner token into Actions for this.

The planner verifies stored numeric App ID, slug and organization owner before
checking permissions and events. Existing identity comes from `agents.json`
and/or `app-access.json`; disagreement or a partial identity fails closed.
With no stored identity, it tries a name-derived slug and slugs from the complete
paginated organization installation list. Names are lookup hints, not identity.
One exact owner/name match yields an adoption proposal; record its ID and slug
through a PR and rerun. Multiple matches, an occupied hint, malformed responses,
403, 404, rate limits and unavailable evidence never produce a create decision.
Renamed, uninstalled or private Apps may require owner inspection and recording
their actual identity before they can be found. No key is needed for adoption.

Registration drift is reported without writes. Installation permission checks
are separate; `permissions-verified` does not mean repository selection was
verified. Add reviewed installation ID, permissions/justifications and repository
selection to `app-access.json` for the existing strict audit. A new manifest
still enrolls without that policy, but its installation remains incomplete.
Selected-repository membership currently requires independent complete evidence;
the audit does not mistake token-visible repositories for authoritative scope.
GitHub's public registration response also does not prove private visibility,
callback configuration or webhook URL: owners must inspect those settings.

### Art's proposed scope

Name: `Art Agent - Living Proof Labs` (29 characters). All four registration
names follow `<Name> Agent - Living Proof Labs`. These manifest names apply
to new registrations; they do not rename or recreate an existing App.

[`art.manifest.json`](../config/github/apps/art.manifest.json) represents
**Style and product guidance**: Contents and Metadata read; Issues and Pull
requests write. This lets Art read source/designs, create granular design issues,
and comment on or review changes. It grants no Contents write, Actions, Checks,
Workflows, Pages or Administration. Whether Art should directly edit design files
is unresolved; this proposal leaves implementation to Cody. Any later expansion
needs a reviewed manifest change and owner acceptance, not an automatic grant.
Private registration, no events and the existing loopback callback are retained.
The token helper accepts `art` using the existing `ART_GITHUB_APP_ID` /
`ART_GITHUB_APP_PRIVATE_KEY` convention; no credentials are provisioned by this change.

### Owner-confirmed absence handoff

GitHub provides no supported exhaustive REST inventory of organization-owned
App registrations. An empty installation list and `GET /apps/{slug}` returning
404 are not absence evidence. Only an organization owner who can inspect the
complete owned-App settings list, including renamed and uninstalled Apps, can
supply the missing confirmation for this handoff. Incomplete UI access means stop.

On the owner's computer, use the new guarded entry point before the older raw
form helper. Choose a private directory outside the checkout with an existing
parent. Substitute an absolute local path:

```sh
bash tools/with-node.sh node tools/github/bootstrap-apps.mjs --help
bash tools/with-node.sh node tools/github/bootstrap-apps.mjs \
  --prepare cody --directory /private/cody-registration
```

The command checks active organization-owner membership with the existing token,
reruns read-only discovery and refuses a known or conflicting identity. It then
asks the owner to inspect the complete registration inventory **now** and type an
exact confirmation bound to the organization, role and manifest digest. That
human observation is explicitly the authority; the code cannot verify the UI
inspection. No confirmation is accepted from a workflow, pipe or saved plan.
After confirmation it exclusively creates a mode-0700 directory containing
mode-0600 `registration.html`, `state` and a nonsecret confirmation record.
No App is created until the owner submits the browser form.

Continue the same session with fixed filenames. Use the owner credential already
approved for preparation; `gh auth token` must resolve to that same owner for
conversion. GitHub does not support fine-grained PATs or App user/installation
tokens for the conversion endpoint. Do not add broad credentials to Actions.

```sh
# Set this to the exact directory created by --prepare; do not create a new one.
dir="/private/cody-registration"
bash tools/with-node.sh node tools/github/registration-handoff.mjs --directory "$dir" --receive
# While the receiver waits, open registration.html in a browser on this machine.
# Review the private App manifest and confirm registration on GitHub.
bash tools/with-node.sh node tools/github/registration-handoff.mjs --directory "$dir" --exchange
bash tools/with-node.sh node tools/github/registration-handoff.mjs --directory "$dir" --verify
```

Finish within one hour of preparation. `--receive` accepts exactly one matching
state/code callback. `--exchange` checks the same active organization owner and
synchronizes an attempt marker and its parent directory before sending the
one-time code. Unsupported directory synchronization stops before any POST. It never
replays an attempted exchange, even after a timeout. The full bounded response
stays private for recovery. `--verify` checks the returned numeric ID, slug,
organization owner, permissions, events and RSA key against the current manifest,
then uses that existing key for a read-only `GET /app` identity check. It writes
only `identity-proposal.json`, with no keys, tokens, client or webhook secrets.
Running without an action checks a saved response offline; it does not claim
live verification. Reuse a saved proposal instead of rerunning conversion.

Record the proposal's nonsecret identity through a PR. Store the App ID and PEM
through the approved bot secret-card procedure below, then use the proposal's
installation link in the owner's browser. Select **Living-Proof-Labs** and
**Only select repositories** for Cody, Vera and Art. The specific repositories
need an explicit owner decision; no scope is guessed or expanded by this tool.
Record the installation ID, exact repositories and permission justifications in
`app-access.json`, then run bootstrap and access audit. Registration verification
does not imply installation or accepted access. Selected-repository membership
remains unverified until complete authoritative scope evidence is supplied.

Recheck owned registrations immediately before browser submission and coordinate
with other owners. GitHub has no atomic create-if-absent transaction. An old form
is not durable authorization; do not reuse stale forms. Private visibility,
callback and webhook settings still need the owner's settings-page inspection.

An existing local directory is a retry guard, not global state. If browser
submission or conversion has an uncertain outcome, **do not** create a fresh
directory and retry registration: inspect and recover the existing App first.
Do not upload the state, form, callback code, keys or conversion response as
artifacts. Store credentials through the existing approved secret procedure,
record nonsecret identity through a PR, separately review installation repository
selection/permission acceptance, then rerun bootstrap and audit. Never recreate
an App to fix drift or regenerate a key on routine runs.

GitHub references: [manifest owner-consent flow](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest),
[registration lookup](https://docs.github.com/en/rest/apps/apps#get-an-app), and
[organization installations](https://docs.github.com/en/rest/orgs/orgs#list-app-installations-for-an-organization).

## Create each App

Use the guarded absence handoff above first. The raw helper instructions below
remain a low-level reference; they do not perform identity discovery or establish
absence. If `registration.html` and `state` already exist from the guarded command,
skip raw form generation and use those files for the callback and conversion.

Run this on the organization owner's computer. Finish one bot before starting
the next. The callback listens only on `127.0.0.1:8787`, so the browser that
submits the form has to be on that same computer. The exchange runs
`gh auth token`. Log `gh` in as an organization owner for that exchange. The
shared `rivet-agent-lpl` login is the wrong account for it.

The commands below use Rivet. For Cody, Vera or Art, change the manifest path and
use a different directory. Write every output file outside the git checkout.
The tools create those files mode `0600` and refuse to overwrite them.

### 1. Render the local form

`task github:apps:form:help` prints the render command. In this checkout the
same task is `bash tools/task.sh github:apps:form:help`. The printed usage is:

<!-- markdownlint-disable MD013 -->

```text
Usage: node tools/github/render-app-manifest-form.mjs --manifest FILE --output FILE --state-output FILE [--organization OWNER]
```

<!-- markdownlint-enable MD013 -->

The Taskfile runs that program through `bash tools/with-node.sh`, which finds
the Node installed by `bash tools/setup.sh`. Render Rivet's manifest for the
Living-Proof-Labs organization:

```sh
dir="${HOME}/lpl-bot-apps/rivet"
mkdir -p "$dir"
bash tools/with-node.sh node tools/github/render-app-manifest-form.mjs \
  --manifest config/github/apps/rivet.manifest.json \
  --output "${dir}/form.html" \
  --state-output "${dir}/state" \
  --organization Living-Proof-Labs
```

Cody's manifest is `config/github/apps/cody.manifest.json`. Vera's manifest is
`config/github/apps/vera.manifest.json`.

The generated form action includes URL-encoded `?state=STATE` and the manifest
POST field. No manual HTML editing is needed.
The receiver accepts the callback only when that `state` matches the state
file. Open `form.html` only after the callback receiver in the next step is
listening. On GitHub's confirmation page, review the manifest: the name is
`Rivet Agent - Living Proof Labs`, `Cody Agent - Living Proof Labs`,
`Vera Agent - Living Proof Labs`, or `Art Agent - Living Proof Labs`. Webhooks
are off (`default_events` is empty and the manifest sets no webhook). Then
submit the form.

### 2. Receive the callback and exchange the code

`task github:apps:callback:help` prints:

<!-- markdownlint-disable MD013 -->

```text
Usage: node tools/github/receive-app-manifest-code.mjs --output FILE --state-file FILE
```

<!-- markdownlint-enable MD013 -->

Start the receiver in this checkout before submitting the form. It accepts
only the state written by the render step, and it does not print the one-time
code:

```sh
bash tools/with-node.sh node tools/github/receive-app-manifest-code.mjs \
  --output "${dir}/code" \
  --state-file "${dir}/state"
```

It waits on `http://127.0.0.1:8787`. Submit the form in a browser on this
same machine. GitHub redirects to
`http://127.0.0.1:8787/github-app-manifest/callback`. The receiver then prints
`Saved one-time manifest code to ...`.

GitHub's manifest code is valid for one hour. Finish this callback and the
exchange below inside that hour.

`task github:apps:exchange:help` prints:

<!-- markdownlint-disable MD013 -->

```text
Usage: node tools/github/exchange-app-manifest-code.mjs --code-file FILE --output FILE --execute
```

<!-- markdownlint-enable MD013 -->

A run without `--execute` does not contact GitHub and does not write the
response. Exchange the code with the organization owner's `gh` login:

```sh
bash tools/with-node.sh node tools/github/exchange-app-manifest-code.mjs \
  --code-file "${dir}/code" \
  --output "${dir}/registration" \
  --execute
```

On success the tool prints that the response file contains secrets and must
not be committed or printed. The JSON includes the numeric App `id`, the first
PEM (`pem`), and a webhook secret (`webhook_secret`), plus the other
registration fields GitHub returns. Webhooks are off, so the webhook secret is
unused. Leave the webhook secret and the client secret out of the secret
card.

Print the numeric App id, which is not a secret. Copy the PEM to the
clipboard so it does not appear in the terminal. On macOS the clipboard
command is `pbcopy`. On Linux, use one of `wl-copy` or
`xclip -selection clipboard`.

```sh
jq -r .id "${dir}/registration"
jq -r .pem "${dir}/registration" | pbcopy
```

If `jq` is not installed, copy those two fields from the file in an editor
instead of printing the file in the shell.

Paste the PEM into the secret card. If that card stores one line, the helper
accepts the same text with newlines written as the two characters `\n`.
Delete `${dir}` after the card has the id and the PEM. Shell history must
not gain the PEM, the webhook secret, or the one-time code. Never post a
key anywhere.

## Install the App

Install each App only on Living-Proof-Labs:

1. Open your profile picture, then **Your organizations**.
2. Next to Living-Proof-Labs, click **Settings**.
3. Open **Developer settings**, then **GitHub Apps**.
4. Next to the App, click **Edit**.
5. Click **Install App**, then **Install** next to Living-Proof-Labs.

GitHub then offers **All repositories** or **Only select repositories**.
The reviewed Rivet desired state records **All repositories**, including future
repositories, from the owner's rollout. This is an access decision, not a
requirement to run repository-policy administration as Rivet. Do not change
installation scope merely to make a read succeed.

For Cody, Vera and Art, choose **Only select repositories** and limit each
installation to the repositories where that bot works.

The installation id is optional. It is the number at the end of the
installation URL,
`https://github.com/organizations/Living-Proof-Labs/settings/installations/INSTALLATION_ID`.
When `<BOT>_GITHUB_APP_INSTALLATION_ID` is unset, `scripts/app-token` looks
up `GET /orgs/Living-Proof-Labs/installation`. Set the variable only when
you want to skip that lookup. The value is digits only.

## Private key

The first PEM is the `pem` field in the exchange response. GitHub returns that
key once. Later keys use the App's **Key pairs** page:

1. Open your profile picture, then **Your organizations**.
2. Next to Living-Proof-Labs, click **Settings**.
3. Open **Developer settings**, then **GitHub Apps**.
4. Next to the App, click **Edit**.
5. Open **Credentials**, then **Key pairs**.
6. Click **New key**.

GitHub downloads one PKCS#1 PEM. The block begins with
`-----BEGIN RSA PRIVATE KEY-----`. GitHub's private-key documentation calls
this `PKCS#1 RSAPrivateKey`.

Copy that PEM text onto the bot's secret card without printing the file.
Then delete the downloaded `.pem`, including the copy in Trash or Downloads.
Do not leave the file in the checkout or a shared folder.
`scripts/app-token` wants the PEM text. A file path is rejected. A value
that stores line breaks as the two characters `\n` is accepted, and one
pair of surrounding quotes is stripped.

GitHub will not delete the last remaining key until another key exists.
Delete a key from the same **Key pairs** page, with **Delete** beside that
key. The
[private key guide](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps)
shows this page.

## Secret card

On the bot's own secret card in Grok Bot, set the numeric App id, the PEM
text, and, optionally, the installation id:

| Bot | App id | Private key | Installation id (optional) |
| --- | --- | --- | --- |
| rivet | `RIVET_GITHUB_APP_ID` | `RIVET_GITHUB_APP_PRIVATE_KEY` | `RIVET_GITHUB_APP_INSTALLATION_ID` |
| cody | `CODY_GITHUB_APP_ID` | `CODY_GITHUB_APP_PRIVATE_KEY` | `CODY_GITHUB_APP_INSTALLATION_ID` |
| vera | `VERA_GITHUB_APP_ID` | `VERA_GITHUB_APP_PRIVATE_KEY` | `VERA_GITHUB_APP_INSTALLATION_ID` |

Aaron sets these variables on that bot's secret card in Grok Bot. The bot
does not type them. When the bot runs, the card supplies the variables.

`<BOT>_GITHUB_APP_ID` is the numeric App id. The exchange response calls it
`id`. The same number is on the App's **General** settings page, the page
**Edit** opens. The Client ID on that page is a different value. This
variable takes the numeric App id. `<BOT>_GITHUB_APP_PRIVATE_KEY` is the
PEM text. Paste it, or paste the one-line form that writes each newline as
the two characters `\n`. Do not print the PEM to set the card.

Keep the dedicated repository-settings credential separate from the engineering
App. Rivet's token cannot apply Administration-protected settings.

`task github:app-token:help` prints the same usage text as
`scripts/app-token`. The token is the only text on standard output. Errors go
to standard error and omit the key, the signed JSON Web Token, and the
installation token.

## First run

Verify token creation without printing the token:

```sh
scripts/app-token rivet >/dev/null && printf 'Rivet authentication OK\n'
```

This proves token creation, not live permissions or repository coverage. Run
the access audit separately with appropriate read authority.

A new installation token is stateless and looks like `ghs_<APPID>_<JWT>`,
as described in the
[installation token rollout](https://github.blog/changelog/2026-10-02-stateless-github-app-installation-tokens-rolled-out/).
Earlier commits reject a `ghs_<APPID>_<JWT>` token and exit 1 with
`Installation token response did not include a usable token.`
[`scripts/app-token`](../scripts/app-token) in this repository is the helper
that accepts that stateless token, starting at the minimum commit above.

## Rotate a key

1. On **Key pairs**, click **New key** and let GitHub download the new PEM.
   The previous key still signs until you delete it.
2. Copy the downloaded PEM onto `<BOT>_GITHUB_APP_PRIVATE_KEY` without
   printing it. Do not `echo` or `cat` the key to the terminal. On macOS,
   with the downloaded name in place of `the-key.pem`:

   ```sh
   pbcopy < ~/Downloads/the-key.pem
   ```

   On Linux, use one of these:

   ```sh
   xclip -selection clipboard < the-key.pem
   wl-copy < the-key.pem
   ```

   Paste that clipboard text into the secret card. Delete the downloaded
   `.pem` after the card is updated. Do not leave it in Downloads, the
   checkout, or a shared folder.
3. Rivet, Cody, or Vera runs the helper in the environment that has the
   updated card. Use `cody` or `vera` instead of `rivet` for that bot:

   ```sh
   scripts/app-token rivet >/dev/null && echo "token OK"
   ```

   The command prints `token OK` and does not print the token. A new token
   looks like `ghs_<APPID>_<JWT>`. Do not paste a token into git, a pull
   request, or a chat. The [token note](#first-run) above applies here too.
4. After the new key is on the card and the helper has printed a token,
   delete the old key on **Key pairs**. GitHub requires a remaining key, so
   generate the new key before deleting the old one. Never post a key
   anywhere.

## Revoke access

Deleting a private key stops new JSON Web Tokens signed with that key.
Installation tokens already issued keep working until they expire, which is
about an hour, or until the installation is suspended or uninstalled.
Suspending or uninstalling the App on Living-Proof-Labs cuts off those
installation tokens.

To revoke one installation token that has already been issued, put that
token in `GH_TOKEN` without pasting it into the command, then:

```sh
gh api -X DELETE /installation/token
```

GitHub returns 204 and that token stops working. The call is
[Revoke an installation access token](https://docs.github.com/en/rest/apps/installations#revoke-an-installation-access-token).
A new token still requires a private key GitHub has not deleted.

To retire a bot, delete the App and clear that bot's secret card. Never post
a key anywhere.

## Audit existing App access

`config/github/app-access.json` is the reviewed desired state for existing Apps.
Registration discovery automatically reads every `config/github/apps/*.manifest.json`.
Rivet currently has the only reviewed installation policy; other Apps explicitly
report missing installation policy rather than inheriting Rivet’s grants.
It records registration and installation identifiers, exact permissions with
justifications, and repository selection. Rivet's entry retrospectively records
the owner's requested rollout, not independently verified accepted grants.
The manifest and validator must match it. Keel identity work remains separate.

```sh
bash tools/task.sh github:apps:check
bash tools/task.sh github:apps:audit > app-access-audit.json
```

The first command is offline. The second uses existing `GH_TOKEN` or
`GITHUB_TOKEN` read access and performs only `GET` requests to api.github.com.
It never creates a token, registers an App, accepts permissions or applies
settings. Do not paste credentials into command arguments or reports.

The report compares registration permissions and installation-accepted
permissions separately. It includes source endpoints, observation time, the
configuration commit (marked dirty when edited), a configuration digest and exact
permission differences. A matching registration with differing installation
permissions is **possibly pending acceptance**, not proof of the cause. A token
can be intentionally narrower; token permissions are never used as installation
permission evidence. Suspended, unreadable, missing or malformed installation
state does not pass. Pagination must complete consistently.

Exit zero means every enrolled App's checked permission maps and scope match.
Any drift or unverified evidence exits nonzero (Task may wrap this as exit 201).
This is not a full security audit of webhooks, keys, organizations, runtime
identity, or effective endpoint authorization. No private key or token appears
in the output. Keep reports private if future entries describe private scope.

### Read authority and current limits

The collector uses GitHub's documented `GET /apps/{app_slug}` and paginated
`GET /orgs/{org}/installations`. Private App visibility and organization-owner
access must be satisfied by the existing credential. The organization endpoint
requires organization Administration **read** for fine-grained tokens; repository
Administration is different. Do not broaden an engineering token simply for
this audit. Unavailable authority produces **unverified**, not a missing App or a
passing result. Running without a credential is useful only to expose those
limits, not verify private access.

For `all` selection, the authoritative installation object establishes all
current and future repositories. For `selected`, this first delivery reports
membership **unverified** even when selection mode matches: a user's or narrowed
token's visible repository list is not complete installation evidence. Enrollment
of selected-scope Apps requires a future authoritative membership reader. No
selected-scope audit can currently pass. Empty or denied lists are never treated
as evidence that the installation has no access.

### Reviewed changes and manual reconciliation

1. Propose desired permissions and scope in a pull request, including reasons.
   Update the matching registration manifest. Review expansions before applying.
2. Run the audit using approved read access and retain its report against that
   configuration commit. If evidence is unavailable, resolve visibility first;
   do not apply guessed changes.
3. The App owner edits approved registration permissions in GitHub settings.
   No general documented REST update endpoint for these declarations is used.
   Do not delete and recreate the App. Manifest conversion creates a new App.
4. The installation owner accepts added permissions and reviews repository
   selection. Removed permissions may take effect without an acceptance step.
   A merged pull request does not perform either website step.
5. Rerun the audit. Do not call the change reconciled until the relevant fields
   read back as compliant. Record partial failures, not just successes.

Supported repository-selection APIs exist but are deliberately not an apply path
in this delivery. They need separately approved authority and complete before/after
scope. This implementation automates audit and planning only. Website changes
remain pending owner work, not an automated promise. Pages HTTPS policy is the
separate repository-settings workflow, not an App lifecycle operation.

Sources: [App reads](https://docs.github.com/en/rest/apps/apps),
[organization installations](https://docs.github.com/en/rest/orgs/orgs#list-app-installations-for-an-organization),
[installation endpoints](https://docs.github.com/en/rest/apps/installations), and
[permission changes](https://docs.github.com/en/apps/maintaining-github-apps/modifying-a-github-app-registration#changing-the-permissions-of-a-github-app).

### Audit as the App itself

An engineering installation token cannot read its App's registration. Do not
add organization Administration to work around that boundary. With the existing
approved Rivet App id and private key available in its execution environment:

```sh
bash tools/with-node.sh node tools/github/audit-app-access.mjs --as-app rivet > rivet-access-audit.json
```

This explicitly selects **only Rivet**; substitute another registration-manifest
filename stem to select that App. The output lists audited and excluded agents
from the manifest directory. A manifest without reviewed identity and installation
policy returns unverified without attempting authentication. Default audit mode
still discovers every manifest. Capture the Node process directly as shown so
Task failure annotations cannot enter the JSON report. `RIVET_GITHUB_APP_ID` must match the reviewed
configuration; `RIVET_GITHUB_APP_PRIVATE_KEY` is existing RSA private-key text.
Never put that value in a command argument, report, commit or chat. The command
reuses the signing helper, signs short-lived requests in memory, and does not
mint installation tokens, generate keys, create Apps or change access.

The collector reads `GET /app`, `GET /app/installations/{installation_id}` and
all pages of `GET /app/installations` using App authentication. It checks the
registered identity before proceeding and compares the direct installation
with its complete listing. Denied reads, missing identity, inconsistent pages,
suspension and missing fields fail closed. Accepted installation permissions
remain separate from requested registration permissions. Selected-repository
membership is still unverified in this slice, even when the selection mode
matches. Adding a manifest enrolls it automatically; verified identity and
installation policy are additional evidence, not a second enrollment list. The
settings reference examples remain excluded from registration. No private keys
are needed for the default discovery mode.

GitHub documents the [App-authenticated endpoints](https://docs.github.com/en/rest/apps/apps)
and [request signing](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app).
A managed environment that replaces the Authorization header cannot run this
mode successfully. An authentication failure is **unverified**, not permission
drift or a reason to expand grants. Offline signature/collector tests do not
prove that a particular environment can authenticate to GitHub. Run the command
in an already approved environment supporting App authentication and retain its
sanitized report before claiming live reconciliation.

### Owner checklist: Rivet presentation metadata

Rivet's 12 November 2026 review reported description and homepage differences;
those are separate from access compliance and are not automatically compared by
this slice. No website edits are performed by the audit.

1. Open [Rivet's App settings](https://github.com/organizations/Living-Proof-Labs/settings/apps/rivet-agent-living-proof-labs).
2. Compare the name and description with `config/github/apps/rivet.manifest.json`.
   The reviewed description is "Engineering delivery for Living Proof Labs.
   Repository settings administration belongs to the dedicated settings App."
3. Decide whether the homepage should remain the public Apps documentation or
   match the manifest's `https://github.com/Living-Proof-Labs/.github`. If the
   documentation homepage is preferred, review that change in the manifest
   instead of treating the website value as automatically wrong.
4. Save only the approved metadata changes. Read back `/app` and compare `name`,
   `description` and `external_url` with the reviewed manifest. Keep permission
   and installation approval changes separate; do not delete/recreate the App.

## Disabled Keel Actions comment pilot

The cloud's Keel JWT passes local structure and signature checks, while GitHub
returns an undecodable-token error. Managed credential substitution is suspected,
not proven. The separate `keel-comment-pilot.yml` tests the supported GitHub-hosted
path without returning an App token to the cloud. It is **disabled**, has no keys,
and does not run on pull requests, pushes or schedules. This is not a general
agent dispatcher and does not register an App through the manifest workflow.

The only target is `Living-Proof-Labs/collaboration-guidelines`, Keel's previously
verified repository. Do not expand installation access to `.github` for this
experiment. The workflow lives in `.github`; its execution repository and token
target are intentionally distinct. It permits only one reviewed issue and the
fixed comment in `tools/github/keel-comment-pilot.mjs`, with request ID
`keel-identity-pilot-001`. Dispatch accepts no destination, operation or body.

Before any live pilot, obtain explicit approval for the exact comment and issue,
the existing key's protected storage location, and the run. The owner must:

1. Verify Keel's existing App ID, slug, installation ID, numeric bot user ID and
   target issue. Commit them in `config/github/keel-comment-pilot.json`, changing
   `enabled` only in that reviewed authorization. Null values stop execution;
   none are guessed or discovered as permission to post.
2. Create/review environment `keel-comment-pilot` in `.github`, restricted to the
   **main branch only** (not tags or a wildcard), with required independent owner
   approval, prevent self-review, and administrator bypass disabled. Verify main
   branch protection separately. Environment existence alone proves no protection.
3. Only with approved credential-storage consent, configure the existing key as
   environment secret `KEEL_GITHUB_APP_PRIVATE_KEY` and the App client ID as
   environment variable `KEEL_GITHUB_APP_CLIENT_ID`. Do not copy keys into repo,
   organization-wide secrets, artifacts, shell arguments, logs or this chat.
4. Enable repository variable `KEEL_COMMENT_PILOT_ENABLED` only after these
   controls and the exact comment are approved. Dispatch on main; while the job
   is waiting for environment approval, set the **environment secret**
   `KEEL_COMMENT_PILOT_APPROVED_RUN_ID` to that exact run ID. This value is an
   authorization lock, not a credential. Environment secrets are read when the
   job starts. Approve only this run and its reviewed commit.
5. Review the sanitized result and the comment's actual bot author. Disable the
   pilot variable again. A failed or cancelled run after posting began requires
   manual inspection; never authorize a different run ID for this same request.

The code rejects other repositories, refs, events, runs and reruns before key use.
It signs GET requests to verify the existing App and selected installation, then
uses the repository's pinned `actions/create-github-app-token` with only Issues
write on `collaboration-guidelines`. Its output stays inside the job; no job
output, artifact or external return carries a token. Normal action cleanup revokes
it; abrupt runner loss may leave it valid until expiry. No grant is expanded.

Before posting, the code checks minted identity and narrowed repository scope,
then completely paginates comments. An exact marker/body/expected bot identity
match is a no-op. Foreign, duplicate, altered or unreadable evidence stops. It
sends at most one POST in the approved first run attempt, with no retry or redirect,
and reads the comment back to verify the App and bot author. Responses and secrets
are never printed. The fixed message contains no arbitrary text or mentions.

This is **at-most-one-POST**, not guaranteed exactly-once delivery. GitHub's comment
API has no transactional idempotency key. The approved run ID must remain bound to
this fixed request even after uncertainty; changing that lock can allow another
POST. A timeout may mean a comment exists despite a failed run. Do not rerun,
delete/recreate evidence or authorize a second run to make a failure disappear.
A broader dispatcher would require a separately reviewed durable request ledger.

This PR does not provision secrets/environments, enable the pilot, dispatch it,
post a comment, change live permissions, or prove the managed-authentication theory.
Those actions and live end-to-end identity verification remain pending approval.

References: [pinned token action](https://github.com/actions/create-github-app-token/tree/64ab729a6294000f5aa4a4bc0b73d1f32bc45510),
[environment approval](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments),
and [environment secret timing](https://docs.github.com/en/actions/reference/security/secrets).
