# Open BI Studio

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue)](https://www.python.org)
[![CI](https://github.com/paladinic/open-source-data-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/paladinic/open-source-data-ai/actions/workflows/ci.yml)

> Build auditable, component-based data pipelines and dashboards using natural language — locally, no cloud required.

Open BI Studio is a Python SDK and web UI for defining data pipeline components (ETL, Modelling, Visualisation, Code) that an LLM can generate, edit, and chain together. All components are stored, versioned, and re-runnable. The lite mode runs entirely on your machine with no cloud dependency or authentication.

---

## Features

- **Component-based pipelines** — build pipelines from typed, reusable components that chain together via explicit dependencies
- **Four component types:** ETL, Modelling, Visualisation, Code
- **Multi-LLM:** Anthropic Claude, OpenAI GPT, Google Gemini — bring your own key
- **Two modes:** Lite (local SQLite, no auth, single user) and Full (Supabase, multi-user)
- **Headless SDK:** use `Pipeline` programmatically without the web UI
- **Auditable:** every component is stored and can be re-run or exported as a Jupyter notebook

---

## Quick Start (Lite Mode)

```bash
# 1. Clone
git clone https://github.com/paladinic/open-source-data-ai.git
cd open-source-data-ai

# 2. Create and activate a virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements-lite.txt

# 4. Configure your LLM provider
cp .env.example .env
# Edit .env and set your API key (Anthropic, OpenAI, or Gemini)

# 5. Run
python run_lite.py
```

Open `http://localhost:8000` in your browser.

For a detailed walkthrough see [lite_installation.md](lite_installation.md).

---

## SDK Usage (Headless)

```python
from open_data_ai import Pipeline

pipeline = Pipeline()

@pipeline.component(type="etl")
def load_data(inputs):
    import pandas as pd
    return pd.read_csv("data.csv")

@pipeline.component(type="etl", depends_on=["load_data"])
def summarise(inputs):
    df = __import__("pandas").DataFrame(inputs["load_data"])
    return df.describe().reset_index()

result = pipeline.run("summarise")
```

With AI code generation:

```python
from open_data_ai import Pipeline
from open_data_ai.storage import SQLiteStore

pipeline = Pipeline(
    store=SQLiteStore("my_pipeline.db"),
    llm_provider="anthropic",
    api_key="sk-ant-...",
)
reply = pipeline.chat("load_data", "Load the CSV at ./sales.csv and clean nulls")
```

---

## Component Types

| Type | Purpose | Typical Output |
|------|---------|----------------|
| ETL | Fetch and transform data | List of dicts / DataFrame |
| Modelling | Train or run ML models | Python object / metrics dict |
| Visualisation | Build chart configs | Chart.js-compatible dict |
| Code | Shared utilities used by other components | Python namespace |

---

## Architecture

```
frontend/  (Vanilla JS + HTML)
    ↓ HTTP
backend/   (FastAPI — served via run_lite.py)
    ↓
open_data_ai/  (Python SDK)
    ├── pipeline.py      — Pipeline API and component registry
    ├── agent.py         — LLM routing (Anthropic / OpenAI / Gemini)
    ├── executor.py      — Component code execution + caching
    ├── context_builder.py — System prompt construction
    └── storage/         — BaseStore, MemoryStore, SQLiteStore
```

---

## Lite vs Full Mode

| | Lite | Full |
|--|------|------|
| Auth | None (single user) | Supabase (multi-user) |
| Database | SQLite (local file) | PostgreSQL via Supabase |
| Setup | `python run_lite.py` | Docker + Supabase CLI |
| Suitable for | Local dev, personal use | Teams, hosted deployments |

---

## Running Tests

```bash
pip install pytest pytest-asyncio
pytest tests/ -v
```

---

## Security

The component executor runs LLM-generated Python code in a restricted namespace. This is MVP-level sandboxing — **do not expose the server to a public network** without additional isolation. See [SECURITY.md](SECURITY.md) for the full security model.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). All contributions are welcome.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Roadmap

See [ROADMAP.md](ROADMAP.md).

## License

MIT — see [LICENSE](LICENSE).
