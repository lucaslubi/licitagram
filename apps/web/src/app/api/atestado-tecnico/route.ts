import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getUserWithPlan } from '@/lib/auth-helpers'

/**
 * POST /api/atestado-tecnico
 * Generates a technical capability certificate request letter.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserWithPlan()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!user.companyId) return NextResponse.json({ error: 'Empresa não vinculada' }, { status: 400 })

    const { numeroContrato, objetoResumido, valorContrato, periodoExecucao, orgaoContratante, responsavelOrgao } = await request.json()

    if (!numeroContrato || !objetoResumido || !orgaoContratante) {
      return NextResponse.json({ error: 'Dados do contrato obrigatórios' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: company } = await supabase
      .from('companies')
      .select('razao_social, cnpj, representante_nome, representante_cpf, representante_cargo, uf, municipio')
      .eq('id', user.companyId)
      .single()

    const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    const valorFormatado = valorContrato ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorContrato) : 'N/I'

    const texto = `
Ao
${orgaoContratante}
${responsavelOrgao ? `A/C: ${responsavelOrgao}` : 'A/C: Gestor do Contrato'}


SOLICITAÇÃO DE ATESTADO DE CAPACIDADE TÉCNICA


${company?.razao_social || '[RAZÃO SOCIAL]'}, inscrita no CNPJ nº ${company?.cnpj || '[CNPJ]'}, vem respeitosamente solicitar a emissão de ATESTADO DE CAPACIDADE TÉCNICA referente ao Contrato nº ${numeroContrato}, cujo objeto é ${objetoResumido}.

${periodoExecucao?.inicio && periodoExecucao?.fim ? `O contrato foi executado no período de ${new Date(periodoExecucao.inicio).toLocaleDateString('pt-BR')} a ${new Date(periodoExecucao.fim).toLocaleDateString('pt-BR')}, pelo valor total de ${valorFormatado}.` : `O valor total do contrato é de ${valorFormatado}.`}

O atestado solicitado deverá conter, no mínimo:
a) Identificação do órgão emitente;
b) Identificação da empresa contratada;
c) Descrição do objeto executado;
d) Período de execução;
e) Declaração de que os serviços/fornecimentos foram realizados satisfatoriamente.

Fundamentação: Art. 67, §1º da Lei nº 14.133/2021.

Sem mais,
${company?.municipio || '[Cidade]'} - ${company?.uf || '[UF]'}, ${hoje}


_________________________________
${company?.representante_nome || '[Nome do Representante Legal]'}
${company?.representante_cargo || 'Representante Legal'}
${company?.representante_cpf ? `CPF: ${company.representante_cpf}` : ''}
${company?.razao_social || ''}
CNPJ: ${company?.cnpj || ''}
`.trim()

    return new NextResponse(texto, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="solicitacao_atestado_${numeroContrato.replace(/\W/g, '_')}.txt"`,
      },
    })
  } catch (err) {
    console.error('[atestado-tecnico]', err)
    return NextResponse.json({ error: 'Erro ao gerar atestado' }, { status: 500 })
  }
}
