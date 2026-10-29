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

The reusable GitHub repository-settings policy and its safe apply tool are
being prepared in
[`collaboration-guidelines` pull request 33](https://github.com/Living-Proof-Labs/collaboration-guidelines/pull/33).
This directory intentionally does not pin a branch or an unreleased tag. After
that policy is merged and has a published release tag, a follow-up change will
pin that exact tag here and invoke its read-only audit against this inventory.
No organization settings will be changed by registration or validation.
