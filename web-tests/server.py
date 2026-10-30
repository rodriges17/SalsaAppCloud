"""Local QA server: normal app plus isolated stale-HTTP-cache upgrade scenarios."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit
import json, re

versions = {}
class Handler(SimpleHTTPRequestHandler):
    def log_request(self, code='-', size='-'):
        # Keep failed requests visible without printing every app-shell asset.
        if str(code).isdigit() and int(code) >= 400:
            super().log_request(code, size)

    def do_POST(self):
        if urlsplit(self.path).path == '/functions/v1/cloud':
            payload = json.loads(self.rfile.read(int(self.headers.get('Content-Length', '0'))))
            if payload.get('action') != 'tags':
                return self.send_error(501, 'This Cloud action requires a test fixture')
            body = json.dumps({'tags': [], 'complete': True}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        match = re.fullmatch(r'/__qa/upgrade/([a-zA-Z0-9-]+)', urlsplit(self.path).path)
        if not match:
            return self.send_error(404)
        versions[match[1]] = 'current'
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        name = urlsplit(self.path).path
        # Service-worker tests must reach a same-origin API. WebKit cannot
        # reliably intercept cross-origin preflights behind a service worker.
        if name == '/pwa/cloud-config.js' or re.fullmatch(r'/upgrade/[a-zA-Z0-9-]+/cloud-config.js', name):
            body = b"export const CLOUD_URL='http://127.0.0.1:4173';export const CLOUD_KEY='test-publishable';export const CLOUD_FILE_LIMIT=50000000;"
            self.send_response(200)
            self.send_header('Content-Type', 'text/javascript')
            self.send_header('Cache-Control', 'public, max-age=3600')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        match = re.fullmatch(r'/upgrade/([a-zA-Z0-9-]+)/(.*)', urlsplit(self.path).path)
        if not match:
            return super().do_GET()
        scenario, name = match.groups()
        name = name or 'index.html'
        if name not in {'index.html', 'app.js', 'figure-edit-session.js', 'tag-picker.js', 'tag-catalog.js', 'tag-suggestions.js', 'file-delivery.js', 'figure-zip.js', 'cloud.js', 'figure-card.js', 'cloud-card-view.js', 'cloud-navigation.js', 'cloud-upload.js', 'cloud-dedup.js', 'cloud-people.js', 'cloud-people-grant.js', 'cloud-members.js', 'cloud-local.js', 'cloud-provenance.js', 'cloud-local-content.js', 'cloud-library-download.js', 'cloud-library-order.js', 'cloud-library-draft.js', 'cloud-read-state.js', 'cloud-cache.js', 'cloud-posters.js', 'cloud-api.js', 'cloud-config.js', 'styles.css', 'appearance.js', 'zoom.js', 'fonts/Inter-400.woff', 'fonts/Inter-500.woff', 'fonts/Inter-600.woff', 'fonts/Inter-700.woff', 'sw.js', 'storage.js', 'app-storage.js', 'folder-storage.js', 'logic.js', 'package.js', 'backup-format.js', 'backup-ui.js', 'backup-workflow.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'}:
            return self.send_error(404)
        body = (Path('pwa') / name).read_bytes()
        legacy = versions.get(scenario) != 'current'
        if legacy and name == 'sw.js':
            body = re.sub(rb"const VERSION = '[^']+';", b"const VERSION = 'qa-legacy-shell';", body, count=1).replace(b"assets.map(url => new Request(url, { cache: 'reload' }))", b'assets')
        if legacy and name == 'app.js':
            body = re.sub(rb"const APP_VERSION = '[^']+';", b"const APP_VERSION = 'qa-legacy-shell';", body, count=1)
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
