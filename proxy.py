import http.server
import socketserver
import urllib.request
import urllib.parse
import sys
from urllib.error import HTTPError, URLError

PORT = 8003
TARGET_BASE = 'http://localhost/bossAPI_AL/hs/app'

class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith('/api'):
            target_path = parsed.path[len('/api'):]
            target_url = TARGET_BASE + target_path
            if parsed.query:
                target_url += '?' + parsed.query
            self._proxy_request(target_url)
            return
        self.send_response(404)
        self.end_headers()
        self.wfile.write(b'Not found')

    def _proxy_request(self, target_url):
        req = urllib.request.Request(target_url, headers={
            'Authorization': 'Basic U2VydmVyOjIzNDA=',
            'User-Agent': 'Mozilla/5.0'
        })
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                body = resp.read()
                self.send_response(resp.status)
                self.send_header('Content-Type', resp.headers.get_content_type())
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
                self.end_headers()
                self.wfile.write(body)
        except Exception as e:
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(str(e).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.end_headers()

    def log_message(self, format, *args):
        return

if __name__ == '__main__':
    with socketserver.TCPServer(('0.0.0.0', PORT), ProxyHandler) as httpd:
        print(f'Proxy listening on http://0.0.0.0:{PORT}')
        httpd.serve_forever()

