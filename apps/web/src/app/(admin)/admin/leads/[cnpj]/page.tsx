import { requirePlatformAdmin } from '@/lib/auth-helpers'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

const DATA_API_URL = process.env.DATA_API_URL || 'http://85.31.60.53:3997'

import { formatCurrencyWhole as formatCurrency, formatDateNullable as formatDate, formatPercentFromRatio as formatPercent } from '@/lib/format'


export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ cnpj: string }>
}) {
  await requirePlatformAdmin()
  const { cnpj } = await params

  let lead: any = null
  let fetchError = false

  try {
    const res = await fetch(`${DATA_API_URL}/api/leads/${cnpj}`, { cache: 'no-store' })
    if (res.ok) {
      lead = await res.json()
    } else {
      fetchError = true
    }
  } catch {
    fetchError = true
  }

  if (fetchError || !lead) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-bold mb-2">Lead não encontrado</h1>
        <p className="text-zinc-400 mb-4">CNPJ: {cnpj}</p>
        <Link href="/admin/leads" className="text-emerald-400 hover:underline">← Voltar para leads</Link>
      </div>
    )
  }

  const cnpjFormatado = lead.cnpj?.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <Link href="/admin/leads" className="text-sm text-zinc-500 hover:text-zinc-300 mb-2 inline-block">← Voltar para leads</Link>
          <h1 className="text-xl sm:text-2xl font-bold">{lead.razao_social}</h1>
          {lead.nome_fantasia && <p className="text-zinc-400">{lead.nome_fantasia}</p>}
          <p className="text-sm text-zinc-500 font-mono mt-1">{cnpjFormatado}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {lead.score_fit_licitagram >= 80 && <Badge className="bg-emerald-600 text-white text-lg px-3 py-1">Score: {lead.score_fit_licitagram}</Badge>}
          {lead.score_fit_licitagram >= 50 && lead.score_fit_licitagram < 80 && <Badge className="bg-amber-500 text-white text-lg px-3 py-1">Score: {lead.score_fit_licitagram}</Badge>}
          {lead.score_fit_licitagram < 50 && <Badge className="bg-zinc-600 text-white text-lg px-3 py-1">Score: {lead.score_fit_licitagram}</Badge>}
          {lead.plano_recomendado && (
            <Badge className={
              lead.plano_recomendado === 'ENTERPRISE' ? 'bg-violet-600 text-white px-3 py-1' :
              lead.plano_recomendado === 'PROFISSIONAL' ? 'bg-blue-600 text-white px-3 py-1' :
              'bg-zinc-600 text-white px-3 py-1'
            }>{lead.plano_recomendado}</Badge>
          )}
          {lead.opt_out && <Badge className="bg-yellow-600 text-white px-3 py-1">OPT-OUT</Badge>}
          {lead.bloqueado_disparo && <Badge className="bg-red-600 text-white px-3 py-1">BLOQUEADO</Badge>}
          {lead.ja_e_cliente_licitagram && <Badge className="bg-violet-600 text-white px-3 py-1">JÁ É CLIENTE</Badge>}
        </div>
      </div>

      {/* Motivo qualificação */}
      {lead.motivo_qualificacao && (
        <Card className="p-4 bg-emerald-900/20 border-emerald-800/40 mb-6">
          <div className="text-xs text-emerald-400 uppercase tracking-wider mb-1">Motivo de qualificação</div>
          <p className="text-sm text-zinc-200">{lead.motivo_qualificacao}</p>
        </Card>
      )}

      {lead.motivo_bloqueio && (
        <Card className="p-4 bg-red-900/20 border-red-800/40 mb-6">
          <div className="text-xs text-red-400 uppercase tracking-wider mb-1">Motivo do bloqueio</div>
          <p className="text-sm text-zinc-200">{lead.motivo_bloqueio}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Dados Cadastrais */}
        <Card className="p-5 bg-zinc-900/60 border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">Dados Cadastrais</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-zinc-500">CNPJ</dt><dd className="text-zinc-200 font-mono">{cnpjFormatado}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">CNPJ Raiz</dt><dd className="text-zinc-200 font-mono">{lead.cnpj_raiz}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Porte</dt><dd className="text-zinc-200">{lead.porte || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Natureza Jurídica</dt><dd className="text-zinc-200">{lead.natureza_juridica || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Situação</dt><dd className="text-zinc-200">{lead.situacao_cadastral || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Data Abertura</dt><dd className="text-zinc-200">{formatDate(lead.data_abertura)}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">CNAE</dt><dd className="text-zinc-200">{lead.cnae_principal_codigo} — {lead.cnae_principal_descricao || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Segmento</dt><dd className="text-zinc-200">{lead.segmento_vertical || '—'}</dd></div>
          </dl>
        </Card>

        {/* Localização */}
        <Card className="p-5 bg-zinc-900/60 border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">Localização e Contato</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-zinc-500">UF / Município</dt><dd className="text-zinc-200">{lead.uf || '—'} / {lead.municipio || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">CEP</dt><dd className="text-zinc-200 font-mono">{lead.cep || '—'}</dd></div>
            {lead.endereco_completo && <div><dt className="text-zinc-500 mb-1">Endereço</dt><dd className="text-zinc-200">{lead.endereco_completo}</dd></div>}
            <div className="flex justify-between"><dt className="text-zinc-500">Email</dt><dd className="text-emerald-400">{lead.email_institucional_generico || <span className="text-zinc-600">Não disponível</span>}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Fonte Email</dt><dd className="text-zinc-200">{lead.email_institucional_fonte}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Email Validado</dt><dd>{lead.email_institucional_validado ? <span className="text-emerald-400">✓ Sim</span> : <span className="text-zinc-500">Não</span>}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Telefone</dt><dd className="text-zinc-200">{lead.telefone_comercial || '—'}</dd></div>
            {lead.site_institucional && <div className="flex justify-between"><dt className="text-zinc-500">Site</dt><dd><a href={lead.site_institucional} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{lead.site_institucional}</a></dd></div>}
          </dl>
        </Card>

        {/* Licitações */}
        <Card className="p-5 bg-zinc-900/60 border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">Performance em Licitações</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 bg-zinc-800/50 rounded-lg">
              <div className="text-2xl font-bold text-white">{lead.total_licitacoes_participadas_12m || 0}</div>
              <div className="text-xs text-zinc-500">Participações 12m</div>
            </div>
            <div className="text-center p-3 bg-zinc-800/50 rounded-lg">
              <div className="text-2xl font-bold text-emerald-400">{lead.total_licitacoes_ganhas_12m || 0}</div>
              <div className="text-xs text-zinc-500">Vitórias 12m</div>
            </div>
            <div className="text-center p-3 bg-zinc-800/50 rounded-lg">
              <div className="text-2xl font-bold text-white">{lead.total_licitacoes_participadas_total || 0}</div>
              <div className="text-xs text-zinc-500">Part. Total</div>
            </div>
            <div className="text-center p-3 bg-zinc-800/50 rounded-lg">
              <div className="text-2xl font-bold text-emerald-400">{lead.total_licitacoes_ganhas_total || 0}</div>
              <div className="text-xs text-zinc-500">Vitórias Total</div>
            </div>
          </div>
          <dl className="space-y-2 text-sm mt-4">
            <div className="flex justify-between"><dt className="text-zinc-500">Taxa de Conversão</dt><dd className="text-zinc-200">{formatPercent(lead.taxa_conversao_vitoria)}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Ticket Médio</dt><dd className="text-zinc-200 font-mono">{formatCurrency(lead.ticket_medio_contratos)}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Maior Contrato</dt><dd className="text-zinc-200 font-mono">{formatCurrency(lead.maior_contrato_valor)}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Valor Ganho 12m</dt><dd className="text-zinc-200 font-mono">{formatCurrency(lead.valor_total_contratos_ganhos_12m)}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Valor Ganho Total</dt><dd className="text-zinc-200 font-mono">{formatCurrency(lead.valor_total_contratos_ganhos_total)}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Órgãos Distintos 12m</dt><dd className="text-zinc-200">{lead.orgaos_compradores_distintos_12m || 0}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Diversidade CNAE</dt><dd className="text-zinc-200">{lead.diversidade_cnae_editais || 0} divisões</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Última Participação</dt><dd className="text-zinc-200">{formatDate(lead.ultima_participacao_data)}</dd></div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Perdeu por Pouco (&lt;5%)</dt>
              <dd className={lead.licitacoes_perdidas_por_pouco > 0 ? 'text-red-400 font-bold' : 'text-zinc-500'}>
                {lead.licitacoes_perdidas_por_pouco || 0}
              </dd>
            </div>
          </dl>
        </Card>

        {/* Compliance e LGPD */}
        <Card className="p-5 bg-zinc-900/60 border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">Compliance e LGPD</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-500">CEIS</dt>
              <dd>{lead.status_ceis ? <span className="text-red-400 font-bold">⚠️ SANCIONADO</span> : <span className="text-emerald-400">✓ Limpo</span>}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">CNEP</dt>
              <dd>{lead.status_cnep ? <span className="text-red-400 font-bold">⚠️ SANCIONADO</span> : <span className="text-emerald-400">✓ Limpo</span>}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">CEPIM</dt>
              <dd>{lead.status_cepim ? <span className="text-red-400 font-bold">⚠️ SANCIONADO</span> : <span className="text-emerald-400">✓ Limpo</span>}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Status Geral</dt>
              <dd>{lead.esta_limpo ? <Badge className="bg-emerald-600 text-white">LIMPO</Badge> : <Badge className="bg-red-600 text-white">COM RESTRIÇÃO</Badge>}</dd>
            </div>
            <div className="flex justify-between"><dt className="text-zinc-500">Verificação Sanções</dt><dd className="text-zinc-200">{formatDate(lead.data_ultima_verificacao_sancoes)}</dd></div>
            <div className="border-t border-zinc-700 pt-2 mt-2"></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Opt-Out</dt><dd>{lead.opt_out ? <span className="text-yellow-400">Sim — {formatDate(lead.opt_out_data)}</span> : <span className="text-zinc-400">Não</span>}</dd></div>
            {lead.opt_out_origem && <div className="flex justify-between"><dt className="text-zinc-500">Origem Opt-Out</dt><dd className="text-zinc-200">{lead.opt_out_origem}</dd></div>}
            <div className="flex justify-between"><dt className="text-zinc-500">Bloqueado</dt><dd>{lead.bloqueado_disparo ? <span className="text-red-400">Sim</span> : <span className="text-zinc-400">Não</span>}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Base Legal</dt><dd className="text-zinc-400 text-xs max-w-[60%] text-right">{lead.base_legal_lgpd || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">LIA Versão</dt><dd className="text-zinc-200">{lead.lia_versao || '—'}</dd></div>
          </dl>
        </Card>

        {/* Outreach Status */}
        <Card className="p-5 bg-zinc-900/60 border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">Status de Outreach</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-zinc-500">Status</dt><dd><Badge className="bg-zinc-700 text-white">{lead.status_outreach || 'NAO_CONTACTADO'}</Badge></dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Emails Enviados</dt><dd className="text-zinc-200">{lead.total_emails_enviados || 0}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Emails Abertos</dt><dd className="text-zinc-200">{lead.total_emails_abertos || 0}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Emails Clicados</dt><dd className="text-zinc-200">{lead.total_emails_clicados || 0}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Primeiro Envio</dt><dd className="text-zinc-200">{formatDate(lead.data_primeiro_envio)}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Último Envio</dt><dd className="text-zinc-200">{formatDate(lead.data_ultimo_envio)}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Última Abertura</dt><dd className="text-zinc-200">{formatDate(lead.data_ultima_abertura)}</dd></div>
          </dl>
        </Card>

        {/* Órgãos Compradores */}
        <Card className="p-5 bg-zinc-900/60 border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wider">Top Órgãos Compradores</h2>
          {lead.orgaos_compradores_lista && Array.isArray(lead.orgaos_compradores_lista) && lead.orgaos_compradores_lista.length > 0 ? (
            <div className="space-y-2">
              {lead.orgaos_compradores_lista.map((org: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm p-2 bg-zinc-800/40 rounded-lg">
                  <span className="text-zinc-300 truncate max-w-[70%]">{org.nome || org.cnpj}</span>
                  <span className="text-zinc-500 font-mono shrink-0">{org.count}x</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-zinc-500 text-sm">Nenhum órgão registrado</p>
          )}
        </Card>
      </div>

      {/* Metadata */}
      <Card className="p-4 bg-zinc-900/30 border-zinc-800 mb-6">
        <div className="flex flex-wrap gap-6 text-xs text-zinc-500">
          <span>Criado em: {formatDate(lead.criado_em)}</span>
          <span>Atualizado em: {formatDate(lead.atualizado_em)}</span>
          <span>Último enriquecimento: {formatDate(lead.ultima_atualizacao_enriquecimento)}</span>
          <span>Versão do score: {lead.versao_score || 1}</span>
        </div>
      </Card>
    </div>
  )
}
