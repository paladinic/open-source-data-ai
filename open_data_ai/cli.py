"""
Command-line interface stub for open-data-ai.
"""

from __future__ import annotations

import argparse
import sys


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="open-data-ai",
        description="open-data-ai — headless Python SDK for component-based data pipelines",
    )
    subparsers = parser.add_subparsers(dest="command")

    # serve — start the web UI
    serve_parser = subparsers.add_parser("serve", help="Start the web application")
    serve_parser.add_argument("--port", type=int, default=8000, help="Port to listen on")
    serve_parser.add_argument("--no-browser", action="store_true", help="Don't open a browser tab")

    args = parser.parse_args()

    if args.command == "serve":
        _serve(args.port, not args.no_browser)
    else:
        parser.print_help()
        sys.exit(0)


def _serve(port: int, open_browser: bool) -> None:
    import os
    import threading
    import webbrowser
    from pathlib import Path

    # Ensure backend is on sys.path
    backend_dir = Path(__file__).parent.parent / "backend"
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    os.environ.setdefault("SUPABASE_URL", "")

    url = f"http://localhost:{port}"
    if open_browser:
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()

    print(f"\n  open-data-ai  →  {url}\n  Press Ctrl+C to stop.\n")

    import uvicorn

    uvicorn.run(
        "main:app",
        app_dir=str(backend_dir),
        host="127.0.0.1",
        port=port,
        reload=False,
    )


if __name__ == "__main__":
    main()
