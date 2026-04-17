/**
 * Adapter Smoke Test — validate Compras.gov.br selectors against any URL.
 *
 * Purpose:
 *   Confirm that every selector in packages/workers/src/bot/portals/selectors/
 *   comprasgov.yaml resolves against the current DOM. Runs with a VISIBLE
 *   browser so the operator can compare what the adapter reads vs. what is
 *   actually on screen.
 *
 * Supports THREE environments:
 *
 *   1. PRODUÇÃO (observação apenas):
 *        Cole a URL de um pregão real em andamento. O script abre,
 *        opcionalmente loga com CPF+senha, lê state / chat / fase, e imprime
 *        um relatório. NÃO submete lance em hipótese alguma.
 *
 *   2. TREINAMENTO (fornecedor):
 *        O governo publica um ambiente de treinamento para fornecedores em
 *          https://treinamento.comprasnet.gov.br
 *        É idêntico ao de produção em layout e fluxo, mas os pregões são
 *        fake e qualquer lance nele é inerte. Use com o `--mode auto_bid`
 *        quando quiser validar o fluxo completo de submissão.
 *
 *   3. HOMOLOGAÇÃO (SERPRO):
 *        Alguns órgãos disponibilizam
 *          https://cnetmobile-hmg.estaleiro.serpro.gov.br/
 *        Mesma app, endpoints mock. Se você conseguir acesso, também serve.
 *
 * Uso:
 *   pnpm --filter @licitagram/workers exec tsx \
 *     src/bot/scripts/adapter-smoke-test.ts \
 *     --url "https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/seguro/fornecedor/disputa?identificador=..." \
 *     [--cpf 123.456.789-00 --senha "abc"] \
 *     [--mode observe|auto_bid] \
 *     [--headless]
 *
 * Saída:
 *   Relatório em stdout com uma linha por seletor: [OK] / [MISS] / [VALUE=...]
 *   DOM snapshot salvo em /tmp/smoketest-<timestamp>.html caso qualquer
 *   seletor crítico falhe, para facilitar diagnóstico.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'

// ─── CLI ────────────────────────────────────────────────────────────────────

function arg(name: string): string | undefined {
  const pfx = `--${name}`
  const hit = process.argv.find((a) => a === pfx || a.startsWith(`${pfx}=`))
  if (!hit) return undefined
  if (hit.includes('=')) return hit.split('=').slice(1).join('=')
  const idx = process.argv.indexOf(pfx)
  return process.argv[idx + 1]
}

const url = arg('url')
const cpf = arg('cpf')
const senha = arg('senha')
const mode = (arg('mode') ?? 'observe') as 'observe' | 'auto_bid'
const headless = process.argv.includes('--headless')

if (!url) {
  console.error('❌ Use: --url "https://..." [--cpf ... --senha ...] [--mode observe|auto_bid] [--headless]')
  process.exit(1)
}

if (mode === 'auto_bid') {
  const host = new URL(url).hostname
  const isSafeEnv = host.includes('treinamento') || host.includes('-hmg.') || host.includes('homolog')
  if (!isSafeEnv) {
    console.error(`❌ --mode auto_bid APENAS permitido em ambientes seguros.`)
    console.error(`   Host recebido: ${host}`)
    console.error(`   Hosts aceitos: *treinamento* ou *-hmg.* ou *homolog*`)
    console.error(`   Rode sem --mode ou com --mode observe para produção.`)
    process.exit(2)
  }
}

// ─── Selectors ──────────────────────────────────────────────────────────────

const selectorsPath = join(__dirname, '..', 'portals', 'selectors', 'comprasgov.yaml')
const selectors = parseYaml(readFileSync(selectorsPath, 'utf-8')) as {
  host: string
  paths: Record<string, string>
  sso: Record<string, string>
  login: Record<string, string>
  disputa: Record<string, string>
  proposta: Record<string, string>
}

// ─── Report collector ───────────────────────────────────────────────────────

interface CheckResult {
  group: string
  name: string
  selector: string
  found: boolean
  value: string | null
  error?: string
}

const results: CheckResult[] = []

async function check(page: Page, group: string, name: string, selector: string): Promise<void> {
  try {
    const el = await page.$(selector)
    if (!el) {
      results.push({ group, name, selector, found: false, value: null })
      return
    }
    const text = await el.textContent().catch(() => null)
    const value = (text ?? '').trim().slice(0, 120)
    results.push({ group, name, selector, found: true, value: value || '<empty text>' })
  } catch (err) {
    results.push({
      group,
      name,
      selector,
      found: false,
      value: null,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

function printReport() {
  const byGroup = results.reduce<Record<string, CheckResult[]>>((acc, r) => {
    ;(acc[r.group] ??= []).push(r)
    return acc
  }, {})

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  ADAPTER SMOKE TEST — RELATÓRIO')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  let ok = 0
  let miss = 0
  for (const [group, checks] of Object.entries(byGroup)) {
    console.log(`\n▸ ${group.toUpperCase()}`)
    for (const r of checks) {
      if (r.found) {
        ok++
        console.log(`  ✓ ${r.name.padEnd(30)} = "${r.value}"`)
      } else {
        miss++
        console.log(`  ✗ ${r.name.padEnd(30)} NÃO ENCONTRADO (${r.selector})`)
        if (r.error) console.log(`      erro: ${r.error}`)
      }
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  TOTAL: ${ok + miss} seletores · ${ok} ok · ${miss} falhou`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  if (miss > 0) {
    console.log('⚠️  Seletores faltando. Passos:')
    console.log('    1. Abra o DevTools no navegador do smoke test')
    console.log('    2. Inspecione os elementos equivalentes')
    console.log('    3. Edite packages/workers/src/bot/portals/selectors/comprasgov.yaml')
    console.log('    4. Re-rode o smoke test — sem rebuild\n')
  } else {
    console.log('✅ Todos os seletores resolveram. Adapter está alinhado com este portal.\n')
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🚀 Smoke test iniciando`)
  console.log(`   URL:      ${url}`)
  console.log(`   Modo:     ${mode}`)
  console.log(`   Headless: ${headless}`)
  console.log(`   Login:    ${cpf ? 'COM credenciais (CPF)' : 'SEM credenciais (observação pública)'}`)

  const browser: Browser = await chromium.launch({
    headless,
    args: ['--disable-blink-features=AutomationControlled', '--lang=pt-BR'],
  })
  const context: BrowserContext = await browser.newContext({
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    viewport: { width: 1400, height: 900 },
  })
  const page = await context.newPage()

  try {
    // Step 1 — open URL
    console.log(`\n▸ Abrindo ${url}`)
    await page.goto(url!, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForTimeout(2000)

    // Step 2 — optional login
    if (cpf && senha) {
      console.log(`\n▸ Tentando login gov.br SSO`)
      try {
        const btn = await page.$(selectors.login.govbr_button)
        if (btn) await btn.click()
        await page.waitForURL(/sso\.acesso\.gov\.br/, { timeout: 15_000 }).catch(() => null)
        await page.fill(selectors.sso.cpf_input, cpf)
        await page.click(selectors.sso.cpf_submit)
        await page.waitForSelector(selectors.sso.password_input, { timeout: 15_000 })
        await page.fill(selectors.sso.password_input, senha)
        await page.click(selectors.sso.password_submit)
        await page.waitForURL((u) => String(u).includes('/comprasnet-web/seguro/'), { timeout: 30_000 }).catch(() => null)
        console.log(`  ✓ URL pós-login: ${page.url()}`)
      } catch (err) {
        console.log(`  ✗ Login falhou: ${err instanceof Error ? err.message : err}`)
        console.log(`    (continuando mesmo assim — seletores de disputa podem exigir login)`)
      }
    }

    // Step 3 — run checks
    console.log(`\n▸ Executando checks (${Object.keys(selectors.disputa).length + Object.keys(selectors.proposta).length + Object.keys(selectors.login).length + Object.keys(selectors.sso).length} seletores)`)

    for (const [key, sel] of Object.entries(selectors.login)) {
      if (typeof sel === 'string') await check(page, 'login', key, sel)
    }
    for (const [key, sel] of Object.entries(selectors.disputa)) {
      if (typeof sel === 'string') await check(page, 'disputa', key, sel)
    }
    for (const [key, sel] of Object.entries(selectors.proposta)) {
      if (typeof sel === 'string') await check(page, 'proposta', key, sel)
    }

    // DOM dump in case of failure
    const miss = results.filter((r) => !r.found).length
    if (miss > 0) {
      const domPath = `/tmp/smoketest-${Date.now()}.html`
      writeFileSync(domPath, await page.content(), 'utf-8')
      console.log(`\n📄 DOM dump salvo em ${domPath}`)
    }

    // AUTO_BID dry-run — ONLY in safe environments (already gated above)
    if (mode === 'auto_bid') {
      console.log(`\n▸ Modo auto_bid: tentando localizar campo de lance…`)
      const input = await page.$(selectors.disputa.bid_input)
      console.log(`  ${input ? '✓' : '✗'} bid_input ${input ? 'encontrado' : 'NÃO encontrado'}`)
      const btn = await page.$(selectors.disputa.bid_submit)
      console.log(`  ${btn ? '✓' : '✗'} bid_submit ${btn ? 'encontrado' : 'NÃO encontrado'}`)
      console.log(`\n  ⚠️  Lance NÃO foi submetido automaticamente.`)
      console.log(`      Para testar submissão manualmente:`)
      console.log(`        - Com o navegador aberto, preencha o campo e clique no botão`)
      console.log(`        - Verifique o toast de sucesso`)
      console.log(`        - Confirme que o seletor 'bid_success_toast' está na YAML`)
    }

    printReport()

    if (!headless) {
      console.log(`🔍 Navegador continua aberto. Ctrl+C quando terminar a inspeção.`)
      await new Promise(() => {}) // hold open
    }
  } finally {
    if (headless) {
      await context.close()
      await browser.close()
    }
  }
}

main().catch((err) => {
  console.error('💥 Smoke test crashou:', err)
  process.exit(3)
})
