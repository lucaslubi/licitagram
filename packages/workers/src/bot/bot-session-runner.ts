import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { BasePortal } from './portals/base-portal'
import { ComprasGovPortal } from './portals/comprasgov'
import { MockPortal } from './portals/mock-portal'

export class BotSessionRunner {
  private portal: BasePortal | null = null
  private pollInterval: NodeJS.Timeout | null = null

  constructor(public sessionId: string) {}

  async start() {
    try {
      const { data: session } = await supabase
        .from('bot_sessions')
        .select('*, bot_configs(*)')
        .eq('id', this.sessionId)
        .single()

      if (!session) throw new Error('Session not found')
      
      const config = session.bot_configs || { username: 'sim', portal: 'simulator' }
      
      // Instantiate right portal
      if (session.portal === 'comprasgov' || session.portal === 'comprasnet') {
        this.portal = new ComprasGovPortal({ username: config.username, portal: session.portal })
      } else if (session.portal === 'simulator') {
        this.portal = new MockPortal({ username: 'sim', portal: 'simulator' })
      } else {
        throw new Error(`Portal ${session.portal} not yet supported natively`)
      }

      await supabase.from('bot_sessions').update({ status: 'active' }).eq('id', this.sessionId)

      const cookies = config.cookies ? JSON.parse(config.cookies) : []
      const loggedIn = await this.portal.login(cookies)
      if (!loggedIn) throw new Error('Failed to login')

      await this.portal.navigateToPregao(session.pregao_id)

      // Start the monitoring loop
      this.pollInterval = setInterval(async () => {
        try {
          await this.tick(session)
        } catch (err: any) {
          logger.error({ sessionId: this.sessionId, err: err.message }, 'Error in bot tick')
        }
      }, 3000)

    } catch (err: any) {
      logger.error({ sessionId: this.sessionId, err: err.message }, 'Failed to start bot runner')
      await supabase.from('bot_sessions').update({ status: 'failed', result: { error: err.message } }).eq('id', this.sessionId)
      await this.stop()
    }
  }

  private async tick(session: any) {
    if (!this.portal) return

    // Re-check status from DB (in case user paused/cancelled)
    const { data: freshSession } = await supabase
      .from('bot_sessions')
      .select('status')
      .eq('id', this.sessionId)
      .single()

    if (freshSession?.status === 'paused' || freshSession?.status === 'cancelled' || freshSession?.status === 'failed') {
      await this.stop()
      return
    }

    const state = await this.portal.getState()

    if (state.encerrado) {
      await supabase.from('bot_sessions').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', this.sessionId)
      await this.stop()
      return
    }

    if (state.ativo) {
      // Evaluate strategy
      const strategyStr = session.strategy_config?.type || 'minimal_decrease'
      const minPrice = session.min_price
      const maxBids = session.max_bids
      const bidsPlaced = session.bids_placed || 0

      if (maxBids && bidsPlaced >= maxBids) return // limits reached
      
      // Need placeholder to parse the actual DOM
      if (state.nossa_posicao !== 1 && state.melhor_lance !== null) {
        let proposedBid = state.melhor_lance - 0.01

        if (minPrice && proposedBid < minPrice) {
          proposedBid = minPrice
        }

        if (state.melhor_lance > minPrice) {
          const success = await this.portal.submitLance(proposedBid)
          if (success) {
            await supabase.from('bot_sessions').update({ bids_placed: bidsPlaced + 1, current_price: proposedBid }).eq('id', this.sessionId)
            await supabase.from('bot_actions').insert({ session_id: this.sessionId, action_type: 'bid', details: { valor: proposedBid, original_best: state.melhor_lance } })
          }
        }
      }
    }
  }

  async stop() {
    if (this.pollInterval) clearInterval(this.pollInterval)
    if (this.portal) {
      await this.portal.close()
    }
  }
}
