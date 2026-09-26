# Citropy

## Releases

- Every release must list its changes. Before running the Release workflow, add a `## <version>` section to `CHANGELOG.md` with at least one `- ` item under a `### Added`, `### Changed`, or `### Fixed` heading.
- Write each item for people using the app: what they will notice, not how the code changed.
- The Release workflow fails without that section and publishes it as the release notes, which the app shows before updating. Details are in `docs/release.md`.
