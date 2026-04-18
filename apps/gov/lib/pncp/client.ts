import { logger } from '@/lib/logger'

/**
 * PNCP (Portal Nacional de Contratações Públicas) API v2.3 client.
 *
 * A publicação REAL exige certificado digital ICP-Brasil (conforme
 * MP 2.200-2/2001 e manual PNCP). Esse pré-requisito depende da
 * infraestrutura de assinatura digital do órgão — fora de escopo
 * do app web gov puro.
 *
 * Esta implementação é um STUB GRACEFUL:
 *   - Valida o payload estrutural
 *   - Loga intenção
 *   - Retorna "pendente" (status permitido) sem chamar a API PNCP
 *
 * Quando a integração real for feita:
 *   1. Obter certificado ICP-Brasil (.pfx/.p12)
 *   2. Configurar PNCP_CERT_PATH + PNCP_CERT_PASSWORD em env vars
 *   3. Substituir `stubSend` por POST real via https.Agent com cert
 */

export interface PncpPublishPayload {
  orgaoCnpj: string
  processoNumero: string
  tipoDocumento:
    | 'edital'
    | 'contrato'
    | 'aditivo'
    | 'dispensa'
    | 'inexigibilidade'
    | 'ata'
    | 'pca'
  objeto: string
  valorEstimado: number | null
  modalidade: string | null
  dataPublicacao: string
}

export interface PncpPublishResult {
  status: 'pendente' | 'enviando' | 'publicado' | 'falhou'
  numeroControle: string | null
  error?: string
  payload: PncpPublishPayload
  resposta: Record<string, unknown> | null
}

export async function publishToPncp(payload: PncpPublishPayload): Promise<PncpPublishResult> {
  if (!payload.orgaoCnpj || payload.orgaoCnpj.length !== 14) {
    return { status: 'falhou', numeroControle: null, error: 'CNPJ do órgão inválido', payload, resposta: null }
  }
  if (!payload.objeto || payload.objeto.length < 5) {
    return { status: 'falhou', numeroControle: null, error: 'Objeto muito curto', payload, resposta: null }
  }

  const hasCert = !!process.env.PNCP_CERT_PATH && !!process.env.PNCP_CERT_PASSWORD
  if (!hasCert) {
    logger.info(
      { orgao: payload.orgaoCnpj.slice(0, 8) + '***', tipo: payload.tipoDocumento, numero: payload.processoNumero },
      '[PNCP] Publicação registrada como pendente (cert ICP-Brasil não configurado)',
    )
    return {
      status: 'pendente',
      numeroControle: null,
      payload,
      resposta: {
        mock: true,
        note: 'ICP-Brasil certificate not configured — publication queued for manual review',
      },
    }
  }

  // TODO Fase 9.2 (próxima sessão): integração real PNCP v2.3
  // https://pncp.gov.br/api/pncp-api/swagger-ui/index.html
  logger.warn('[PNCP] Cert configured but real integration not implemented yet — treating as pendente')
  return {
    status: 'pendente',
    numeroControle: null,
    payload,
    resposta: { mock: true, note: 'Real PNCP integration pending' },
  }
}
