/**
 * MockPortal — Playwright-based simulator for end-to-end pipeline testing.
 *
 * Injects a self-contained HTML "dispute room" into the pooled BrowserContext
 * so the runner + strategy engine + queue + DB writes can all be exercised
 * without touching a real government portal.
 *
 * Useful for:
 *   - CI smoke tests on the BullMQ pipeline.
 *   - Demoing the UI with deterministic competitor behavior.
 *   - Regression testing after selector changes.
 *
 * Behavior:
 *   - Opens at R$150.000,00 best bid.
 *   - A simulated rival drops the best bid every 12 s.
 *   - Auto-closes after 180 s (3 min).
 *   - submitLance reads the #valor-lance input and respects the rival floor.
 */

import type { Page } from 'playwright'
import { BasePortal, type BotState, type FloorParameters, type PortalCredentials } from './base-portal'

const MOCK_HTML = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Sala de Disputa — Simulador Licitagram</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 20px; }
    .highlight { background: #fee; padding: 10px; border: 1px solid #c00; }
    .state { font-size: 1.2em; margin: 10px 0; }
  </style>
</head>
<body>
  <h1>Pregão Eletrônico: <span id="pregao-id"></span></h1>
  <div id="status-pregao" class="state">Fase: Aberta</div>
  <div class="state">Melhor Lance Atual: R$ <span id="melhor-lance">150000.00</span></div>
  <div class="state">Meu Lance: <span id="nosso-lance">-</span></div>
  <div class="state">Nossa Posição: <span id="nossa-posicao">-</span></div>

  <div style="margin-top:20px; padding:20px; background:#eee;">
    <input type="text" id="valor-lance" placeholder="Digite valor..." />
    <button id="btn-enviar">Enviar Lance</button>
  </div>

  <ul id="feed"></ul>

  <script>
    (function() {
      let melhor = 150000.00;
      let aberto = true;
      const $melhor = document.getElementById('melhor-lance');
      const $nosso = document.getElementById('nosso-lance');
      const $posicao = document.getElementById('nossa-posicao');
      const $status = document.getElementById('status-pregao');
      const $feed = document.getElementById('feed');
      const $btn = document.getElementById('btn-enviar');
      const $input = document.getElementById('valor-lance');

      function logFeed(msg) {
        const li = document.createElement('li');
        li.textContent = new Date().toLocaleTimeString() + ' - ' + msg;
        $feed.prepend(li);
      }

      setInterval(() => {
        if (!aberto) return;
        const drop = (Math.random() * 50) + 0.01;
        melhor = Math.max(10, melhor - drop);
        $melhor.textContent = melhor.toFixed(2);
        $posicao.textContent = '2';
        logFeed('Rival: R$ ' + melhor.toFixed(2));
      }, 12000);

      setTimeout(() => {
        aberto = false;
        $status.textContent = 'Fase: Encerrada';
        logFeed('Fase encerrada.');
      }, 180000);

      $btn.addEventListener('click', () => {
        if (!aberto) return;
        const val = parseFloat(String($input.value).replace(',', '.'));
        if (!isFinite(val) || val >= melhor) return;
        melhor = val;
        $melhor.textContent = melhor.toFixed(2);
        $nosso.textContent = melhor.toFixed(2);
        $posicao.textContent = '1';
        $input.value = '';
        logFeed('NÓS: R$ ' + melhor.toFixed(2));
      });
    })();
  </script>
</body>
</html>
`

export class MockPortal extends BasePortal {
  async isLoggedIn(): Promise<boolean> {
    return !!this.page
  }

  async login(_credentials: PortalCredentials): Promise<void> {
    // No real login — just prepare a page.
    if (!this.context) throw new Error('Adapter not attached to context')
    this.page = this.context.pages()[0] ?? (await this.context.newPage())
  }

  async openPregaoRoom(pregaoId: string, _portalPregaoUrl?: string): Promise<Page> {
    if (!this.context) throw new Error('Adapter not attached')
    const page = this.context.pages()[0] ?? (await this.context.newPage())
    this.page = page
    await page.setContent(MOCK_HTML)
    await page.evaluate((id) => {
      const el = document.getElementById('pregao-id')
      if (el) el.textContent = id
    }, pregaoId)
    return page
  }

  async getState(): Promise<BotState> {
    const page = this.requirePage()
    return page.evaluate(() => {
      const faseTxt = document.getElementById('status-pregao')?.textContent || ''
      const encerrado = faseTxt.toLowerCase().includes('encerrad')
      const melhorSpan = document.getElementById('melhor-lance')?.textContent || '0'
      const melhor_lance = parseFloat(melhorSpan) || null
      const nossoSpan = document.getElementById('nosso-lance')?.textContent || '-'
      const nosso_lance = nossoSpan === '-' ? null : parseFloat(nossoSpan)
      const posSpan = document.getElementById('nossa-posicao')?.textContent || '-'
      const nossa_posicao = posSpan === '-' ? null : parseInt(posSpan, 10)
      return {
        fase: encerrado ? 'Encerrada' : 'Aberta',
        ativo: !encerrado,
        encerrado,
        melhor_lance,
        nosso_lance,
        nossa_posicao,
      } as BotState
    })
  }

  async setFloor(_params: FloorParameters): Promise<void> {
    // MockPortal has no native auto-bidder; supervisor mode is a no-op here.
  }

  async submitLance(valor: number, _itemId?: string): Promise<boolean> {
    const page = this.requirePage()
    await page.fill('#valor-lance', valor.toFixed(2))
    await page.click('#btn-enviar')
    await page.waitForTimeout(300)
    // Confirm the DOM reflects our bid — real verification, not fake success.
    const ok = await page.evaluate((v) => {
      const nosso = document.getElementById('nosso-lance')?.textContent || ''
      return parseFloat(nosso) === v
    }, Math.round(valor * 100) / 100)
    return ok
  }
}
