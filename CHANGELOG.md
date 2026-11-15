# Changelog

All notable changes to **termlens** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] — Major Evolution - 2026-11-15

### Added
- **Deterministic Incident Flight Recorder (`FlightRecorder`)**:
  - Captures tamper-proof, deterministic flight recordings in `.termlens/flights` for every command run.
  - Records session ID, timestamp, Git branch and commit SHA, exit code, duration, clustered failure signatures, and token savings telemetry.
  - Automatic sliding retention with configurable auto-pruning.
  - Dedicated CLI management: `termlens flight list`, `termlens flight show <id>`, `termlens flight diff <id1> <id2>`.
- **Semantic Run Diff Engine (`diffFlights`)**:
  - Instantaneous semantic diffing (`--diff-last`, `--diff-with <id>`, or MCP `termlens_diff`) comparing the current execution with past runs.
  - Categorizes failures into **Resolved Failures**, **New / Regressed Failures**, and **Persistent Failures**.
  - Slashes developer and AI agent debugging iteration cycles by providing exact delta feedback.
- **Neuro-Symbolic AST & Source Context Resolver (`SourceContextResolver`)**:
  - Automatically resolves local source code around error coordinates (`file:line:col`) with path traversal guards and bounded caching.
  - Renders exact syntax snippets with target pointer (`> 42 | ...`) and context radius.
  - Embeds source context directly into isolated failures, saving AI agents an entire extra tool-calling turn.
- **Autonomous Remediation & Diagnostic Heuristics Engine (`RemediationEngine`)**:
  - Rule-based root-cause analysis detecting missing packages (`npm install`, `pip install`, `go mod tidy`), TypeScript type errors (`TS2322`, `TS2339`), test assertions, linter autofixes, port collisions (`EADDRINUSE`), and Node.js heap exhaustion.
  - Synthesizes actionable shell commands and patch hypotheses.
- **Expanded Modern Ecosystem Lenses (14 Total Lenses)**:
  - `node-test`: Native Node.js test runner (`node --test` / TAP subtests / YAML assertion diagnostics).
  - `bundler`: Modern bundlers & frameworks (Vite, Next.js, Turbopack, Webpack, esbuild, Rollup).
  - `gradle-maven`: Java & Kotlin build tools (Gradle, Gradle Wrapper, Maven, javac, JUnit assertions).
- **Model Context Protocol (MCP) Server v3 Expansion (Protocol 2024-11-05)**:
  - MCP Resources: `termlens://flights/latest`, `termlens://flights/{id}`, `termlens://lenses`.
  - New MCP Tools: `termlens_suggest_fix`, `termlens_diff`, `termlens_flight_inspect`.
  - New MCP Prompt: `diff_runs` for regression root-cause analysis.
- **Empirical Benchmark Suite (`benchmarks/run-benchmarks.js`)**:
  - Standardized benchmark modeling real-world workloads across Jest, Docker, Node.js TAP, Vite, and Gradle.
  - Measures throughput (lines/sec, MB/sec), min/p50/p95/p99 latency, and heap memory footprint.

### Optimized
- **Bounded Sliding-Window Streaming Aggregator**:
  - Prevents V8 heap out-of-memory crashes on high-volume logs with configurable `maxRawBytes` streaming limits.
  - Sub-millisecond parsing latency (0.11ms median) at 480,000+ lines/sec throughput.

### Fixed
- Enforced cross-platform LF line endings via `.gitattributes`.

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
