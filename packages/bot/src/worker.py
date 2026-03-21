"""
LICITAGRAM BOT — Worker
Polls bot_sessions table for active sessions and executes automated bidding.
Runs as a PM2 process on the VPS.
"""
import os
import sys
import time
import json
from datetime import datetime
from dotenv import load_dotenv

# Load .env FIRST (before any other imports that need env vars)
_env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '.env')
load_dotenv(_env_path)

# Add parent to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from supabase import create_client, Client
from src.logger import LicitagramBotLogger
from src.manager import LicitagramBotManager, MinimalDecreaseStrategy, TimedStrategy

# Config
SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
POLL_INTERVAL = 10  # seconds

logger = LicitagramBotLogger(log_to_file=True, log_dir='/var/log/licitagram')
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def log_action(session_id: str, action_type: str, details: dict):
    """Log a bot action to bot_actions table"""
    supabase.table('bot_actions').insert({
        'session_id': session_id,
        'action_type': action_type,
        'details': details,
    }).execute()

def get_portal(portal_name: str, headless: bool = True):
    """Factory to get portal instance"""
    if portal_name == 'comprasnet':
        from src.portals.comprasnet import ComprasNetPortal
        return ComprasNetPortal(headless=headless, logger=logger)
    # Add other portals as they're implemented
    raise ValueError(f"Portal '{portal_name}' not supported")

def process_session(session: dict):
    """Process a single bot session"""
    session_id = session['id']
    company_id = session['company_id']
    portal_name = session['portal']
    pregao_id = session['pregao_id']

    logger.info(f"Processing session {session_id} for pregão {pregao_id} on {portal_name}")

    # Update status to active
    supabase.table('bot_sessions').update({
        'status': 'active',
        'started_at': datetime.utcnow().isoformat(),
    }).eq('id', session_id).execute()

    log_action(session_id, 'login', {'portal': portal_name, 'pregao_id': pregao_id})

    try:
        # Get portal credentials
        config_id = session.get('config_id')
        if not config_id:
            raise ValueError("No bot config (credentials) linked to session")

        config = supabase.table('bot_configs').select('*').eq('id', config_id).single().execute()
        if not config.data:
            raise ValueError("Bot config not found")

        # Initialize portal
        portal = get_portal(portal_name, headless=True)

        # Login
        username = config.data['username']
        password = config.data['password_hash']  # Should be decrypted

        if not portal.login(username, password):
            raise ValueError("Login failed")

        log_action(session_id, 'login', {'status': 'success', 'portal': portal_name})

        # Setup bidding strategy
        strategy_config = session.get('strategy_config', {})
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
        manager.register_auction(
            auction_id=pregao_id,
            strategy=strategy,
            min_price=session.get('min_price'),
            max_bids=session.get('max_bids', 10),
        )

        # Bidding loop
        max_rounds = session.get('max_bids', 10)
        for round_num in range(max_rounds):
            # Check if session was paused/cancelled
            current = supabase.table('bot_sessions').select('status').eq('id', session_id).single().execute()
            if current.data and current.data['status'] in ('paused', 'completed', 'failed'):
                logger.info(f"Session {session_id} was {current.data['status']}, stopping")
                break

            # Get current price from portal
            try:
                current_price = portal.get_current_price(pregao_id, item_id='1')
                if current_price is None:
                    logger.warning("Could not get current price, waiting...")
                    time.sleep(5)
                    continue
            except Exception as e:
                logger.error(f"Error getting price: {e}")
                time.sleep(5)
                continue

            # Process bid
            bid_value = manager.process_bid(
                auction_id=pregao_id,
                current_price=current_price,
            )

            if bid_value is not None:
                # Submit bid
                success = portal.submit_bid(pregao_id, item_id='1', price=bid_value)

                log_action(session_id, 'bid', {
                    'round': round_num + 1,
                    'current_price': current_price,
                    'bid_value': bid_value,
                    'success': success,
                })

                # Update progress
                status = manager.get_auction_status(pregao_id)
                supabase.table('bot_sessions').update({
                    'progress': {
                        'bids_placed': status.get('bids_count', 0),
                        'current_price': current_price,
                        'last_bid': bid_value,
                        'round': round_num + 1,
                    },
                }).eq('id', session_id).execute()

            time.sleep(3)  # Wait between rounds

        # Session completed
        final_status = manager.get_auction_status(pregao_id)
        supabase.table('bot_sessions').update({
            'status': 'completed',
            'result': {
                'bids_placed': final_status.get('bids_count', 0),
                'last_bid': final_status.get('last_bid'),
                'bid_history': final_status.get('bid_history', []),
            },
            'completed_at': datetime.utcnow().isoformat(),
        }).eq('id', session_id).execute()

        log_action(session_id, 'completed', final_status)
        logger.info(f"Session {session_id} completed: {final_status.get('bids_count', 0)} bids placed")

    except Exception as e:
        logger.error(f"Session {session_id} failed: {e}")
        logger.log_exception(e, f"Session {session_id}")

        supabase.table('bot_sessions').update({
            'status': 'failed',
            'result': {'error': str(e)},
            'completed_at': datetime.utcnow().isoformat(),
        }).eq('id', session_id).execute()

        log_action(session_id, 'error', {'error': str(e)})

    finally:
        try:
            portal._close_browser()
        except:
            pass

def main():
    """Main poll loop"""
    logger.info("=" * 60)
    logger.info("LICITAGRAM BOT — Worker Started")
    logger.info(f"Polling interval: {POLL_INTERVAL}s")
    logger.info("=" * 60)

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

        time.sleep(POLL_INTERVAL)

if __name__ == '__main__':
    # Load .env from project root
    from dotenv import load_dotenv
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '.env')
    load_dotenv(env_path)

    main()
