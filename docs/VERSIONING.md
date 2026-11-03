# Versioning

Kraven Video Studio follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html). Current baseline: **1.0.0**. Repository: **kravetech/kraven-video-studio**.

This repository begins with a fresh reviewed source snapshot. Earlier repositories may have used the same or higher version numbers. Identify this baseline by its complete release commit and archive checksum, not the version string alone. Do not merge previous repository history into this repository.

| Change | Version example |
| --- | --- |
| Initial stable contract | 1.0.0 |
| Backward-compatible bug/security fix | 1.0.0 → 1.0.1 |
| Backward-compatible feature | 1.0.0 → 1.1.0 |
| Incompatible public contract/migration | 1.0.0 → 2.0.0 |

Public compatibility covers documented CLI commands/flags, composition IDs, profile IDs, configuration/edit/review schemas and approval requirements. Preserve existing user settings/media during deliberate upgrades; managed tool paths may refresh. Changed metadata that invalidates historical approvals must be documented explicitly. Never reinterpret earlier reviews as new consent. Third-party tool versions are pinned independently.

**package.json is the version authority.** installer/toolchain.lock.json productVersion, README, INSTALL and ARCHITECTURE must agree. CHANGELOG's first release entry must match. Run pnpm version:check; CI requires tags to equal v<package-version>. The installer records the product version locally.

For later releases, write the new top CHANGELOG entry, then run pnpm version:set <next-version> to inspect the plan. Add --write to update local metadata. The setter refuses non-increasing/invalid versions and performs no Git publication. Run pnpm check, installer/privacy/license checks and applicable media tests before promotion.

Use an immutable reviewed commit and matching tag after publication authorization. Never replace files under a published version within this repository. Keep package.json private=true: GitHub source distribution does not require npm publication.

Synthetic tests establish mechanical behavior only. Account access, real transcript accuracy, editorial approval and production cutover remain operator responsibilities. See [validation](VALIDATION.md) and [known issues](KNOWN-ISSUES.md).
