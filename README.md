# Living Proof Labs

Helping robots help humans through clear capability requirements, inspectable
evidence, and understandable reports.

**[Start with the welcome page](profile/README.md)** for the vision, a released
fixture demo, and a short guide to the projects.

This repository hosts our public GitHub organization profile. The welcome page
is published from `profile/README.md`; contributor guidance is in
[AGENTS.md](AGENTS.md).

## Repository directory

[`config/github/repositories.json`](config/github/repositories.json) is the
sole canonical inventory of Living Proof Labs repositories. Register a new
project there through a pull request. The inventory is validated locally with
`npm run check` and `npm test`.

The reusable GitHub repository-settings policy is pinned in
[`config/github/repository-policy.json`](config/github/repository-policy.json)
to a published release tag, exact commit, and verified tool blob. Run
`task github:settings:check` to fail on policy drift or incomplete state, or
`task github:settings:report` for the same read-only audit without treating
existing drift as a CI failure. Both download and verify the released tool
before executing it with this inventory. The released policy keeps its UI-only
preferences (sponsorships, Archive Program preservation, Git LFS archives,
ref-update limits, and linked-issue closing) explicit for manual review; the
API audit does not misrepresent them as enforced. Neither task applies settings.
Applying any settings or branch policy remains a separately authorized operation.
The pull-request workflow uses its read-only workflow token, which may not read
repository-administration fields for every registered repository. Its report is
therefore an access-limited observation, not a fleet-compliance attestation;
run the strict check with an authorized administrator token for that decision.
