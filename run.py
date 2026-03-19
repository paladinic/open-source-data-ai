#!/usr/bin/env python3
"""
Lite-mode launcher — no Docker, no Supabase, no auth.

Usage:
    python run.py              # starts on http://localhost:8000
    python run.py --port 9000
    python run.py --no-browser
"""
import argparse
import os
import sys
import threading
import webbrowser
from pathlib import Path

# Ensure the backend package is importable when run from the repo root
sys.path.insert(0, str(Path(__file__).parent / "backend"))


def main():
    parser = argparse.ArgumentParser(description="Open-Source Data AI (lite mode)")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-browser", action="store_true", help="Don't open a browser tab automatically")
    args = parser.parse_args()

    # Lite mode is triggered by an empty SUPABASE_URL.
    # Override to "" so it takes precedence over any value in .env.
    os.environ["SUPABASE_URL"] = ""

    url = f"http://localhost:{args.port}"

    if not args.no_browser:
        # Open the browser 1.5 s after uvicorn starts — gives it time to bind.
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()

    print(f"\n  Open-Source Data AI  →  {url}\n  Press Ctrl+C to stop.\n")

    import uvicorn
    uvicorn.run(
        "main:app",
        app_dir=str(Path(__file__).parent / "backend"),
        host="127.0.0.1",
        port=args.port,
        reload=False,
    )


if __name__ == "__main__":
    main()
