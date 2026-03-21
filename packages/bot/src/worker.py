"""
LICITAGRAM BOT — Worker
Polls bot_sessions table for active sessions and executes automated bidding.
Runs as a PM2 process on the VPS.
"""
import os
import sys
import time
import json
import traceback
from datetime import datetime
from dotenv import load_dotenv

# Load .env FIRST (before any other imports that need env vars)
# Try multiple locations for .env
for _env_candidate in [
    os.path.join(os.getcwd(), '.env'),
    '/opt/licitagram/.env',
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '.env'),
]:
    if os.path.exists(_env_candidate):
        load_dotenv(_env_candidate)
        break

# Add parent to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from supabase import create_client, Client
from src.logger import LicitagramBotLogger
from src.manager import LicitagramBotManager, MinimalDecreaseStrategy, TimedStrategy

# Config
SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
POLL_INTERVAL = 10  # seconds
BID_ROUND_DELAY = 3  # seconds between bid rounds
PRICE_RETRY_DELAY = 5  # seconds to wait when price fetch fails
MAX_CONSECUTIVE_ERRORS = 5  # stop session after this many consecutive errors

logger = LicitagramBotLogger(log_to_file=True, log_dir='/var/log/licitagram')
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def log_action(session_id: str, action_type: str, details: dict):
    """Log a bot action to bot_actions table"""
    try:
        supabase.table('bot_actions').insert({
            'session_id': session_id,
            'action_type': action_type,
            'details': json.loads(json.dumps(details, default=str)),
        }).execute()
    except Exception as e:
        logger.error(f"Failed to log action for session {session_id}: {e}")


def update_session_status(session_id: str, status: str, extra: dict = None):
    """Update a session's status with optional extra fields."""
    payload = {'status': status}
    if extra:
        payload.update(extra)
    try:
        supabase.table('bot_sessions').update(payload).eq('id', session_id).execute()
    except Exception as e:
        logger.error(f"Failed to update session {session_id} status to {status}: {e}")


def get_portal(portal_name: str, headless: bool = True):
    """Factory to get portal instance"""
    if portal_name == 'comprasnet':
        from src.portals.comprasnet import ComprasNetPortal
        return ComprasNetPortal(headless=headless, logger=logger)
    if portal_name == 'bll':
        from src.portals.bll import BLLPortal
        return BLLPortal(headless=headless, logger=logger)
    if portal_name == 'portal_compras':
        from src.portals.portal_compras import PortalComprasPortal
        return PortalComprasPortal(headless=headless, logger=logger)
    if portal_name == 'licitacoes_e':
        from src.portals.licitacoes_e import LicitacoesEPortal
        return LicitacoesEPortal(headless=headless, logger=logger)
    raise ValueError(f"Portal '{portal_name}' not supported")


def check_session_still_active(session_id: str) -> bool:
    """Check if the session is still active (not paused/cancelled/failed)."""
    try:
        current = supabase.table('bot_sessions').select('status').eq('id', session_id).single().execute()
        if current.data and current.data['status'] in ('paused', 'completed', 'failed'):
            return False
        return True
    except Exception:
        return False


def process_session(session: dict):
    """Process a single bot session"""
    session_id = session['id']
    company_id = session['company_id']
    portal_name = session.get('portal', 'comprasnet')
    pregao_id = session['pregao_id']
    portal = None

    logger.info(f"Processing session {session_id} for pregao {pregao_id} on {portal_name}")

    # Validate config_id exists
    config_id = session.get('config_id')
    if not config_id:
        error_msg = "Sessao sem config_id — nenhuma credencial vinculada"
        logger.error(f"Session {session_id}: {error_msg}")
        update_session_status(session_id, 'failed', {
            'result': {'error': error_msg},
            'completed_at': datetime.utcnow().isoformat(),
        })
        log_action(session_id, 'error', {'error': error_msg})
        return

    # Update status to active
    update_session_status(session_id, 'active', {
        'started_at': datetime.utcnow().isoformat(),
    })
    log_action(session_id, 'session_start', {'portal': portal_name, 'pregao_id': pregao_id})

    try:
        # Get portal credentials
        config = supabase.table('bot_configs').select('*').eq('id', config_id).single().execute()
        if not config.data:
            raise ValueError("Bot config not found for config_id=" + config_id)

        # Initialize portal
        portal = get_portal(portal_name, headless=True)

        # Login
        username = config.data.get('username', '')
        password = config.data.get('password_hash', '')  # Should be decrypted in production

        if not username or not password:
            raise ValueError("Credenciais vazias na configuracao do bot")

        log_action(session_id, 'login_attempt', {'portal': portal_name, 'username': username[:4] + '***'})

        if not portal.login(username, password):
            raise ValueError("Login falhou no portal " + portal_name)

        log_action(session_id, 'login_success', {'portal': portal_name})
        logger.info(f"Session {session_id}: login successful on {portal_name}")

        # Setup bidding strategy
        strategy_config = session.get('strategy_config') or {}
        if isinstance(strategy_config, str):
            try:
                strategy_config = json.loads(strategy_config)
            except (json.JSONDecodeError, TypeError):
                strategy_config = {}

        strategy_type = strategy_config.get('type', 'minimal_decrease')

        if strategy_type == 'timed':
            strategy = TimedStrategy(
                bid_times=strategy_config.get('bid_times', [60, 30, 10, 3]),
                random_delay=strategy_config.get('random_delay', True),
                logger=logger,
            )
        else:
            strategy = MinimalDecreaseStrategy(
                min_decrease_value=strategy_config.get('min_decrease_value', 0.01),
                min_decrease_percent=strategy_config.get('min_decrease_percent', 0.1),
                logger=logger,
            )

        # Setup manager
        manager = LicitagramBotManager(logger=logger)
        max_bids = session.get('max_bids') or 10
        min_price = session.get('min_price')

        manager.register_auction(
            auction_id=pregao_id,
            strategy=strategy,
            min_price=min_price,
            max_bids=max_bids,
        )

        log_action(session_id, 'strategy_configured', {
            'type': strategy_type,
            'max_bids': max_bids,
            'min_price': min_price,
            'config': strategy_config,
        })

        # Bidding loop
        consecutive_errors = 0

        for round_num in range(max_bids):
            # Check if session was paused/cancelled externally
            if not check_session_still_active(session_id):
                logger.info(f"Session {session_id} was stopped externally, exiting loop")
                log_action(session_id, 'session_stopped', {'reason': 'external', 'round': round_num + 1})
                return  # Don't mark completed — status was set externally

            # Get current price from portal
            try:
                current_price = portal.get_current_price(pregao_id, item_id='1')
                if current_price is None:
                    consecutive_errors += 1
                    logger.warning(f"Session {session_id}: could not get current price (attempt {consecutive_errors})")
                    log_action(session_id, 'price_fetch_failed', {
                        'round': round_num + 1,
                        'consecutive_errors': consecutive_errors,
                    })
                    if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                        raise ValueError(f"Falha ao obter preco {MAX_CONSECUTIVE_ERRORS} vezes consecutivas")
                    time.sleep(PRICE_RETRY_DELAY)
                    continue

                # Reset error counter on success
                consecutive_errors = 0

            except ValueError:
                raise  # Re-raise the max errors exceeded
            except Exception as e:
                consecutive_errors += 1
                logger.error(f"Session {session_id}: error getting price: {e}")
                log_action(session_id, 'price_error', {
                    'round': round_num + 1,
                    'error': str(e),
                    'consecutive_errors': consecutive_errors,
                })
                if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                    raise ValueError(f"Muitos erros consecutivos ao obter preco: {e}")
                time.sleep(PRICE_RETRY_DELAY)
                continue

            # Process bid via strategy/manager
            try:
                bid_value = manager.process_bid(
                    auction_id=pregao_id,
                    current_price=current_price,
                )
            except Exception as e:
                logger.error(f"Session {session_id}: error computing bid: {e}")
                log_action(session_id, 'bid_calc_error', {
                    'round': round_num + 1,
                    'current_price': current_price,
                    'error': str(e),
                })
                time.sleep(BID_ROUND_DELAY)
                continue

            if bid_value is not None:
                # Check min_price guard
                if min_price is not None and bid_value < min_price:
                    logger.info(f"Session {session_id}: bid {bid_value} below min_price {min_price}, skipping")
                    log_action(session_id, 'bid_below_min', {
                        'round': round_num + 1,
                        'bid_value': bid_value,
                        'min_price': min_price,
                    })
                    time.sleep(BID_ROUND_DELAY)
                    continue

                # Submit bid to portal
                try:
                    success = portal.submit_bid(pregao_id, item_id='1', bid_value=bid_value)
                except Exception as e:
                    success = False
                    logger.error(f"Session {session_id}: submit_bid error: {e}")

                log_action(session_id, 'bid', {
                    'round': round_num + 1,
                    'current_price': current_price,
                    'bid_value': bid_value,
                    'success': success,
                })

                if not success:
                    consecutive_errors += 1
                    if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                        raise ValueError(f"Muitos erros consecutivos ao submeter lance")
                else:
                    consecutive_errors = 0

                # Update progress in session
                status = manager.get_auction_status(pregao_id)
                update_session_status(session_id, 'active', {
                    'progress': {
                        'bids_placed': status.get('bids_count', 0),
                        'current_price': current_price,
                        'last_bid': bid_value,
                        'round': round_num + 1,
                    },
                })
            else:
                # Strategy decided not to bid this round
                log_action(session_id, 'skip_round', {
                    'round': round_num + 1,
                    'current_price': current_price,
                    'reason': 'strategy_declined',
                })

            time.sleep(BID_ROUND_DELAY)

        # Session completed normally (exhausted all rounds)
        final_status = manager.get_auction_status(pregao_id)
        bid_history = final_status.get('bid_history', [])
        # Serialize datetimes in bid_history
        serializable_history = []
        for entry in bid_history:
            serializable_history.append({
                'value': entry.get('value'),
                'current_price': entry.get('current_price'),
                'timestamp': entry.get('timestamp', '').isoformat() if hasattr(entry.get('timestamp', ''), 'isoformat') else str(entry.get('timestamp', '')),
            })

        update_session_status(session_id, 'completed', {
            'result': {
                'bids_placed': final_status.get('bids_count', 0),
                'last_bid': final_status.get('last_bid'),
                'bid_history': serializable_history,
            },
            'completed_at': datetime.utcnow().isoformat(),
        })

        log_action(session_id, 'session_completed', {
            'bids_placed': final_status.get('bids_count', 0),
            'last_bid': final_status.get('last_bid'),
        })
        logger.info(f"Session {session_id} completed: {final_status.get('bids_count', 0)} bids placed")

    except Exception as e:
        logger.error(f"Session {session_id} failed: {e}")
        logger.error(traceback.format_exc())

        update_session_status(session_id, 'failed', {
            'result': {'error': str(e)},
            'completed_at': datetime.utcnow().isoformat(),
        })
        log_action(session_id, 'session_failed', {'error': str(e)})

    finally:
        if portal is not None:
            try:
                portal._close_browser()
            except Exception:
                pass


def main():
    """Main poll loop"""
    logger.info("=" * 60)
    logger.info("LICITAGRAM BOT — Worker Started")
    logger.info(f"Polling interval: {POLL_INTERVAL}s")
    logger.info(f"Supabase URL: {SUPABASE_URL[:30]}..." if SUPABASE_URL else "WARNING: SUPABASE_URL not set")
    logger.info("=" * 60)

    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. Exiting.")
        sys.exit(1)

    while True:
        try:
            # Poll for pending sessions
            result = supabase.table('bot_sessions') \
                .select('*') \
                .eq('status', 'pending') \
                .order('created_at') \
                .limit(1) \
                .execute()

            if result.data and len(result.data) > 0:
                process_session(result.data[0])

        except KeyboardInterrupt:
            logger.info("LICITAGRAM BOT — Worker shutting down")
            break
        except Exception as e:
            logger.error(f"Poll error: {e}")
            logger.error(traceback.format_exc())

        time.sleep(POLL_INTERVAL)


if __name__ == '__main__':
    main()
