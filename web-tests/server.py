"""Local QA server: normal app plus isolated stale-HTTP-cache upgrade scenarios."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit
import json, re

versions = {}
class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        match = re.fullmatch(r'/__qa/upgrade/([a-zA-Z0-9-]+)', urlsplit(self.path).path)
        if not match:
            return self.send_error(404)
        versions[match[1]] = 'current'
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        match = re.fullmatch(r'/upgrade/([a-zA-Z0-9-]+)/(.*)', urlsplit(self.path).path)
        if not match:
            return super().do_GET()
        scenario, name = match.groups()
        name = name or 'index.html'
        if name not in {'index.html', 'app.js', 'cloud.js', 'cloud-posters.js', 'cloud-api.js', 'cloud-config.js', 'styles.css', 'appearance.js', 'zoom.js', 'fonts/Inter-400.woff', 'fonts/Inter-500.woff', 'fonts/Inter-600.woff', 'fonts/Inter-700.woff', 'sw.js', 'storage.js', 'app-storage.js', 'folder-storage.js', 'logic.js', 'package.js', 'backup-format.js', 'backup-ui.js', 'backup-workflow.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'}:
            return self.send_error(404)
        body = (Path('pwa') / name).read_bytes()
        legacy = versions.get(scenario) != 'current'
        if legacy and name == 'sw.js':
            body = body.replace(b'2026-10-22-own-download-v1', b'qa-legacy-shell').replace(b"assets.map(url => new Request(url, { cache: 'reload' }))", b'assets')
        if legacy and name == 'app.js':
            body = body.replace(b'2026-10-22-own-download-v1', b'qa-legacy-shell')
        if legacy and name == 'styles.css':
            body += b'\n/* QA_STALE_HTTP_CSS */\n#importFigure { pointer-events: none !important; }\n'
        self.send_response(200)
        self.send_header('Content-Type', self.guess_type(name))
        # Model GitHub Pages HTTP caching separately from the service-worker cache.
        self.send_header('Cache-Control', 'no-store' if name == 'sw.js' else 'public, max-age=3600')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

ThreadingHTTPServer(('127.0.0.1', 4173), Handler).serve_forever()
