'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/auth/profile'
import { getProcessoDetail, listRiscos } from '@/lib/processos/queries'
import { listEstimativas } from '@/lib/precos/actions'
import { summarizeCompliance } from './engine'
import { logger } from '@/lib/logger'

/**
 * Avança a fase do processo de `compliance` → `edital` quando o Compliance
 * Engine confirma que não há pendências críticas.
 *
 * Gap fechado 2026-04-20: compliance é uma página de checklist determinístico,
 * não um artefato markdown gerado por IA, então não cai no NEXT_FASE do
 * generate-artefato route. Precisa desta action dedicada.
 */
export async function avancarComplianceAction(
  processoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await getCurrentProfile()
  if (!profile?.orgao) return { ok: false, error: 'Sem órgão' }
  if (profile.papel !== 'admin' && profile.papel !== 'coordenador') {
    return { ok: false, error: 'Apenas admin/coordenador pode avançar fase' }
  }

  const processo = await getProcessoDetail(processoId)
  if (!processo) return { ok: false, error: 'Processo não encontrado' }

  const [riscos, estimativas] = await Promise.all([
    listRiscos(processoId),
    listEstimativas(processoId),
  ])
  const summary = summarizeCompliance({ processo, riscos, estimativas })

  if (!summary.canPublish) {
    return {
      ok: false,
      error: `Bloqueado: ${summary.criticas} pendência(s) crítica(s) no Compliance. Resolva antes de prosseguir ao Edital.`,
    }
  }

  const supabase = createClient()
  const { error } = await supabase.rpc('set_processo_fase', {
    p_processo_id: processoId,
    p_fase: 'edital',
  })
  if (error) {
    logger.error({ err: error.message }, 'set_processo_fase → edital failed')
    return { ok: false, error: error.message }
  }

  revalidatePath(`/processos/${processoId}`)
  revalidatePath(`/processos/${processoId}/compliance`)
  return { ok: true }
}
