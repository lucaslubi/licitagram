/**
 * Certidões — Automated Government Integration
 *
 * Current status:
 * ✅ TCU/CEIS/CNEP — Automatic via Portal da Transparência (in certidoes.ts)
 * 📎 Receita Federal (CND) — Manual (requires hCaptcha, handled by VPS worker via CapSolver)
 * 📎 TST (CNDT) — Manual (RichFaces A4J AJAX, handled by VPS worker via CapSolver)
 * 📎 Caixa (FGTS CRF) — Manual (WAF blocks server-side requests)
 *
 * Future: Use Puppeteer on VPS worker for TST/Receita/FGTS automation.
 */

import type { CertidaoResult } from './certidoes'

// ─── Config ─────────────────────────────────────────────────────────────────

export function isAutoSolveAvailable(): boolean {
  return true // TCU always works
}

// ─── Receita Federal (CND) — Manual ─────────────────────────────────────────
// Requires hCaptcha — automated via CapSolver on VPS worker
// Vercel-side returns manual fallback (actual automation runs on VPS)

const RECEITA_MANUAL_URL = 'https://servicos.receitafederal.gov.br/servico/certidoes/#/home/cnpj'

export async function fetchCNDFederalAuto(_cnpj: string): Promise<CertidaoResult> {
  return {
    tipo: 'cnd_federal',
    label: 'CND Federal (Receita/PGFN)',
    situacao: 'manual',
    detalhes: 'Acesse o link para emitir a certidão federal.',
    numero: null,
    emissao: null,
    validade: null,
    pdf_url: null,
    consulta_url: RECEITA_MANUAL_URL,
  }
}

// ─── TST (CNDT) — Manual ────────────────────────────────────────────────────
// TST uses RichFaces 3.3.3 A4J AJAX for form submission.
// The A4J.AJAX.Submit requires JavaScript-level serialization that
// cannot be replicated via server-side fetch() calls (NPE on every attempt).
// Needs Puppeteer/headless browser for automation.

export async function fetchCNDTAuto(_cnpj: string): Promise<CertidaoResult> {
  return {
    tipo: 'trabalhista',
    label: 'CNDT — Certidão Trabalhista (TST)',
    situacao: 'manual',
    detalhes: 'Acesse o link para emitir a certidão trabalhista.',
    numero: null,
    emissao: null,
    validade: null,
    pdf_url: null,
    consulta_url: 'https://cndt-certidao.tst.jus.br/inicio.faces',
  }
}

// ─── FGTS (Caixa) — Manual ──────────────────────────────────────────────────
// WAF blocks all server-side requests (403)

const FGTS_URL = 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf'

export async function fetchFGTSAuto(_cnpj: string): Promise<CertidaoResult> {
  return {
    tipo: 'fgts',
    label: 'CRF FGTS (Caixa)',
    situacao: 'manual',
    detalhes: 'Acesse o link para emitir o CRF do FGTS.',
    numero: null,
    emissao: null,
    validade: null,
    pdf_url: null,
    consulta_url: FGTS_URL,
  }
}

// ─── Main Auto-Consulta ─────────────────────────────────────────────────────

export async function consultarCertidoesAuto(
  cnpj: string,
  _options?: { uf?: string; municipio?: string },
): Promise<{
  certidoes: CertidaoResult[]
  errors: string[]
  autoCount: number
}> {
  // All captcha-protected certidões return instant manual links
  // (actual automation runs on VPS worker with CapSolver)
  const [cndFederal, cndt, fgts] = await Promise.all([
    fetchCNDFederalAuto(cnpj),
    fetchCNDTAuto(cnpj),
    fetchFGTSAuto(cnpj),
  ])

  return {
    certidoes: [cndFederal, cndt, fgts],
    errors: [],
    autoCount: 0,
  }
}
