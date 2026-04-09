import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { BasePortal, BotState } from './base-portal'
// @ts-ignore
puppeteer.use(StealthPlugin())

export class MockPortal extends BasePortal {
  async login(cookies: unknown[]): Promise<boolean> {
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    })
    
    if (!this.browser) return false
    
    this.page = await this.browser.newPage()
    await this.page.setViewport({ width: 1280, height: 800 })
    return true
  }

  async navigateToPregao(pregaoId: string): Promise<boolean> {
    if (!this.page) return false
    
    // Injeta o HTML interativo no browser logado para simular.
    const mockHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Sala de Disputa - Simulador</title>
        <style>
          body { font-family: sans-serif; padding: 20px; }
          .highlight { background: #fee; padding: 10px; border: 1px solid #c00; }
        </style>
      </head>
      <body>
        <h1>Pregão Eletrônico: ${pregaoId}</h1>
        <div id="status-pregao">Fase: Aberto</div>
        
        <h2>Painel de Lances (Item 1)</h2>
        <div>Melhor Lance Atual: R$ <span id="melhor-lance">150000.00</span></div>
        <div>Meu Lance: <span id="nosso-lance">-</span></div>
        <div>Nossa Posição: <span id="nossa-posicao">-</span></div>
        
        <div style="margin-top:20px; padding:20px; background:#eee;">
          <input type="text" id="valor-lance" placeholder="Digite valor...">
          <button id="btn-enviar">Enviar Lance</button>
        </div>
        
        <ul id="feed"></ul>

        <script>
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

          // Inimigo ataca a cada 10-15s se a fase for aberta
          setInterval(() => {
            if(!aberto) return;
            const drop = (Math.random() * 50) + 0.01;
            melhor = melhor - drop;
            if(melhor < 10) melhor = 10;
            $melhor.textContent = melhor.toFixed(2);
            $posicao.textContent = '2'; // perdeu posição
            logFeed('Concorrente deu lance: R$ ' + melhor.toFixed(2));
          }, 12000);

          // Fim do pregão aleatório após 3-5 minutos no mín ...
          setTimeout(() => {
            aberto = false;
            $status.textContent = 'Fase: Encerrado';
            logFeed('Fase encerrada pelo pregoeiro.');
          }, 180000);
          
          $btn.addEventListener('click', () => {
            if(!aberto) {
               alert('Fase Encerrada'); return;
            }
            const val = parseFloat($input.value.replace(',','.'));
            if(isNaN(val)) return;
            if(val >= melhor) {
               alert('Valor maior que o melhor lance'); return;
            }
            
            melhor = val;
            $melhor.textContent = melhor.toFixed(2);
            $nosso.textContent = melhor.toFixed(2);
            $posicao.textContent = '1';
            $input.value = '';
            logFeed('VOCÊ deu lance: R$ ' + melhor.toFixed(2));
          });
        </script>
      </body>
      </html>
    `
    await this.page.setContent(mockHtml)
    return true
  }

  async getState(): Promise<BotState> {
    if (!this.page) throw new Error('Not initialized')
    
    // Ler DOM dinâmico com context do browser simulando parser de portais complexos
    const data = await this.page.evaluate(() => {
      const faseTxt = document.getElementById('status-pregao')?.textContent || ''
      const encerrado = faseTxt.toLowerCase().includes('encerrado')
      
      const melhorSpan = document.getElementById('melhor-lance')?.textContent || '0'
      const melhor_lance = parseFloat(melhorSpan) || null
      
      const nossoSpan = document.getElementById('nosso-lance')?.textContent || '-'
      const nosso_lance = nossoSpan === '-' ? null : parseFloat(nossoSpan)
      
      const posSpan = document.getElementById('nossa-posicao')?.textContent || '-'
      const nossa_posicao = posSpan === '-' ? null : parseInt(posSpan, 10)
      
      return {
        fase: encerrado ? 'Encerrado' : 'Aberto',
        ativo: !encerrado,
        encerrado,
        melhor_lance,
        nosso_lance,
        nossa_posicao
      }
    })
    
    return data
  }

  async submitLance(valor: number): Promise<boolean> {
    if (!this.page) return false
    
    // Type in the bid amount input just like a real user
    await this.page.waitForSelector('#valor-lance')
    
    // Clear input
    await this.page.evaluate(() => {
      ;(document.getElementById('valor-lance') as HTMLInputElement).value = ''
    })
    
    await this.page.type('#valor-lance', valor.toFixed(2), { delay: 50 })
    await this.page.click('#btn-enviar')
    
    // Allow SPA to process
    await new Promise(r => setTimeout(r, 1000))
    
    return true
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
    }
  }
}
