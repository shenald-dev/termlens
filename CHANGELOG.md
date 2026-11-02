# Changelog

All notable changes to **termlens** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
