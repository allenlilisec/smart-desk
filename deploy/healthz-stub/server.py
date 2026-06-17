"""Minimal healthz/readyz/metrics stub for canary compose skeleton."""

import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    version = os.environ.get("VERSION", "stable")
    service = os.environ.get("SERVICE", "stub")

    def log_message(self, format, *args):
        return

    def _send(self, code: int, body: str, content_type: str = "text/plain"):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.end_headers()
        self.wfile.write(body.encode())

    def do_GET(self):
        if self.path in ("/healthz", "/readyz"):
            self._send(200, "ok")
        elif self.path == "/metrics":
            metrics = (
                f'# HELP http_requests_total Total HTTP requests\n'
                f'# TYPE http_requests_total counter\n'
                f'http_requests_total{{service="{self.service}",version="{self.version}"}} 1\n'
            )
            self._send(200, metrics, "text/plain; version=0.0.4")
        else:
            payload = json.dumps(
                {"service": self.service, "version": self.version, "status": "ok"}
            )
            self._send(200, payload, "application/json")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    HTTPServer(("0.0.0.0", port), Handler).serve_forever()
