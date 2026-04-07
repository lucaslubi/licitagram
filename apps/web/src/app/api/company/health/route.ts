import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/company/health
 *
 * Retorna um score de completude do perfil da empresa do usuário atual,
 * com lista de campos críticos e recomendados faltando. Consumido pelo
 * ProfileHealthBanner (client component + SWR) no layout do dashboard.
 */

interface MissingField {
  field: string
  label: string
  importance: 'critical' | 'recommended'
}

const isValidCnae = (s: unknown): boolean =>
  typeof s === 'string' && /^\d{7}$/.test(s)

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (!profile?.company_id) {
      return NextResponse.json({
        score: 0,
        missing: [
          {
            field: 'company',
            label: 'Empresa não cadastrada',
            importance: 'critical' as const,
          },
        ],
        criticalCount: 1,
        recommendedCount: 0,
      })
    }

    const { data: company } = await supabase
      .from('companies')
      .select(
        'razao_social, cnae_principal, cnaes_secundarios, descricao_servicos, palavras_chave, capacidades, porte, uf, municipio, email, telefone',
      )
      .eq('id', profile.company_id)
      .single()

    if (!company) {
      return NextResponse.json({
        score: 0,
        missing: [
          {
            field: 'company',
            label: 'Empresa não encontrada',
            importance: 'critical' as const,
          },
        ],
        criticalCount: 1,
        recommendedCount: 0,
      })
    }

    const missing: MissingField[] = []
    let score = 100

    // Critical fields (-25 each)
    if (!company.razao_social || company.razao_social.trim().length < 2) {
      missing.push({ field: 'razao_social', label: 'Razão social', importance: 'critical' })
      score -= 25
    }
    if (!isValidCnae(company.cnae_principal)) {
      missing.push({ field: 'cnae_principal', label: 'CNAE principal', importance: 'critical' })
      score -= 25
    }
    const validSecundarios = (company.cnaes_secundarios || []).filter(isValidCnae)
    if (validSecundarios.length === 0) {
      missing.push({
        field: 'cnaes_secundarios',
        label: 'CNAEs secundários',
        importance: 'critical',
      })
      score -= 25
    }
    if (!company.descricao_servicos || company.descricao_servicos.length < 50) {
      missing.push({
        field: 'descricao_servicos',
        label: 'Descrição dos serviços',
        importance: 'critical',
      })
      score -= 25
    }

    // Recommended fields (-5 each)
    const recommended: Array<{ field: keyof typeof company; label: string }> = [
      { field: 'palavras_chave', label: 'Palavras-chave' },
      { field: 'capacidades', label: 'Capacidades técnicas' },
      { field: 'porte', label: 'Porte da empresa' },
      { field: 'uf', label: 'UF' },
      { field: 'municipio', label: 'Município' },
      { field: 'email', label: 'E-mail de contato' },
      { field: 'telefone', label: 'Telefone' },
    ]
    for (const r of recommended) {
      const val = company[r.field]
      const empty =
        val == null ||
        (typeof val === 'string' && val.trim().length === 0) ||
        (Array.isArray(val) && val.length === 0)
      if (empty) {
        missing.push({
          field: r.field as string,
          label: r.label,
          importance: 'recommended',
        })
        score -= 5
      }
    }

    if (score < 0) score = 0

    const criticalCount = missing.filter((m) => m.importance === 'critical').length
    const recommendedCount = missing.filter((m) => m.importance === 'recommended').length

    return NextResponse.json({
      score,
      missing,
      criticalCount,
      recommendedCount,
    })
  } catch (err) {
    console.error('[company/health]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
