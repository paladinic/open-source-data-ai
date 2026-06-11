# Contributing to Open BI Studio

Thank you for your interest in contributing!

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Development Environment](#2-development-environment)
3. [Project Structure](#3-project-structure)
4. [Running Tests](#4-running-tests)
5. [Coding Standards](#5-coding-standards)
6. [Submitting a Pull Request](#6-submitting-a-pull-request)
7. [Reporting Bugs](#7-reporting-bugs)
8. [Suggesting Features](#8-suggesting-features)
9. [Code of Conduct](#9-code-of-conduct)

---

## 1. Prerequisites

- Python 3.10+
- Git
- An API key for at least one LLM provider (Anthropic, OpenAI, or Gemini) if testing AI features

---

## 2. Development Environment

```bash
# Clone and enter the repo
git clone https://github.com/paladinic/open-source-data-ai.git
cd open-source-data-ai

# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# Install the package in editable mode with lite dependencies + dev tools
pip install -e ".[lite]"
pip install pytest pytest-asyncio ruff

# Set up your environment file
cp .env.example .env
# Edit .env — set at least one LLM provider key to use AI features
```

### Running the app locally

```bash
python run_lite.py
# → Open http://localhost:8000
```

> **Note:** The `backend/` directory in the repository is intentionally empty. The FastAPI application is injected into the Python path by `run_lite.py` at startup. Always launch the app via `python run_lite.py` rather than importing the backend directly.

---

## 3. Project Structure

```
open_data_ai/          Python SDK (installable as open-data-ai on PyPI)
  agent.py             LLM call routing and response parsing
  pipeline.py          High-level Pipeline decorator API
  executor.py          Component code execution + caching
  context_builder.py   System prompt construction
  models.py            Pydantic data models
  storage/             BaseStore, MemoryStore, SQLiteStore
  cli.py               open-data-ai CLI entry point

frontend/              Vanilla HTML/CSS/JS web UI
  index.html           Main application
  login.html           Auth UI (full mode only)
  js/                  Client-side modules (api.js, app.js, workspace.js, …)

backend/               FastAPI application (served via run_lite.py)
run_lite.py            Lite mode launcher (no Supabase, no auth)
supabase/              Supabase config and SQL migrations (full mode)
tests/                 pytest test suite
pyproject.toml         Package metadata, dependencies, tool config
```

---

## 4. Running Tests

```bash
pytest tests/          # all tests
pytest tests/ -v       # verbose output
pytest tests/test_pipeline.py   # single module
```

All async tests use `pytest-asyncio`. The `asyncio_mode = "auto"` setting in `pyproject.toml` means no extra markers are needed. Tests do **not** make real LLM API calls.

---

## 5. Coding Standards

- **Linter/formatter:** [ruff](https://docs.astral.sh/ruff/)
  ```bash
  ruff check .                  # lint
  ruff format --check .         # format check
  ruff check . --fix            # auto-fix lint issues
  ruff format .                 # auto-format
  ```
- **Type hints** on public functions and class methods
- **Pydantic v2** for all data models (no v1 compatibility shims)
- **No new dependencies** without opening an issue first to discuss the trade-off
- The executor runs user code via `exec()` in a restricted namespace — keep the security note in `executor.py` in mind when modifying that module

---

## 6. Submitting a Pull Request

1. Fork the repository and create a feature branch:
   ```bash
   git checkout -b feat/my-feature
   ```
2. Make your changes and add or update tests
3. Verify everything passes:
   ```bash
   pytest tests/ && ruff check . && ruff format --check .
   ```
4. Push and open a PR against `main`
5. Fill out the [PR template](.github/pull_request_template.md)

**Commit message style** (Conventional Commits):

```
feat: add Airbyte connector layer
fix: correct null handling in SQLiteStore.get_component
docs: update lite installation guide
chore: bump pydantic to 2.8
test: add executor cache invalidation tests
```

---

## 7. Reporting Bugs

Open a [Bug Report issue](.github/ISSUE_TEMPLATE/bug_report.md). Include your OS, Python version, open-data-ai version, mode (Lite/Full), LLM provider, and the steps to reproduce.

---

## 8. Suggesting Features

Open a [Feature Request issue](.github/ISSUE_TEMPLATE/feature_request.md) or start a [GitHub Discussion](https://github.com/paladinic/open-source-data-ai/discussions). Check the [Roadmap](ROADMAP.md) first to avoid duplicates.

---

## 9. Code of Conduct

This project follows the [Contributor Covenant 2.1](CODE_OF_CONDUCT.md). By participating you agree to abide by its terms.
