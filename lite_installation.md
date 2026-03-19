# Lite Installation

No Docker. No Supabase. No account required.
Just Python, a terminal, and an LLM API key.

---

## Prerequisites

- **Python 3.11+** — check with `python --version`
- An API key from one of: [Anthropic](https://console.anthropic.com), [OpenAI](https://platform.openai.com), or [Google AI](https://aistudio.google.com)

---

## 1. Clone the repo

```bash
git clone https://github.com/paladinic/open-source-data-ai.git
cd open-source-data-ai
```

---

## 2. Create a virtual environment

```bash
python -m venv venv
```

Activate it:

- **macOS / Linux:** `source venv/bin/activate`
- **Windows:** `venv\Scripts\activate`

---

## 3. Install dependencies

```bash
pip install -r requirements-lite.txt
```

---

## 4. Add your API key

Create a file called `.env` in the root of the repo:

```bash
# .env

# Pick one (or more) — the app lets you choose which one to use in Settings
ANTHROPIC_API_KEY=your-key-here
OPENAI_API_KEY=your-key-here
GEMINI_API_KEY=your-key-here
```

You only need one key. The app will use whatever you provide.

---

## 5. Run

```bash
python run.py
```

The app opens automatically in your browser at `http://localhost:8000`.
A `data.db` file is created in the repo root — this is your local database.
A demo project is loaded on first launch so you can explore straight away.

Press `Ctrl+C` in the terminal to stop the server.

---

## Options

```bash
python run.py --port 9000       # use a different port
python run.py --no-browser      # don't open a browser tab automatically
```

---

## Updating

```bash
git pull
pip install -r requirements-lite.txt   # pick up any new dependencies
python run.py
```

Your `data.db` is not touched by updates.

---

## Notes

- Everything is stored locally in `data.db`. No data leaves your machine except the prompts you send to your LLM provider.
- There is no login or user management in lite mode — it is designed for single-user local use.
- If you later want multi-user access, auth, and cloud storage, see the full installation guide which uses Supabase.
