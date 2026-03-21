import type { CertidaoResult } from './types'
import { getBrowser } from '../lib/browser'
import { logger } from '../lib/logger'
import { solveImageCaptcha } from '../lib/captcha-solver'

const log = logger.child({ module: 'certidao-tst' })

const TST_URL = 'https://cndt-certidao.tst.jus.br/inicio.faces'

function formatCnpj(cnpj: string): string {
  const digits = cnpj.replace(/\D/g, '')
  return digits.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    '$1.$2.$3/$4-$5',
  )
}

export async function scrapeTST(cnpj: string): Promise<CertidaoResult> {
  const browser = await getBrowser()
  const page = await browser.newPage()

  const manualFallback: CertidaoResult = {
    tipo: 'trabalhista',
    label: 'CNDT \u2014 Certid\u00e3o Trabalhista (TST)',
    situacao: 'manual',
    detalhes: 'N\u00e3o foi poss\u00edvel obter automaticamente. Consulte manualmente.',
    numero: null,
    emissao: null,
    validade: null,
    pdf_url: null,
    consulta_url: TST_URL,
  }

  try {
    page.setDefaultNavigationTimeout(60000)

    log.info({ cnpj }, 'Navigating to TST CNDT portal')
    await page.goto(TST_URL, { waitUntil: 'networkidle2', timeout: 30000 })

    // Step 1: Click "Emitir Certid\u00e3o"
    await page.waitForSelector('input[value="Emitir Certid\u00e3o"]', { timeout: 10000 })
    await page.click('input[value="Emitir Certid\u00e3o"]')

    // Step 2: Wait for the form page
    await page.waitForSelector('#gerarCertidaoForm\\:cpfCnpj', { timeout: 15000 })

    // Step 3: Type formatted CNPJ
    const formattedCnpj = formatCnpj(cnpj)
    log.info({ cnpj, formattedCnpj }, 'Typing CNPJ into form')
    await page.type('#gerarCertidaoForm\\:cpfCnpj', formattedCnpj, { delay: 50 })

    // Step 4: Wait for captcha image to load
    let captchaBase64: string | null = null

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await page.waitForSelector('#idImgBase64[src]', { timeout: 10000 })
        captchaBase64 = await page.evaluate(() => {
          const img = document.getElementById('idImgBase64') as HTMLImageElement | null
          const src = img?.getAttribute('src')
          if (!src || !src.includes(',')) return null
          return src.split(',')[1]?.trim() || null
        })
        if (captchaBase64) break
      } catch {
        log.warn({ attempt }, 'Captcha image not ready, retrying...')
        await new Promise((r) => setTimeout(r, 2000))
      }
    }

    if (!captchaBase64) {
      log.error('Failed to extract captcha image from TST')
      return manualFallback
    }

    // Step 5: Solve captcha via 2Captcha
    log.info('Solving TST captcha via 2Captcha')
    let captchaAnswer: string
    try {
      captchaAnswer = await solveImageCaptcha(captchaBase64)
    } catch (err) {
      log.error({ err }, 'Captcha solving failed')
      return manualFallback
    }

    // Step 6: Type captcha answer (lowercase)
    await page.type('#idCampoResposta', captchaAnswer.toLowerCase(), { delay: 30 })

    // Step 7: Click "Emitir Certid\u00e3o" submit button
    await page.click('#gerarCertidaoForm\\:btnEmitirCertidao')

    // Step 8: Wait for result
    let success = false
    try {
      await page.waitForFunction(
        () => {
          const s = document.getElementById('divSucesso')
          return s && s.style.display !== 'none'
        },
        { timeout: 30000 },
      )
      success = true
    } catch {
      // Check if error div appeared or captcha was wrong
      const hasError = await page.evaluate(() => {
        const errDiv = document.getElementById('divErro')
        return errDiv && errDiv.style.display !== 'none'
      })
      if (hasError) {
        const errorText = await page.evaluate(() => {
          const errDiv = document.getElementById('divErro')
          return errDiv?.textContent?.trim() || ''
        })
        log.warn({ errorText }, 'TST returned error')
        return {
          ...manualFallback,
          detalhes: `Erro no portal: ${errorText}`,
        }
      }
      log.warn('TST result timeout \u2014 captcha may have been wrong')
      return manualFallback
    }

    if (!success) {
      return manualFallback
    }

    // Step 9: Parse result
    const resultText = await page.evaluate(() => {
      const msgEl = document.getElementById('mensagemSucessoCertidaoEmitida')
      return msgEl?.textContent?.trim() || ''
    })

    log.info({ resultText }, 'TST result text')

    const isEmitida = /emitida/i.test(resultText)
    const situacao = isEmitida ? 'regular' : 'irregular'

    // Try to extract certid\u00e3o number and validade
    const pageText = await page.evaluate(() => document.body.innerText)
    const numeroMatch = pageText.match(/Certid[aã]o\s*(?:n[.ºo]*\s*)?[:.]?\s*(\d[\d./-]+)/i)
    const validadeMatch = pageText.match(/[Vv]alidade?\s*[:.]?\s*(\d{2}[/.]\d{2}[/.]\d{4})/i)

    const today = new Date().toISOString().split('T')[0]

    return {
      tipo: 'trabalhista',
      label: 'CNDT \u2014 Certid\u00e3o Trabalhista (TST)',
      situacao,
      detalhes: resultText || (isEmitida ? 'Certid\u00e3o emitida com sucesso' : 'Certid\u00e3o n\u00e3o emitida'),
      numero: numeroMatch?.[1] || null,
      emissao: today,
      validade: validadeMatch?.[1] || null,
      pdf_url: null,
      consulta_url: TST_URL,
    }
  } catch (err) {
    log.error({ err, cnpj }, 'Unexpected error scraping TST')
    return manualFallback
  } finally {
    await page.close().catch(() => {})
  }
}
