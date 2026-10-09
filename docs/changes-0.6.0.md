# Citropy 0.6.0 release fixes

This note covers the release fixes and validation for version 0.6.0. The product changes for this version are listed in [CHANGELOG.md](../CHANGELOG.md).

## Release checks

The desktop smoke check and browser performance check looked for Settings before opening the account menu. Both now open that menu first, then verify that Settings can be opened and loaded. These changes update test navigation; they do not change interface components.

## macOS terminal service sockets

The terminal service previously used a socket path derived from the system temporary directory. On macOS, a long temporary path could exceed the operating system's Unix socket path limit and prevent the service from starting.

New Unix sockets now use a short temporary directory and save their address for reconnects. If the system temporary directory still produces an overlong path, startup retries under `/tmp`. The client can reconnect through a saved address or a valid legacy address; on macOS it skips legacy addresses that are too long. An overlong legacy path is treated as an unavailable service so startup can recover by creating a short socket.

## Validation and release

The 0.6.0 release workflow passed its type check, security audit, unit tests, UI tests, backend checks, package builds, smoke checks, and installer checks on Linux, macOS, and Windows. The full unit suite passed 357 tests; the UI suite passed 87 tests after a production build.

The release is published as `v0.6.0` with Linux, Windows, and macOS downloads, updater metadata, and a `SHA256SUMS` file: [Citropy 0.6.0](https://github.com/tinuxongit/Citropy/releases/tag/v0.6.0).
