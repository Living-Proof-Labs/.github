# Working on the Living Proof Labs welcome experience

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

## Documentation-only validation exception

This repository currently contains only the profile, navigation, license, and
this guidance. For this bounded welcome-page work, use native Markdown linting,
link and fragment checks, and GitHub-rendered HTML inspection; record the results
in the pull request before merging. Run any changed demo commands with released
packages in an isolated environment. Check the public profile after merging.

This is an explicit local exception to the baseline's Docker/Task tooling,
continuous integration, individual test-result ingestion, and automated release
setup. Adding that infrastructure would expand a small editorial change into a
separate tooling and publishing project. Do not describe manual evidence as a
hosted test run. Revisit this exception when adding executable tooling or an
automated validation/release workflow. Profile publication uses GitHub's existing
default-branch behavior; do not change settings or publishing services.

Guidelines v6.0.0 resolves to `52a2f274576dab20e96ee1152b6c8d187cfbf377`.
Publish profile redirects only after the canonical root targets are live.
