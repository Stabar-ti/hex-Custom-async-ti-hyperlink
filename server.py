#!/usr/bin/env python3
"""
Dev server for hex-Custom-async-ti-hyperlink.

Two things it does beyond `python -m http.server`:

  * Serves requests concurrently. The app is ~117 ES modules plus JSON, and
    public/data/tiles/ holds 106 MB of artwork with single files up to 8 MB. The
    original server used socketserver.TCPServer, which handles exactly ONE request
    at a time — so a tile image in flight blocked every module request behind it.
    Under load those requests did not merely queue, they failed, and a failed
    module request means the whole import graph never resolves: a blank page with
    no obvious error. ThreadingHTTPServer fixes that.

  * Adds Cache-Control: no-cache to every response, so a normal F5 always fetches
    fresh JS and CSS without needing Ctrl+Shift+R.

Usage:
    python server.py          # port 5173 (default)
    python server.py 8080     # custom port
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173


class DevHandler(SimpleHTTPRequestHandler):
    # Keep-alive. With HTTP/1.0 every one of those ~117 module requests paid for a
    # fresh TCP connection; SimpleHTTPRequestHandler sends Content-Length on every
    # response, which is what makes 1.1 safe here.
    protocol_version = 'HTTP/1.1'

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        # Suppress noisy per-request logs; only show errors.
        if args and str(args[1]) not in ('200', '206', '304'):
            super().log_message(fmt, *args)

    def handle_one_request(self):
        # A browser that abandons a request — navigating away, cancelling an image —
        # drops the connection mid-write. That is normal, and it should not print a
        # stack trace for every tile the user scrolled past.
        try:
            super().handle_one_request()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            self.close_connection = True


class DevServer(ThreadingHTTPServer):
    daemon_threads = True      # Ctrl+C should not wait on in-flight downloads
    allow_reuse_address = True


if __name__ == '__main__':
    with DevServer(('', PORT), DevHandler) as httpd:
        print(f'Serving at http://localhost:{PORT}  (threaded, no-cache headers)')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nServer stopped.')
