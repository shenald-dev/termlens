# Changelog

All notable changes to **termlens** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-11-03

### Added
- **Expanded Semantic Lenses**:
  - `go`: Go toolchain lens for `go test`, `go build`, `go vet`, panics, and compiler error diagnostics.
  - `python-lint`: Linter and typechecker lens for `ruff`, `mypy`, `flake8` extracting error codes and locations.
  - `js-lint`: JavaScript and TypeScript linter lens for `eslint` and `biome` with rule names and file coordinates.
  - `clang`: C/C++ compiler and build tool lens for `gcc`, `clang`, `make`, `cmake` isolating diagnostics and code lines.
  - `dotnet`: .NET C# compiler (`CSxxxx`) and test runner (`[FAIL]`) failure extractor.
  - `custom`: Dynamic user-configurable regex lens configured via config files.
- **Smart Error Deduplication & Clustering Engine (`clusterErrors`)**:
  - Groups cascading duplicate errors into clusters with exemplars, occurrence counts, and location arrays.
  - Configurable error ceiling via `--max-errors <count>` and opt-out flag `--no-cluster`.
- **Zero-Token Silent Success Mode (`-q, --quiet-success`)**:
  - Emits minimal zero-token output (`✓ Passed`, ~3 tokens) on clean exit code 0 to maximize agent context.
- **GitHub Actions CI Workflow Annotations (`--ci`)**:
  - Automatically emits native GitHub Actions workflow commands (`::error file=... line=... col=... title=...::message`).
- **Declarative Configuration System**:
  - Auto-discovery of `termlens.config.json`, `.termlensrc.json`, `.termlensrc`, or `package.json` `termlens` key.
  - Scaffold new configs with `termlens --init`.
- **Token & Financial Cost Savings Telemetry**:
  - Real-time calculation of token savings and estimated dollar savings ($3.00/1M tokens benchmark).
- **File Output Export (`-o, --output <file>`)**:
  - Direct writing of compacted output to disk files.
- **MCP Server v2 Expansion (Protocol 2024-11-05)**:
  - New `termlens_list_lenses` tool for dynamic lens discovery by AI agents.
  - New `termlens_explain` tool offering AI-ready diagnostic guidance for errors.
  - Support for `notifications/initialized` and `prompts/list`.
  - Added `quietSuccess` option to `termlens_exec` and `termlens_compact`.

### Changed
- Refactored `RingBuffer` and memory limits to handle high-throughput CLI streaming safely.
- Upgraded human terminal card with v0.2.0 branding, error clustering summary, and dollar savings telemetry.
- Updated default test runner in `package.json` to automatically discover all test files via `tests/*.test.js`.

## [0.1.0] - 2026-11-02

### Added
- **Core Streaming Engine**: High-performance streaming child process execution with in-memory rolling ring-buffer (`RingBuffer`).
- **Semantic Lenses**:
  - `jest`: Isolates failing test suites, expected vs received values, assertions, and stack frames while collapsing passing suites.
  - `pytest`: Python traceback and assertion extractor (`assert 401 == 200`), stripping test session noise.
  - `tsc`: Multi-file TypeScript compiler error grouping by file path and error codes.
  - `cargo`: Rust compiler and test failure extractor, isolating code pointers (`--> src/...:line:col`).
  - `docker`: Multi-stage Docker build step failure diagnostics and Dockerfile line indicators.
  - `generic`: Universal fallback scanner identifying uncaught exceptions, fatal signals, and file references.
- **Dual Output Formats**:
  - **Human Mode**: Terminal card with status badges, ANSI formatting, and live token reduction metrics.
  - **Agent Mode (`-a, --agent`)**: Ultra-compact, structured Markdown (<100 tokens) tailored for LLMs.
  - **JSON Mode (`-j, --json`)**: Full structured machine-readable JSON telemetry.
- **Model Context Protocol (MCP) Server**:
  - Built-in `stdio` JSON-RPC server with tool discovery (`tools/list`).
  - `termlens_exec`: Execute arbitrary bash/shell commands with automated token compaction.
  - `termlens_compact`: Compact raw terminal text blocks or log traces on the fly.
- **CLI Utilities**:
  - Piped input support (`cat noisy.log | termlens`).
  - Tail line retention (`--tail <lines>`).
  - Raw passthrough mode (`--raw`).
  - Lens inspection (`--list-lenses`).
