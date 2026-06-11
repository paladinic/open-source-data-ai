# Roadmap

## v0.1.0 — Current (Foundation)

- Core Pipeline SDK with decorator-based component registration
- Four component types: ETL, Modelling, Visualisation, Code
- Dependency chaining between components (`depends_on`)
- Multi-provider LLM support: Anthropic Claude, OpenAI GPT, Google Gemini
- Storage backends: MemoryStore (in-process) and SQLiteStore (persistent)
- Supabase integration for full-mode auth and cloud storage
- FastAPI backend with lite/full server modes
- Vanilla JS/HTML/CSS web UI
- Lite mode launcher — no Docker, no auth required (`python run_lite.py`)
- `open-data-ai` CLI entry point
- Execution caching with configurable TTL
- Initial test suite (6 modules)

## v0.2.0 — Connectors & Developer Experience

- [ ] Data source connectors (Airbyte integration)
- [ ] Improved error messages during component execution
- [ ] Component renaming and import resolution
- [ ] CLI enhancements: `pipeline inspect`, `pipeline run`
- [ ] Better loading UX in the web UI

## v0.3.0 — Collaboration

- [ ] Multi-user support in full mode
- [ ] Dashboard and workspace sharing
- [ ] Workspace member management

## Future / Under Consideration

- MCP server integration
- Scheduled pipeline runs
- Onboarding tour for new users
- Notebook-first authoring mode

## Contributing

Have an idea? Open a [GitHub Discussion](https://github.com/paladinic/open-source-data-ai/discussions)
or file a [feature request issue](.github/ISSUE_TEMPLATE/feature_request.md).
