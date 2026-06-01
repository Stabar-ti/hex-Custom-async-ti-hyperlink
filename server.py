#!/usr/bin/env python3
"""
Dev server for hex-Custom-async-ti-hyperlink.
Adds Cache-Control: no-cache headers to every response so that a normal
browser refresh (F5) always fetches fresh JS/CSS without needing Ctrl+Shift+R.

Usage:
    python server.py          # port 5173 (default)
    python server.py 8080     # custom port
"""
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        # Suppress noisy per-request logs; only show errors
        if args and str(args[1]) not in ('200', '304'):
            super().log_message(fmt, *args)


with socketserver.TCPServer(('', PORT), NoCacheHandler) as httpd:
    httpd.allow_reuse_address = True
    print(f'Serving at http://localhost:{PORT}  (no-cache headers enabled)')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nServer stopped.')
