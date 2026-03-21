"""
LICITAGRAM BOT — Guided Login Server
HTTP server that manages Playwright browser sessions for guided portal login.
Runs on port 3999 on the VPS (internal, not exposed to internet).
"""
import os
import sys
import json
import time
import base64
import uuid
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime

# Load .env
for _env_candidate in [
    os.path.join(os.getcwd(), '.env'),
    '/opt/licitagram/.env',
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '.env'),
]:
    if os.path.exists(_env_candidate):
        from dotenv import load_dotenv
        load_dotenv(_env_candidate)
        break

# Add parent to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.logger import LicitagramBotLogger

# ── Config ───────────────────────────────────────────────────────────────────

PORT = int(os.environ.get('LOGIN_SERVER_PORT', 3999))
MAX_SESSIONS = 3
SESSION_TIMEOUT = 300  # 5 minutes

PORTAL_URLS = {
    'comprasnet': 'https://www.gov.br/compras/pt-br',
    'pncp': 'https://www.gov.br/compras/pt-br',
    'comprasgov': 'https://www.gov.br/compras/pt-br',
    'bec': 'https://www.bec.sp.gov.br/',
    'licitacoes_e': 'https://www.licitacoes-e.com.br/',
}

logger = LicitagramBotLogger(log_to_file=True, log_dir='/var/log/licitagram')

# ── Session Manager ──────────────────────────────────────────────────────────

class SessionManager:
    """Manages Playwright browser sessions for guided login."""

    def __init__(self):
        self._sessions: dict = {}
        self._lock = threading.Lock()
        self._playwright = None
        self._browser = None
        self._cleanup_thread = None
        self._running = False

    def start(self):
        """Start the session manager and Playwright browser."""
        from playwright.sync_api import sync_playwright
        self._pw_context = sync_playwright().start()
        self._browser = self._pw_context.chromium.launch(
            headless=True,
            args=[
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
            ],
        )
        self._running = True
        self._cleanup_thread = threading.Thread(target=self._cleanup_loop, daemon=True)
        self._cleanup_thread.start()
        logger.info(f"SessionManager started — browser launched")

    def stop(self):
        """Stop all sessions and close the browser."""
        self._running = False
        with self._lock:
            for sid in list(self._sessions.keys()):
                self._close_session_unsafe(sid)
        if self._browser:
            self._browser.close()
        if self._pw_context:
            self._pw_context.stop()
        logger.info("SessionManager stopped")

    def _cleanup_loop(self):
        """Periodically close expired sessions."""
        while self._running:
            time.sleep(30)
            now = time.time()
            with self._lock:
                expired = [
                    sid for sid, s in self._sessions.items()
                    if now - s['last_activity'] > SESSION_TIMEOUT
                ]
                for sid in expired:
                    logger.info(f"Session {sid} expired — closing")
                    self._close_session_unsafe(sid)

    def _close_session_unsafe(self, session_id: str):
        """Close a session (must hold self._lock)."""
        session = self._sessions.pop(session_id, None)
        if session and session.get('context'):
            try:
                session['context'].close()
            except Exception as e:
                logger.error(f"Error closing context for {session_id}: {e}")

    def _take_screenshot(self, page) -> str:
        """Take a JPEG screenshot and return base64."""
        raw = page.screenshot(type='jpeg', quality=60)
        return base64.b64encode(raw).decode('ascii')

    def start_session(self, portal: str, session_id: str) -> dict:
        """Open a new browser session for the given portal."""
        with self._lock:
            if len(self._sessions) >= MAX_SESSIONS:
                return {'error': 'Too many concurrent sessions', 'status': 'error'}

            if session_id in self._sessions:
                return {'error': 'Session already exists', 'status': 'error'}

        url = PORTAL_URLS.get(portal)
        if not url:
            return {'error': f'Unknown portal: {portal}', 'status': 'error'}

        try:
            context = self._browser.new_context(
                viewport={'width': 1280, 'height': 800},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            )
            page = context.new_page()
            page.goto(url, wait_until='networkidle', timeout=30000)

            screenshot = self._take_screenshot(page)

            with self._lock:
                self._sessions[session_id] = {
                    'context': context,
                    'page': page,
                    'portal': portal,
                    'last_activity': time.time(),
                }

            logger.info(f"Session {session_id} started — portal={portal} url={page.url}")

            return {
                'screenshot': screenshot,
                'status': 'login_page',
                'url': page.url,
            }
        except Exception as e:
            logger.log_exception(e, f"start_session({portal})")
            return {'error': str(e), 'status': 'error'}

    def perform_action(self, session_id: str, action: str, selector: str | None = None, value: str | None = None) -> dict:
        """Perform an action on an existing session."""
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return {'error': 'Session not found', 'status': 'error'}
            session['last_activity'] = time.time()

        page = session['page']

        try:
            if action == 'type' and selector and value is not None:
                page.fill(selector, value, timeout=10000)
            elif action == 'click' and selector:
                page.click(selector, timeout=10000)
                # Wait for navigation or network after click
                try:
                    page.wait_for_load_state('networkidle', timeout=8000)
                except Exception:
                    pass
            elif action == 'screenshot':
                pass  # Just take a screenshot below
            else:
                return {'error': f'Invalid action: {action}', 'status': 'error'}

            screenshot = self._take_screenshot(page)
            return {
                'screenshot': screenshot,
                'status': 'ok',
                'url': page.url,
            }
        except Exception as e:
            logger.log_exception(e, f"perform_action({session_id}, {action})")
            # Still try to get a screenshot
            try:
                screenshot = self._take_screenshot(page)
            except Exception:
                screenshot = ''
            return {
                'error': str(e),
                'screenshot': screenshot,
                'status': 'action_error',
                'url': page.url,
            }

    def get_cookies(self, session_id: str) -> dict:
        """Get cookies from the browser session."""
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return {'error': 'Session not found', 'status': 'error'}
            session['last_activity'] = time.time()

        context = session['context']
        page = session['page']

        try:
            cookies = context.cookies()
            current_url = page.url

            # Check if logged in based on URL patterns
            logged_in = False
            if session['portal'] in ('comprasnet', 'pncp', 'comprasgov'):
                logged_in = 'acesso.gov.br' not in current_url and 'sso' not in current_url.lower()
            elif session['portal'] == 'bec':
                logged_in = 'login' not in current_url.lower()
            elif session['portal'] == 'licitacoes_e':
                logged_in = 'login' not in current_url.lower()

            return {
                'cookies': cookies,
                'logged_in': logged_in,
                'url': current_url,
            }
        except Exception as e:
            logger.log_exception(e, f"get_cookies({session_id})")
            return {'error': str(e), 'status': 'error'}

    def close_session(self, session_id: str) -> dict:
        """Close a browser session."""
        with self._lock:
            if session_id not in self._sessions:
                return {'status': 'not_found'}
            self._close_session_unsafe(session_id)

        logger.info(f"Session {session_id} closed by user")
        return {'status': 'closed'}


# ── HTTP Handler ─────────────────────────────────────────────────────────────

sessions = SessionManager()


class LoginHandler(BaseHTTPRequestHandler):
    """HTTP request handler for the guided login server."""

    def _send_json(self, data: dict, status: int = 200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def _read_body(self) -> dict:
        length = int(self.headers.get('Content-Length', 0))
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path == '/health':
            self._send_json({'status': 'ok', 'sessions': len(sessions._sessions)})
        else:
            self._send_json({'error': 'Not found'}, 404)

    def do_POST(self):
        try:
            body = self._read_body()
        except Exception as e:
            self._send_json({'error': f'Invalid JSON: {e}'}, 400)
            return

        path = self.path.rstrip('/')

        if path == '/start':
            portal = body.get('portal', '')
            session_id = body.get('session_id', str(uuid.uuid4()))
            result = sessions.start_session(portal, session_id)
            status = 200 if 'error' not in result else 400
            self._send_json(result, status)

        elif path == '/action':
            session_id = body.get('session_id', '')
            action = body.get('action', '')
            selector = body.get('selector')
            value = body.get('value')
            if not session_id or not action:
                self._send_json({'error': 'session_id and action required'}, 400)
                return
            result = sessions.perform_action(session_id, action, selector, value)
            self._send_json(result)

        elif path == '/cookies':
            session_id = body.get('session_id', '')
            if not session_id:
                self._send_json({'error': 'session_id required'}, 400)
                return
            result = sessions.get_cookies(session_id)
            self._send_json(result)

        elif path == '/close':
            session_id = body.get('session_id', '')
            if not session_id:
                self._send_json({'error': 'session_id required'}, 400)
                return
            result = sessions.close_session(session_id)
            self._send_json(result)

        else:
            self._send_json({'error': 'Unknown endpoint'}, 404)

    def log_message(self, format, *args):
        """Override to use our logger instead of stderr."""
        logger.debug(f"HTTP {args[0] if args else ''}")


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    logger.info(f"Starting LICITAGRAM Login Server on port {PORT}")

    sessions.start()

    server = HTTPServer(('0.0.0.0', PORT), LoginHandler)
    logger.info(f"Login server listening on http://0.0.0.0:{PORT}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down login server...")
    finally:
        server.server_close()
        sessions.stop()


if __name__ == '__main__':
    main()
