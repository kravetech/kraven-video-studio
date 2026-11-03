# Contributing

Use synthetic or redistributable examples. Keep media, models, credentials, local tool paths and generated files out of Git. Changes must preserve raw files and explicit review gates.

Run `pnpm typecheck`, `pnpm test`, and `pnpm test:installer` in the tool-enabled shell. For installer/toolchain/render changes, repeat `installer/Doctor.ps1 -Smoke` and document the OS/backend, dependency versions and results. Validate behavior on a clean Windows machine before expanding compatibility claims.

Keep workflow rules in maintained references instead of duplicating them in Claude/provider adapters. Changes to visual defaults need before/after review. New functionality requires a semantic version and changelog entry. Do not add new public format/support promises without matching implementation and tests.

Original code is Apache-2.0. Contributions intentionally submitted for inclusion are governed by its contribution terms unless explicitly stated otherwise; retain applicable third-party attribution.

Before sharing changes, run `pnpm check:privacy` and `pnpm check:licenses --installed`. The license snapshot is Windows-install metadata bound to the exact lockfile, not legal clearance. After a deliberate dependency change, run `pnpm check:licenses --refresh`, review every exception/notice and commit the sanitized inventory with the lockfile. Never suppress new unknown license metadata. Read [PUBLIC-RELEASE.md](docs/PUBLIC-RELEASE.md) for the publication checklist. Do not publish private production history.

## Commit email privacy

Use your GitHub-provided noreply address when personal commit-email privacy is required. Set `git config user.email` in this repository, then verify the effective value with `git config --show-origin --get user.email`. Enable GitHub's email privacy and command-line email-exposure blocking settings. These settings protect future commits; they do not rewrite existing history or guarantee that every commit in a multi-commit push is checked.

Before publication, inspect author/committer/tag metadata as well as source and packaged files. Keep private detection lists outside the public repository. Coordinate any authorized history rewrite, preserve a private backup, update affected release identities and use a fresh clone afterward. Do not merge or push superseded history back.
