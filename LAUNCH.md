# Launching the app

## Lite mode (no Docker, no Supabase — recommended for local dev)

```bash
venv\Scripts\activate
python run_lite.py
```

Opens `http://localhost:8000` automatically. Data stored in `data.db`.

## Full mode (requires Supabase running)

```bash
venv\Scripts\activate
cd backend
uvicorn main:app --reload
```

Requires `SUPABASE_URL` and related keys in `.env`.
To switch to lite mode, comment out `SUPABASE_URL` in `.env` or use `run_lite.py`.
