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

## Local directory tooling

This repository owns the single organization repository inventory. Validate it
with `task setup` and `task verify`; the workflow runs the same commands. The
inventory may reference only released, pinned policy artifacts. Do not invent a
tag, pin a moving branch, or duplicate a project list in the policy provider.
Before a provider release is available, retain the inventory and validation here
but document the blocked integration honestly. Profile publication uses GitHub's
existing default-branch behavior; do not change settings or publishing services.

Guidelines v6.0.0 resolves to `52a2f274576dab20e96ee1152b6c8d187cfbf377`.
Publish profile redirects only after the canonical root targets are live.
