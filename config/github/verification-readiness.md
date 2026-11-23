# Fleet verification readiness — 19 November 2026

Initial source audit for [#140](https://github.com/Living-Proof-Labs/.github/issues/140)
and [#141](https://github.com/Living-Proof-Labs/.github/issues/141).
The canonical inventory is `config/github/repositories.json`; this is a dated
assessment, not a replacement inventory or an apply plan. Fresh main checkouts
were read before editing, together with issue comments and open pull requests.

Only `.github` and the three robot repositories are currently enrolled in the
checked-in required-check policy. Their source handles `merge_group`; this audit
does not claim their live rules or queue runs were verified. The original snapshot found fourteen of the nineteen active repositories lacking
merge-group handling in the principal workflow. That count is historical, not a
fresh fleet-wide audit; the bounded refresh below covers verification and Gazebo.

| Repository | Gate candidate | Queue event and coverage | Enrollment readiness | Docs freshness |
| --- | --- | --- | --- | --- |
| [.github](https://github.com/Living-Proof-Labs/.github/tree/53f55dd44c9f77a0d29372df47cb4e74005a6d89) | verify.yml: Repository verification gate | yes; six dependencies, event-specific audit skip | enrolled | no docs deployment |
| [capability-verifier](https://github.com/Living-Proof-Labs/capability-verifier/tree/9e32d4759f5118b868d451757812c36ed8b883a5) | verify.yml: aggregate needed | no; include verify, report, report-results, documentation, devcontainer, verifier-image-record, hallway-image-pr | blocked: add merge_group and image condition | fails stale read |
| [collaboration-guidelines](https://github.com/Living-Proof-Labs/collaboration-guidelines/tree/1df8fb041de87b419d90eb5ef20936b1a0ba3b93) | verify.yml: aggregate needed | no; verify plus shared-host, generated-documentation, tooling-image | blocked; coordinate #114 owner | fails stale read (manual.yml) |
| [living-proof-labs.github.io](https://github.com/Living-Proof-Labs/living-proof-labs.github.io/tree/69f2fa2d2e760d7e4fee7a6e1889e388d91116f5) | docs.yml: build | no; single unconditional build | add merge_group; keep #69 content files separate | validated skip |
| [livingproof](https://github.com/Living-Proof-Labs/livingproof/tree/d3ebbe1142b0d47eb5dbd35eca934f19aa810ca5) | verify.yml: aggregate needed | no; verify and development | add merge_group and completeness gate | validated skip |
| [livingproof-booster-t1](https://github.com/Living-Proof-Labs/livingproof-booster-t1/tree/56f6051fd9ee9fdb17f609bf559b7efc8220088a) | test.yml: Robot verification gate | yes; test matrix | enrolled | fails stale read (docs.yml) |
| [livingproof-capability-report](https://github.com/Living-Proof-Labs/livingproof-capability-report/tree/c9aa728f157d54b1c7974442f382b7d4c0c72b1c) | verify.yml: verify | no; also development/documentation workflows; filtered saved-release workflow needs explicit policy | blocked; coordinate reporter #98 | skip; malformed-SHA hardening remains |
| [livingproof-common](https://github.com/Living-Proof-Labs/livingproof-common/tree/ed85ec37df3d66d7d3eb1a4b33ff374fba267e8a) | verify.yml: aggregate needed | no; verify and documentation | add merge_group and completeness gate | fails stale read |
| [livingproof-evaluator](https://github.com/Living-Proof-Labs/livingproof-evaluator/tree/c9e283dc6be6c4a8759d6d5d82168dc86c7d9237) | verify.yml: verify | no; unconditional; manual build is separate | add merge_group; decide manual coverage | fails stale read (manual.yml) |
| [livingproof-evaluator-run](https://github.com/Living-Proof-Labs/livingproof-evaluator-run/tree/dd60a9fbaeefce36310595a7730ea595911207f9) | verify.yml: verify | no; unconditional; docs build is separate | add merge_group; decide docs coverage | validated skip |
| [livingproof-evaluator-scenario](https://github.com/Living-Proof-Labs/livingproof-evaluator-scenario/tree/b508729fb843aaf60a1af0a7eecf6ed1f0c4498e) | verify.yml: verify | no; unconditional; docs build is separate | add merge_group; decide docs coverage | fails stale read (docs.yml) |
| [livingproof-sim-gazebo](https://github.com/Living-Proof-Labs/livingproof-sim-gazebo/tree/64435ebe0e6667c99223730c6f2a2f78ec66c52d) | verify.yml: Gazebo verification gate (proposed) | no on audited main; proposed gate covers verify and publish-tests, fork-only publication skip | workflow draft first; do not enroll before merge | fails on audited main; validated skip proposed |
| [livingproof-sim-mujoco](https://github.com/Living-Proof-Labs/livingproof-sim-mujoco/tree/d39114ce155bf62f506569b02cc9b25b7e3356ff) | verify.yml: aggregate needed | no; verify, test-arm64, publish-tests; fork-only publication skip | add merge_group and completeness gate | skip; malformed-SHA hardening remains |
| [livingproof-unitree-g1](https://github.com/Living-Proof-Labs/livingproof-unitree-g1/tree/cdab1cfe50351bc8611cab5dbb6d1a1b23cc179f) | test.yml: Robot verification gate | yes; test | enrolled | fails stale read (manual.yml) |
| [livingproof-unitree-go1](https://github.com/Living-Proof-Labs/livingproof-unitree-go1/tree/fe48f8bda30aa0a65bd01b06107fc76874195f35) | test.yml: Robot verification gate | yes; test | enrolled | fails stale read (docs.yml) |
| [livingproof-verification](https://github.com/Living-Proof-Labs/livingproof-verification/tree/0012f7572d8607c222d9233fddb3e6cd53ee9243) | verify.yml: verification; checks.yml: checks, bundle-release-engine, renovate | yes; verification aggregates locks and ten scenarios; separate checks not included in that gate | stage only after all four check contexts are confirmed; coordinate #143 | site publication uses a separate history/deployment path; not assessed by freshness scan |
| [livingproof-worlds](https://github.com/Living-Proof-Labs/livingproof-worlds/tree/df5ba0916f04171140de6746bbacc4f3a4013ba1) | verify.yml: verify | no; unconditional; manual build separate | add merge_group; decide manual coverage | fails stale read (manual.yml) |
| [robot-capability-specs](https://github.com/Living-Proof-Labs/robot-capability-specs/tree/9db79d2801c1668169db5c86d87f5c9b8b7a2332) | verify.yml: verify | no; unconditional | add merge_group | skip; malformed-SHA hardening remains |
| [unitree-foxglove-sdk](https://github.com/Living-Proof-Labs/unitree-foxglove-sdk/tree/2afda1bbad7c9c2f549e7cfca16ad6c1012262a3) | none proposed | no; legacy ci/locomotion remain in source | EXCEPTION: deprecated; do not revive or enroll | not applicable |
| [website](https://github.com/Living-Proof-Labs/website/tree/63b664e8a994e4e885890614adce0018e9d70864) | release.yml: Verify static site inputs | no; unconditional | add merge_group; deploy excluded | deployment is separate; no main-freshness guard found |

## Bounded rollout refresh — 19 November 2026

The [authoritative handoff](https://github.com/Living-Proof-Labs/.github/issues/141#issuecomment-7023991706)
corrects the [preview run](https://github.com/Living-Proof-Labs/.github/actions/runs/44627913772):
at `.github` main `28cfb4b8c9891f1233e9fb818fc09d0e3e444fed`, every
change/write list was empty. That preview checked the four enrolled repositories;
it did not propose fleet enrollment. The active policy still contains those four.

The initial verification source assessment used main at
[`d3e36b11af8d034040f689cd2ac21709af934c17`](https://github.com/Living-Proof-Labs/livingproof-verification/tree/d3e36b11af8d034040f689cd2ac21709af934c17).
Both `checks.yml` and `verify.yml` run unfiltered on pull requests and
`merge_group: checks_requested`. Complete coverage requires **four** contexts:

| Context | Coverage |
| --- | --- |
| `checks` | Lint, format, Python tests, workflow lint, fixture site and browser checks |
| `bundle-release-engine` | Separate offline shared-engine regression job |
| `renovate` | Separate configuration validation and reporter extraction tests |
| `verification` | Lock guard, all ten scenario jobs, world and parameter-digest integrity |

The last three are not covered by `checks`. Release, site publication and Pages
are main-only publishing work, excluded from PR/queue verification.
[The workflow prerequisite #166](https://github.com/Living-Proof-Labs/livingproof-verification/pull/166)
fixed acceptance of incomplete evidence and merged at
`6814a4b689ba417cd0da4040862205ffa96fde2f`. Its complete exact-main
[verify run 44631914027](https://github.com/Living-Proof-Labs/livingproof-verification/actions/runs/44631914027)
succeeded. Missing and unexpected jobs now fail alongside non-success results;
the regression covers pull-request and merge-group evidence. This establishes
integrated workflow readiness, not live required-check enrollment.

The proposed entry (`proposals/141-verification-checks.json`, removed when
#141 closed and the repository was archived) was deliberately outside
`repository-policy.json`: no command loads it automatically. It requires all four
contexts from Actions app **15368**, strict checks and enforcement on creation.
The validator now permits an explicit strict choice with a queue, and reconciliation
retains that choice instead of forcing it false. Existing four-repository policy,
ALLGREEN queue, extra checks, PR protections and empty bypass remain intact.
The non-strict choice for existing queued entries remains supported.

This expands the two-context minimum in
[verification #105](https://github.com/Living-Proof-Labs/livingproof-verification/issues/105),
[#160](https://github.com/Living-Proof-Labs/livingproof-verification/pull/160)
(head `f8fbb3be0952dce1dadb49e4e6134d19e3558905`) and
[central #144](https://github.com/Living-Proof-Labs/.github/pull/144)
(head `867481d3b6be5372f6bdc91e90d552a882e45e26`). Those drafts remain owned
separately. Their writer remains unactivated. Keel must reconcile the four-context
coverage requirement with that lane before activation; two named checks alone
would silently omit the separate engine and Renovate checks.

[Gazebo #56](https://github.com/Living-Proof-Labs/livingproof-sim-gazebo/pull/56)
is still open draft, currently at `72ba30ad7a3fc7caaa89f2a5cb67f92882dab5ce`,
not the earlier handoff head `c85bb2ea601b335da5ba6ffd1fec6bc9e2ff54b3`.
Its [PR run](https://github.com/Living-Proof-Labs/livingproof-sim-gazebo/actions/runs/44497212748)
reports successful verify, publish-tests and Gazebo verification gate; deploy-docs
is skipped on PRs. This is not merged-main readiness or independent review of the
new head. Refreshed Gazebo main `9a63a07eef1a7fffec62d29cbbe460ed149c78e8`
still lacks the merge-group trigger and aggregate gate. Reuse #56; do not enroll
its gate before merge and main verification.

[Independent Standard review](https://github.com/Living-Proof-Labs/.github/issues/141#issuecomment-7024348902)
found no blocking code findings at central #145
`ffdae9f0ddbc9c4dc7d45fc13b7f503319eac15e` and verification #166
`8047c2816350e49a7a88f6c8bca608f5d771711b`. Their exact-head workflows passed,
including central [run 44630303989](https://github.com/Living-Proof-Labs/.github/actions/runs/44630303989).
That review applies to those heads; this documentation delta needs independent
review arranged by Keel.

Before promoting this proposal into active policy: reconcile the four-context
contract in #105 with the existing writer owner and recheck current open work.
Accepting a superset of two contexts does not enforce the full four-context set.
Then separately review verification-only enrollment and a new protected settings
preview with real additions. Gazebo remains a later stage; its unmerged #56 does
not block the verification-only slice. Settings application requires separate
approval; subsequent live
ruleset readback and successful/failing actual merge-group evidence remain pending.
Local negative tests do not establish GitHub server queue behavior. The remaining
fleet rows above are dated gaps, not repaired by this slice; the deprecated SDK
exception remains unchanged.

## Decisions and staged rollout

1. A confirmed different, valid main SHA is an expected superseded docs run:
   skip deployment and explain it in the summary. Authentication failures,
   unavailable refs, malformed SHAs, and unexpected refs remain errors. Keep the
   deployment concurrency lock held through the read and deployment. There is
   still a read-to-deploy race; this does not replace the lock or prove atomicity.
2. Release authorization remains an independent exact-SHA decision. Gazebo's
   `workflow_run` push/main/repository/conclusion/head-SHA predicates are untouched.
3. Add workflow event handling and completeness tests before policy enrollment.
   Required checks must come from GitHub Actions app **15368**. Preserve existing
   additional checks from other apps; reject a conflicting source for a managed
   context. Do not apply this audit as settings.
4. Aggregate all applicable verification jobs, rejecting failure, cancellation,
   unexpected skips, missing evidence, and unexpected dependencies. Document
   event-specific skips explicitly. Never enroll a workflow filtered out by paths.
   Test PR and merge-group event behavior before staging the policy entry.
5. `unitree-foxglove-sdk` is a deliberate deprecated exception. Do not restart its
   legacy workflow, add a fake passing gate, or claim full-fleet enforcement.
6. After workflow changes merge, separately review policy entries, preview the
   protected settings workflow, obtain concrete application approval, apply,
   inspect rulesets, and demonstrate real merge-group gate runs. None of those
   live operations are part of these drafts.

## Release-pin audit

The direct Gazebo equality was already fixed by
[livingproof-sim-gazebo#51](https://github.com/Living-Proof-Labs/livingproof-sim-gazebo/pull/51).
The targeted fleet scan found no additional test asserting a literal current
semantic-release version. Existing guidelines-pin tests generally validate exact
release syntax and shared preset equality. Literal versions in synthetic mutation
fixtures are intentional. The verification site's v9.6.10 engine harness records
an immutable test input and is not a current-workflow equality; retain its reviewed
fixture provenance. The Gazebo follow-up adds executable mismatch, floating/partial/
SHA pin rejection, and simultaneous exact-bump acceptance tests. This source audit
does not mean the full test suite in every repository has run.

## Coordination and limits

Keep shared semantic-release engine changes with guidelines #114. Avoid Gazebo
OSRF tests and monitor (#48/#53), verification repository-display (#143), publisher
content lock/Renovate (#69), and reporter provenance (#98). The Gazebo workflow
change is limited to merge-group handling, docs freshness and a completeness gate;
report that workflow overlap before editing. Re-read main and open PRs before each
subsequent slice. Enrollment and live verification remain outstanding.
