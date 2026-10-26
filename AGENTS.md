# Working on the Living Proof Labs welcome experience

Read and follow the released
[collaboration-guidelines v4.3.0 baseline](https://github.com/Living-Proof-Labs/collaboration-guidelines/blob/v4.3.0/AGENTS.md)
and its relevant procedures at that same tag. A link alone does not load them.

## Local additions and scope

- `profile/README.md` is the public organization profile. Keep it welcoming and
  vision-first; put installation details in the released tool documentation.
- Distinguish available fixture demonstrations from planned robot, simulator,
  provider, and developer-tool integrations. Keep policy grades separate from
  diagnosis hypotheses. Do not imply safety certification or partnerships.
- Pin cross-repository documentation, examples, and downloads to published
  version tags. The curated directory uses release trees, so it needs no moving
  repository-link exception. Same-repository relative navigation follows the
  revision being read.
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
