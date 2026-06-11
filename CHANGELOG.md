# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-03-13

### Added

- Core `Pipeline` SDK with decorator-based component registration (`@pipeline.component`)
- Four component types: ETL, Modelling, Visualisation, Code
- Dependency chaining between components via `depends_on`
- Filter inputs support for parametric pipeline runs
- Multi-provider LLM support: Anthropic Claude, OpenAI GPT, Google Gemini
- AI chat interface per component (`pipeline.chat()`)
- Storage backends: `MemoryStore` (in-process) and `SQLiteStore` (persistent local file)
- Supabase integration for full-mode authentication and cloud storage
- FastAPI web backend with REST API
- Vanilla JS/HTML/CSS web UI (index.html, login.html)
- Lite mode launcher — no Docker, no auth required (`python run_lite.py` / `open-data-ai serve`)
- `open-data-ai` CLI entry point with `serve` subcommand
- Execution caching with configurable TTL
- Demo project loaded on first lite-mode launch
- Initial test suite: 6 modules covering pipeline, executor, agent, models, storage, and context builder
- MIT license

[0.1.0]: https://github.com/paladinic/open-source-data-ai/releases/tag/v0.1.0
