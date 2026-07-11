#!/usr/bin/env python3
"""Serve FluidBalls on a loopback-only HTTP origin and open it in a browser.

No dependencies are required. The server binds only to 127.0.0.1, serves only
this project directory, disables caching during development, and chooses a free
port automatically unless --port is supplied.
"""

from __future__ import annotations

import argparse
import functools
import http.server
import os
from pathlib import Path
import socketserver
import sys
import threading
import webbrowser


HOST = "127.0.0.1"
DEFAULT_PAGE = "index.html"


class FluidBallsHandler(http.server.SimpleHTTPRequestHandler):
    """Static handler with development-friendly cache and security headers."""

    server_version = "FluidBallsLocal/1.0"

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def log_message(self, format_string: str, *args: object) -> None:
        print(f"[{self.log_date_time_string()}] {format_string % args}")


class ReusableThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run FluidBalls from a safe localhost origin."
    )
    parser.add_argument(
        "--port",
        type=int,
        default=0,
        help="TCP port to use. Default 0 asks the OS for a free port.",
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Do not open the page automatically.",
    )
    parser.add_argument(
        "--page",
        default=DEFAULT_PAGE,
        help=f"Page to open, relative to this directory. Default: {DEFAULT_PAGE}",
    )
    return parser.parse_args()


def validate_page(root: Path, page: str) -> str:
    candidate = (root / page).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise SystemExit("--page must remain inside the FluidBalls directory") from exc

    if not candidate.is_file():
        raise SystemExit(f"Page not found: {candidate}")

    return candidate.relative_to(root).as_posix()


def main() -> int:
    args = parse_args()
    root = Path(__file__).resolve().parent
    page = validate_page(root, args.page)

    handler = functools.partial(FluidBallsHandler, directory=str(root))

    try:
        server = ReusableThreadingHTTPServer((HOST, args.port), handler)
    except OSError as exc:
        print(f"Could not start local server: {exc}", file=sys.stderr)
        return 1

    port = server.server_address[1]
    url = f"http://{HOST}:{port}/{page}"

    print("FluidBalls WebGL")
    print(f"Serving: {root}")
    print(f"Open:    {url}")
    print("Press Ctrl+C to stop.")

    if not args.no_browser:
        timer = threading.Timer(0.25, webbrowser.open, args=(url,))
        timer.daemon = True
        timer.start()

    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        print("\nStopping FluidBalls server.")
    finally:
        server.server_close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
