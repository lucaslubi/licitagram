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
import urllib.request
import urllib.error
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
CAPSOLVER_API_KEY = os.environ.get('CAPSOLVER_API_KEY', '')
CAPSOLVER_TIMEOUT = 120  # max seconds to wait for solution

PORTAL_URLS = {
    'comprasnet': 'https://www.gov.br/compras/pt-br',
    'pncp': 'https://www.gov.br/compras/pt-br',
    'comprasgov': 'https://www.gov.br/compras/pt-br',
    'bec': 'https://www.bec.sp.gov.br/',
    'licitacoes_e': 'https://www.licitacoes-e.com.br/',
}

CERTIDAO_URLS = {
    'receita': 'https://solucoes.receita.fazenda.gov.br/Servicos/CertidaoInternet/PJ/Emitir',
    'fgts': 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',
}

logger = LicitagramBotLogger(log_to_file=True, log_dir='/var/log/licitagram')

# ── CapSolver helpers ────────────────────────────────────────────────────────

def _capsolver_request(endpoint: str, payload: dict) -> dict:
    """Send a JSON request to the CapSolver API and return the parsed response."""
    url = f'https://api.capsolver.com/{endpoint}'
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode('utf-8'))


def capsolver_solve_recaptcha_v2(site_url: str, site_key: str) -> str:
    """
    Solve a ReCaptcha v2 via CapSolver (proxyless).
    Returns the g-recaptcha-response token string.
    Raises RuntimeError on failure or timeout.
    """
    if not CAPSOLVER_API_KEY:
        raise RuntimeError('CAPSOLVER_API_KEY not configured')

    # 1. Create task
    create_resp = _capsolver_request('createTask', {
        'clientKey': CAPSOLVER_API_KEY,
        'task': {
            'type': 'ReCaptchaV2TaskProxyLess',
            'websiteURL': site_url,
            'websiteKey': site_key,
        },
    })

    if create_resp.get('errorId', 0) != 0:
        raise RuntimeError(f"CapSolver createTask error: {create_resp.get('errorDescription', create_resp)}")

    task_id = create_resp.get('taskId')
    if not task_id:
        raise RuntimeError(f"CapSolver returned no taskId: {create_resp}")

    # 2. Poll for result
    deadline = time.time() + CAPSOLVER_TIMEOUT
    while time.time() < deadline:
        time.sleep(3)
        result_resp = _capsolver_request('getTaskResult', {
            'clientKey': CAPSOLVER_API_KEY,
            'taskId': task_id,
        })

        status = result_resp.get('status', '')
        if status == 'ready':
            solution = result_resp.get('solution', {})
            token = solution.get('gRecaptchaResponse', '')
            if not token:
                raise RuntimeError(f"CapSolver solution missing token: {result_resp}")
            return token
        elif status == 'failed':
            raise RuntimeError(f"CapSolver task failed: {result_resp.get('errorDescription', result_resp)}")
        # status == 'processing' → keep polling

    raise RuntimeError(f"CapSolver timeout after {CAPSOLVER_TIMEOUT}s for task {task_id}")


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

    def _detect_recaptcha_sitekey(self, page) -> str | None:
        """Detect a ReCaptcha v2 on the page and return the siteKey, or None."""
        # Method 1: look for data-sitekey attribute
        sitekey = page.evaluate('''() => {
            const el = document.querySelector('[data-sitekey]');
            if (el) return el.getAttribute('data-sitekey');
            return null;
        }''')
        if sitekey:
            return sitekey

        # Method 2: look inside reCAPTCHA iframe src for k= parameter
        sitekey = page.evaluate('''() => {
            const frames = document.querySelectorAll('iframe[src*="recaptcha"]');
            for (const f of frames) {
                const m = f.src.match(/[?&]k=([A-Za-z0-9_-]+)/);
                if (m) return m[1];
            }
            return null;
        }''')
        return sitekey

    def _inject_recaptcha_token(self, page, token: str):
        """Inject a solved reCAPTCHA token into the page and trigger the callback."""
        page.evaluate('''(token) => {
            // Set the response textarea (may be hidden)
            const textarea = document.getElementById('g-recaptcha-response');
            if (textarea) {
                textarea.value = token;
                textarea.style.display = 'block';
            }
            // Also set any other response textareas (multiple reCAPTCHA widgets)
            document.querySelectorAll('[name="g-recaptcha-response"]').forEach(el => {
                el.value = token;
            });
            // Trigger the callback
            try {
                // Standard callback path
                if (typeof ___grecaptcha_cfg !== 'undefined' && ___grecaptcha_cfg.clients) {
                    for (const clientKey of Object.keys(___grecaptcha_cfg.clients)) {
                        const client = ___grecaptcha_cfg.clients[clientKey];
                        // Walk the client object to find the callback
                        const findCallback = (obj, depth) => {
                            if (depth > 5 || !obj) return;
                            for (const key of Object.keys(obj)) {
                                if (typeof obj[key] === 'function') {
                                    // Likely the callback
                                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                                    const inner = obj[key];
                                    if (typeof inner.callback === 'function') {
                                        inner.callback(token);
                                        return;
                                    }
                                    findCallback(inner, depth + 1);
                                }
                            }
                        };
                        findCallback(client, 0);
                    }
                }
            } catch (e) {
                console.warn('reCAPTCHA callback trigger error:', e);
            }
        }''', token)

    def solve_captcha(self, session_id: str) -> dict:
        """Detect and solve a reCAPTCHA v2 on the current page."""
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return {'error': 'Session not found', 'status': 'error'}
            session['last_activity'] = time.time()

        page = session['page']

        try:
            # Detect reCAPTCHA
            sitekey = self._detect_recaptcha_sitekey(page)
            if not sitekey:
                screenshot = self._take_screenshot(page)
                return {
                    'status': 'no_captcha',
                    'message': 'No reCAPTCHA detected on the page',
                    'screenshot': screenshot,
                    'url': page.url,
                }

            current_url = page.url
            logger.info(f"Session {session_id} — reCAPTCHA detected, siteKey={sitekey[:16]}... Solving via CapSolver")

            # Solve via CapSolver (this blocks for up to CAPSOLVER_TIMEOUT seconds)
            token = capsolver_solve_recaptcha_v2(current_url, sitekey)

            logger.info(f"Session {session_id} — reCAPTCHA solved, injecting token")

            # Inject the token
            self._inject_recaptcha_token(page, token)

            # Small delay to let any JS callbacks fire
            time.sleep(1)

            screenshot = self._take_screenshot(page)
            return {
                'status': 'captcha_solved',
                'message': 'reCAPTCHA solved and token injected',
                'screenshot': screenshot,
                'url': page.url,
            }

        except Exception as e:
            logger.log_exception(e, f"solve_captcha({session_id})")
            try:
                screenshot = self._take_screenshot(page)
            except Exception:
                screenshot = ''
            return {
                'error': str(e),
                'status': 'captcha_error',
                'screenshot': screenshot,
                'url': page.url,
            }

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

            with self._lock:
                self._sessions[session_id] = {
                    'context': context,
                    'page': page,
                    'portal': portal,
                    'last_activity': time.time(),
                }

            logger.info(f"Session {session_id} started — portal={portal} url={page.url}")

            # Auto-solve captcha for gov.br portals
            captcha_result = None
            if portal in ('comprasnet', 'pncp', 'comprasgov') and CAPSOLVER_API_KEY:
                sitekey = self._detect_recaptcha_sitekey(page)
                if sitekey:
                    logger.info(f"Session {session_id} — auto-solving reCAPTCHA on login page")
                    captcha_result = self.solve_captcha(session_id)

            screenshot = self._take_screenshot(page)

            result = {
                'screenshot': screenshot,
                'status': 'login_page',
                'url': page.url,
            }
            if captcha_result:
                result['captcha'] = captcha_result.get('status', 'unknown')

            return result
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
            elif action == 'click_coordinates' and value:
                # value is "x,y" coordinates
                coords = value.split(',')
                x, y = int(coords[0]), int(coords[1])
                page.mouse.click(x, y)
                try:
                    page.wait_for_load_state('networkidle', timeout=8000)
                except Exception:
                    pass
            elif action == 'screenshot':
                pass  # Just take a screenshot below
            elif action == 'solve_captcha':
                return self.solve_captcha(session_id)
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

    def start_certidao(self, portal: str, cnpj: str, session_id: str) -> dict:
        """Open a new browser session for certidão emission and auto-fill CNPJ."""
        with self._lock:
            if len(self._sessions) >= MAX_SESSIONS:
                return {'error': 'Too many concurrent sessions', 'status': 'error'}
            if session_id in self._sessions:
                return {'error': 'Session already exists', 'status': 'error'}

        url = CERTIDAO_URLS.get(portal)
        if not url:
            return {'error': f'Unknown certidao portal: {portal}', 'status': 'error'}

        # Format CNPJ as XX.XXX.XXX/XXXX-XX
        c = cnpj.replace('.', '').replace('/', '').replace('-', '').strip()
        if len(c) == 14:
            formatted_cnpj = f'{c[:2]}.{c[2:5]}.{c[5:8]}/{c[8:12]}-{c[12:]}'
        else:
            formatted_cnpj = cnpj

        try:
            context = self._browser.new_context(
                viewport={'width': 1280, 'height': 800},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            )
            page = context.new_page()
            page.goto(url, wait_until='networkidle', timeout=30000)

            with self._lock:
                self._sessions[session_id] = {
                    'context': context,
                    'page': page,
                    'portal': portal,
                    'certidao': True,
                    'last_activity': time.time(),
                }

            logger.info(f"Certidao session {session_id} started — portal={portal} url={page.url}")

            # Auto-fill CNPJ based on portal
            try:
                if portal == 'receita':
                    page.wait_for_selector('input#NI', timeout=10000)
                    page.fill('input#NI', formatted_cnpj)
                elif portal == 'fgts':
                    page.wait_for_selector('input[id*="inscricao"]', timeout=10000)
                    page.fill('input[id*="inscricao"]', c)  # FGTS uses raw digits
            except Exception as fill_err:
                logger.warning(f"Certidao {session_id} — CNPJ fill failed: {fill_err}")

            time.sleep(1)
            screenshot = self._take_screenshot(page)

            return {
                'screenshot': screenshot,
                'status': 'captcha_page',
                'url': page.url,
            }
        except Exception as e:
            logger.log_exception(e, f"start_certidao({portal})")
            return {'error': str(e), 'status': 'error'}

    def check_certidao_result(self, session_id: str) -> dict:
        """Check if a certidão was emitted by inspecting the current page text."""
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return {'error': 'Session not found', 'status': 'error'}
            session['last_activity'] = time.time()

        page = session['page']

        try:
            page_text = page.evaluate('() => document.body.innerText || ""')
            page_text_lower = page_text.lower()
            screenshot = self._take_screenshot(page)

            # Detect certidão results
            result_status = 'pending'
            detalhes = ''

            if 'certidão negativa' in page_text_lower or 'certidao negativa' in page_text_lower:
                result_status = 'negativa'
                detalhes = 'Certidão Negativa emitida com sucesso'
            elif 'certidão positiva com efeitos de negativa' in page_text_lower:
                result_status = 'positiva_negativa'
                detalhes = 'Certidão Positiva com Efeitos de Negativa'
            elif 'certidão positiva' in page_text_lower or 'certidao positiva' in page_text_lower:
                result_status = 'positiva'
                detalhes = 'Certidão Positiva'
            elif 'regularidade fiscal' in page_text_lower and ('regular' in page_text_lower):
                result_status = 'negativa'
                detalhes = 'Situação Regular'
            elif 'crf emitido' in page_text_lower or 'certificado de regularidade' in page_text_lower:
                result_status = 'negativa'
                detalhes = 'CRF FGTS emitido'
            elif 'situação irregular' in page_text_lower or 'situacao irregular' in page_text_lower:
                result_status = 'positiva'
                detalhes = 'Situação Irregular'
            elif 'erro' in page_text_lower and ('cnpj' in page_text_lower or 'consulta' in page_text_lower):
                result_status = 'error'
                detalhes = 'Erro na consulta'

            return {
                'result_status': result_status,
                'detalhes': detalhes,
                'screenshot': screenshot,
                'url': page.url,
                'status': 'ok',
            }
        except Exception as e:
            logger.log_exception(e, f"check_certidao_result({session_id})")
            try:
                screenshot = self._take_screenshot(page)
            except Exception:
                screenshot = ''
            return {
                'error': str(e),
                'status': 'error',
                'screenshot': screenshot,
            }

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

        elif path == '/start_certidao':
            portal = body.get('portal', '')
            cnpj = body.get('cnpj', '')
            session_id = body.get('session_id', str(uuid.uuid4()))
            if not portal or not cnpj:
                self._send_json({'error': 'portal and cnpj required'}, 400)
                return
            result = sessions.start_certidao(portal, cnpj, session_id)
            status = 200 if 'error' not in result else 400
            self._send_json(result, status)

        elif path == '/check_result':
            session_id = body.get('session_id', '')
            if not session_id:
                self._send_json({'error': 'session_id required'}, 400)
                return
            result = sessions.check_certidao_result(session_id)
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
