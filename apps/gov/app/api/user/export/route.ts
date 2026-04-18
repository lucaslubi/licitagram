import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/auth/profile'
import { logger } from '@/lib/logger'

/**
 * GET /api/user/export — LGPD art. 18 II (acesso a dados pessoais)
 * Retorna JSON com todos os dados do usuário autenticado + vínculos em
 * licitagov.*. Download direto, nome "licitagov-meus-dados-YYYY-MM-DD.json".
 */
export async function GET(_req: NextRequest) {
  const profile = await getCurrentProfile()
  if (!profile) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const supabase = createClient()
  const { data, error } = await supabase.rpc('lgpd_export_user_data')
  if (error) {
    logger.error({ err: error.message }, 'lgpd_export_user_data failed')
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const filename = `licitagov-meus-dados-${new Date().toISOString().slice(0, 10)}.json`
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
