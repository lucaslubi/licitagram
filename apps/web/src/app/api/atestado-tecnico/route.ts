import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getUserWithPlan } from '@/lib/auth-helpers'
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } from 'docx'

/**
 * POST /api/atestado-tecnico
 * Generates a DOCX technical capability certificate request letter.
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

    const children: any[] = []

    // Destinatário
    children.push(
      new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: 'Ao', size: 22 })] }),
      new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: orgaoContratante, bold: true, size: 22 })] }),
      new Paragraph({ spacing: { after: 300 }, children: [new TextRun({ text: `A/C: ${responsavelOrgao || 'Gestor do Contrato'}`, size: 22 })] }),
    )

    // Título
    children.push(
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 300 }, children: [
        new TextRun({ text: 'SOLICITAÇÃO DE ATESTADO DE CAPACIDADE TÉCNICA', bold: true, size: 26, underline: {} }),
      ]}),
    )

    // Corpo
    children.push(
      new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun({ text: `${company?.razao_social || '[RAZÃO SOCIAL]'}`, bold: true, size: 22 }),
        new TextRun({ text: `, inscrita no CNPJ nº ${company?.cnpj || '[CNPJ]'}, vem respeitosamente solicitar a emissão de `, size: 22 }),
        new TextRun({ text: 'ATESTADO DE CAPACIDADE TÉCNICA', bold: true, size: 22 }),
        new TextRun({ text: ` referente ao Contrato nº ${numeroContrato}, cujo objeto é ${objetoResumido}.`, size: 22 }),
      ]}),
    )

    if (periodoExecucao?.inicio && periodoExecucao?.fim) {
      children.push(new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun({ text: `O contrato foi executado no período de ${new Date(periodoExecucao.inicio).toLocaleDateString('pt-BR')} a ${new Date(periodoExecucao.fim).toLocaleDateString('pt-BR')}, pelo valor total de ${valorFormatado}.`, size: 22 }),
      ]}))
    } else {
      children.push(new Paragraph({ spacing: { after: 200 }, children: [
        new TextRun({ text: `O valor total do contrato é de ${valorFormatado}.`, size: 22 }),
      ]}))
    }

    // Requisitos do atestado
    children.push(
      new Paragraph({ spacing: { after: 100 }, children: [
        new TextRun({ text: 'O atestado solicitado deverá conter, no mínimo:', size: 22 }),
      ]}),
      ...['Identificação do órgão emitente;', 'Identificação da empresa contratada;', 'Descrição do objeto executado;', 'Período de execução;', 'Declaração de que os serviços/fornecimentos foram realizados satisfatoriamente.'].map((item, i) =>
        new Paragraph({ spacing: { after: 50 }, children: [
          new TextRun({ text: `${String.fromCharCode(97 + i)}) ${item}`, size: 22 }),
        ]})
      ),
    )

    // Fundamentação
    children.push(
      new Paragraph({ spacing: { before: 200, after: 200 }, children: [
        new TextRun({ text: 'Fundamentação: ', bold: true, size: 22 }),
        new TextRun({ text: 'Art. 67, §1º da Lei nº 14.133/2021.', size: 22 }),
      ]}),
    )

    // Fechamento
    children.push(
      new Paragraph({ spacing: { before: 200, after: 100 }, children: [
        new TextRun({ text: 'Sem mais,', size: 22 }),
      ]}),
      new Paragraph({ spacing: { after: 300 }, children: [
        new TextRun({ text: `${company?.municipio || '[Cidade]'} - ${company?.uf || '[UF]'}, ${hoje}`, size: 22 }),
      ]}),
      new Paragraph({ spacing: { before: 400, after: 50 }, children: [
        new TextRun({ text: '_________________________________', size: 22 }),
      ]}),
      new Paragraph({ children: [new TextRun({ text: company?.representante_nome || '[Nome do Representante Legal]', bold: true, size: 22 })] }),
      new Paragraph({ children: [new TextRun({ text: company?.representante_cargo || 'Representante Legal', size: 20 })] }),
      new Paragraph({ children: [new TextRun({ text: company?.representante_cpf ? `CPF: ${company.representante_cpf}` : '', size: 20, color: '666666' })] }),
      new Paragraph({ children: [new TextRun({ text: company?.razao_social || '', size: 20 })] }),
      new Paragraph({ children: [new TextRun({ text: `CNPJ: ${company?.cnpj || ''}`, size: 20 })] }),
    )

    const doc = new Document({ sections: [{ children }] })
    const buffer = await Packer.toBuffer(doc)
    const filename = `solicitacao_atestado_${numeroContrato.replace(/\W/g, '_')}.docx`

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('[atestado-tecnico]', err)
    return NextResponse.json({ error: 'Erro ao gerar atestado' }, { status: 500 })
  }
}
