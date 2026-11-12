<!-- SPDX-License-Identifier: CC-BY-4.0 -->
<!-- markdownlint-configure-file { "MD013": { "tables": false } } -->

# Bot GitHub Apps

This is the organization owner's procedure for registering one private GitHub
App each for Rivet, Cody, and Vera, then storing the App id and private key
on that bot's secret card in Grok Bot. Keel has no manifest in this set yet.

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
those fields are null in the directory.

The settings-audit credential stays separate. It uses
`REPO_ADMIN_APP_CLIENT_ID` and `REPO_ADMIN_APP_PRIVATE_KEY` on the
`repository-audit` and `repository-administration` environments, and it uses
the client id. The steps below do not register
`repository-settings-audit.manifest.json` or
`repository-settings-apply.manifest.json`.

Rivet's App is the one that mints `GH_TOKEN` for
[`scripts/apply-repo-policy`](../scripts/apply-repo-policy). The procedure in
this repository is
[Apply repository policy](../README.md#apply-repository-policy).

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

These tables are the `default_permissions` objects in the three manifests.
Each manifest sets `public` to false, `default_events` to `[]`, and no
webhook. GitHub still adds Metadata read for an App; the manifests request it
explicitly.

### Rivet

Manifest:
[`config/github/apps/rivet.manifest.json`](../config/github/apps/rivet.manifest.json).
Name: `Living Proof Labs Rivet` (23 characters).

| Permission | Access |
| --- | --- |
| actions | write |
| administration | write |
| checks | read |
| contents | write |
| issues | write |
| metadata | read |
| pages | write |
| pull_requests | write |

### Cody

Manifest:
[`config/github/apps/cody.manifest.json`](../config/github/apps/cody.manifest.json).
Name: `Living Proof Labs Cody` (22 characters).

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
Name: `Living Proof Labs Vera` (22 characters).

| Permission | Access |
| --- | --- |
| actions | read |
| checks | read |
| contents | read |
| issues | write |
| metadata | read |
| pull_requests | write |

GitHub App names are unique across GitHub and are limited to 34 characters.
The three names above are inside that limit. Keep the manifest name on the
confirmation page. If GitHub reports that a name is already taken, stop and
change the manifest in the repository before trying again.

## Create each App

Run this on the organization owner's computer. Finish one bot before starting
the next. The callback listens only on `127.0.0.1:8787`, so the browser that
submits the form has to be on that same computer. The exchange runs
`gh auth token`. Log `gh` in as an organization owner for that exchange. The
shared `rivet-agent-lpl` login is the wrong account for it.

The commands below use Rivet. For Cody or Vera, change the manifest path and
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

GitHub's manifest example puts `state` on the form's action URL. The helper
writes `state` as a hidden field and leaves the action as
`https://github.com/organizations/Living-Proof-Labs/settings/apps/new`
with no query. Before you open the file, add the state from
`${dir}/state` to that action:

```sh
python3 - "${dir}/form.html" "${dir}/state" <<'PY'
import sys
from pathlib import Path
form = Path(sys.argv[1])
state = Path(sys.argv[2]).read_text().strip()
old = (
    'action="https://github.com/organizations/'
    'Living-Proof-Labs/settings/apps/new"'
)
new = old[:-1] + "?state=" + state + '"'
text = form.read_text()
if old not in text:
    raise SystemExit("form action did not match")
form.write_text(text.replace(old, new, 1))
PY
```

The action is then
`https://github.com/organizations/Living-Proof-Labs/settings/apps/new?state=STATE`.
The receiver accepts the callback only when that `state` matches the state
file. Open `form.html` only after the callback receiver in the next step is
listening. On GitHub's confirmation page, review the manifest: the name is
`Living Proof Labs Rivet`, `Living Proof Labs Cody`, or
`Living Proof Labs Vera`; webhooks are off (`default_events` is empty and the
manifest sets no webhook). Then submit the form.

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
Install Rivet on **All repositories**. `scripts/apply-repo-policy` lists
`GET /orgs/Living-Proof-Labs/repos?type=all`, and an installation token
returns only repositories the installation includes. **All repositories**
is the installation that keeps that list complete, including a repository
added later. A selected-repository installation can leave one out, and an
empty list fails the run.

For Cody and Vera, choose **Only select repositories** and limit each
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

Rivet's card is what mints `GH_TOKEN` for `scripts/apply-repo-policy`. Leave
`REPO_ADMIN_APP_CLIENT_ID` and `REPO_ADMIN_APP_PRIVATE_KEY` on the
settings-audit credential.

`task github:app-token:help` prints the same usage text as
`scripts/app-token`. The token is the only text on standard output. Errors go
to standard error and omit the key, the signed JSON Web Token, and the
installation token.

## First run

Aaron puts Rivet's App id and PEM on Rivet's secret card. Aaron does not
export that PEM into his own shell. Rivet runs the preview, in an environment
where the card has supplied the variables, before any `--apply`:

```sh
GH_TOKEN=$(scripts/app-token rivet) scripts/apply-repo-policy --dry-run
```

The command substitution places the token in `GH_TOKEN` for the policy
process. Do not paste the token into git, a pull request, or a chat. The
dry-run prints differences and performs no writes. Continue to `--apply`
only after that preview is the change you expect.
[Apply repository policy](../README.md#apply-repository-policy) is the
procedure in this repository.
[Apply the pinned policy with a token](repository-operations.md#apply-the-pinned-policy-with-a-token)
is the shorter operator summary. Exit codes for the command, including Task's
201 when `task github:policy:apply` wraps a script failure, stay in the shared
settings guide at the published tag
[v7.10.1, Exit status](https://github.com/Living-Proof-Labs/collaboration-guidelines/blob/v7.10.1/.github/SETTINGS.md#exit-status).

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
