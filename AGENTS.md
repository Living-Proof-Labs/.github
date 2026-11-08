# Working on the Living Proof Labs group directory

Read and follow the released
[collaboration-guidelines v6.0.0 baseline](https://github.com/Living-Proof-Labs/collaboration-guidelines/blob/v6.0.0/AGENTS.md)
and its relevant procedures at that same tag. A link alone does not load them.

## Local additions and scope

- `profile/README.md` is the public organization profile. Keep it welcoming and
  vision-first; put installation details in the released tool documentation.
- Distinguish available fixture demonstrations from planned robot, simulator,
  provider, and developer-tool integrations. Keep policy grades separate from
  diagnosis hypotheses. Do not imply safety certification or partnerships.
- Pin shared guidance, examples, and downloads to published version tags.
  Current root and rendered-manual links are bounded navigation exceptions;
  they do not permit floating executable dependencies. Same-repository relative
  navigation follows the revision being read.
- Verify command examples against released artifacts and record the exact
  versions, commands, outcomes, and limitations in the pull request.

## Organization documentation

- `docs/` is the single authored source for the organization overview, vision,
  architecture and directory published by `living-proof-labs.github.io`. Edit
  here, never in the publisher. Declare pages, navigation and redirects in
  `docs/site.json`; list directory rows in `docs/directory.json` only for
  inventoried repositories. Run `task docs:check` before review.
- Keep publishing tooling (theme, build, search, redirect pages, deployment) in
  the publisher. Content changes merge here first; the publisher repins.
- Keep page media in `docs/media/`. Serving it from the published site needs a
  publisher build change that copies that directory, in the same reviewed pull
  request that repins `content.lock.json`. The docs preview job copies the
  directory into the review artifact so the preview link check can pass before
  that publisher change.

## Local directory tooling

This repository owns the single organization repository inventory. Validate it
with `task setup` and `task verify`; the workflow runs the same commands. The
inventory may reference only released, pinned policy artifacts. Do not invent a
tag, pin a moving branch, or duplicate a project list in the policy provider.
Profile publication uses GitHub's existing default-branch behavior; do not
change settings or publishing services.

Guidelines v6.0.0 resolves to `52a2f274576dab20e96ee1152b6c8d187cfbf377`.
Publish profile redirects only after the canonical root targets are live.
