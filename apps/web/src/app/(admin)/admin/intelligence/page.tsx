import { requirePlatformAdmin } from '@/lib/auth-helpers'
import { StatsCard } from '@/components/admin/stats-card'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const PAGE_SIZE = 30

// ─── Fraud Type Definitions ────────────────────────────────────────────────
const TYPE_CONFIG: Record<string, {
  label: string
  icon: string
  defaultSeverity: string
}> = {
  socio_em_comum: {
    label: 'Socio em Comum',
    icon: '\u{1F465}',
    defaultSeverity: 'HIGH',
  },
  empresa_recente: {
    label: 'Empresa Recente',
    icon: '\u{1F195}',
    defaultSeverity: 'MEDIUM',
  },
  capital_incompativel: {
    label: 'Capital Incompativel',
    icon: '\u{1F4B0}',
    defaultSeverity: 'MEDIUM',
  },
  sancionada: {
    label: 'Empresa Sancionada',
    icon: '\u{26D4}',
    defaultSeverity: 'CRITICAL',
  },
  mesmo_endereco: {
    label: 'Endereco Compartilhado',
    icon: '\u{1F3E0}',
    defaultSeverity: 'HIGH',
  },
  entidade_relacionada: {
    label: 'Entidade Relacionada',
    icon: '\u{1F50D}',
    defaultSeverity: 'HIGH',
  },
  empresa_sancionada: {
    label: 'Empresa Sancionada',
    icon: '\u{26D4}',
    defaultSeverity: 'CRITICAL',
  },
}

// Uppercase aliases for backward compat
for (const [key, val] of Object.entries({ ...TYPE_CONFIG })) {
  TYPE_CONFIG[key.toUpperCase()] = val
}

const SEVERITY_STYLES: Record<string, { bg: string; border: string; text: string; badge: string; glow: string }> = {
  CRITICAL: {
    bg: 'bg-red-950/30',
    border: 'border-red-500/40',
    text: 'text-red-400',
    badge: 'bg-red-900/60 text-red-300 border-red-500/50',
    glow: 'shadow-[0_0_15px_rgba(239,68,68,0.1)]',
  },
  critical: {
    bg: 'bg-red-950/30',
    border: 'border-red-500/40',
    text: 'text-red-400',
    badge: 'bg-red-900/60 text-red-300 border-red-500/50',
    glow: 'shadow-[0_0_15px_rgba(239,68,68,0.1)]',
  },
  HIGH: {
    bg: 'bg-orange-950/25',
    border: 'border-orange-500/35',
    text: 'text-orange-400',
    badge: 'bg-orange-900/60 text-orange-300 border-orange-500/50',
    glow: 'shadow-[0_0_15px_rgba(249,115,22,0.08)]',
  },
  high: {
    bg: 'bg-orange-950/25',
    border: 'border-orange-500/35',
    text: 'text-orange-400',
    badge: 'bg-orange-900/60 text-orange-300 border-orange-500/50',
    glow: 'shadow-[0_0_15px_rgba(249,115,22,0.08)]',
  },
  MEDIUM: {
    bg: 'bg-yellow-950/20',
    border: 'border-yellow-500/30',
    text: 'text-yellow-400',
    badge: 'bg-yellow-900/60 text-yellow-300 border-yellow-600/50',
    glow: '',
  },
  medium: {
    bg: 'bg-yellow-950/20',
    border: 'border-yellow-500/30',
    text: 'text-yellow-400',
    badge: 'bg-yellow-900/60 text-yellow-300 border-yellow-600/50',
    glow: '',
  },
}

const STATUS_STYLES: Record<string, string> = {
  new: 'bg-blue-900/40 text-blue-300 border border-blue-500/30',
  dismissed: 'bg-gray-800/40 text-gray-400 border border-gray-600/30',
  resolved: 'bg-emerald-900/40 text-emerald-300 border border-emerald-500/30',
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function getAlertType(alert: any): string {
  return alert.alert_type || alert.type || 'unknown'
}

function getEvidence(alert: any): Record<string, any> {
  return alert.evidence || alert.metadata || {}
}

function getDescription(alert: any): string {
  return alert.description || alert.detail || ''
}

function getCnpjs(alert: any): string[] {
  if (alert.cnpjs_envolvidos) return alert.cnpjs_envolvidos
  const cnpjs: string[] = []
  if (alert.cnpj_1) cnpjs.push(alert.cnpj_1)
  if (alert.cnpj_2) cnpjs.push(alert.cnpj_2)
  if (cnpjs.length > 0) return cnpjs
  return alert.companies?.map((c: any) => c.cnpj) || []
}

function getCompanies(alert: any): Array<{ name: string; cnpj: string }> {
  const companies: Array<{ name: string; cnpj: string }> = []
  if (alert.empresa_1 && alert.cnpj_1) companies.push({ name: alert.empresa_1, cnpj: alert.cnpj_1 })
  if (alert.empresa_2 && alert.cnpj_2) companies.push({ name: alert.empresa_2, cnpj: alert.cnpj_2 })
  if (companies.length > 0) return companies
  if (alert.companies) return alert.companies.map((c: any) => ({ name: c.name || c.razao_social, cnpj: c.cnpj }))
  return []
}

function formatCNPJ(cnpj: string): string {
  const d = cnpj?.replace(/\D/g, '') || ''
  if (d.length !== 14) return cnpj || ''
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

function formatCurrency(value: number | null | undefined): string {
  if (!value && value !== 0) return 'N/D'
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function timeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `ha ${diffMin}min`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `ha ${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `ha ${diffDays}d`
  return `ha ${Math.floor(diffDays / 30)} meses`
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/D'
  try {
    return new Date(dateStr).toLocaleDateString('pt-BR')
  } catch {
    return dateStr
  }
}

// ─── Intelligence Analysis per Fraud Type ──────────────────────────────────

function AnalysisSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{title}</h4>
      <div className="text-sm text-gray-300 leading-relaxed">{children}</div>
    </div>
  )
}

function RiskIndicator({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="text-gray-500 mt-0.5">{'\u25B8'}</span>
      <div>
        <span className="text-gray-400 text-xs">{label}:</span>{' '}
        <span className={`text-sm ${highlight ? 'text-red-400 font-medium' : 'text-gray-200'}`}>{value}</span>
      </div>
    </div>
  )
}

function LegalBadge({ refs }: { refs: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {refs.map((ref) => (
        <span key={ref} className="text-[10px] px-1.5 py-0.5 bg-gray-800/80 text-gray-400 rounded border border-gray-700/50 font-mono">
          {ref}
        </span>
      ))}
    </div>
  )
}

function renderSocioEmComumAnalysis(alert: any, sharedCount: number) {
  const meta = alert.metadata || alert.evidence || {}
  const socios = meta.socios || []
  const detail = alert.detail || alert.description || ''
  const empresa1 = alert.empresa_1 || ''
  const empresa2 = alert.empresa_2 || ''
  const cnpj1 = alert.cnpj_1 || ''
  const cnpj2 = alert.cnpj_2 || ''

  return (
    <>
      <AnalysisSection title="O que foi detectado">
        <p>
          As empresas <strong className="text-white">&quot;{empresa1}&quot;</strong>
          {cnpj1 && <span className="text-gray-400"> ({formatCNPJ(cnpj1)})</span>}
          {' '}e{' '}
          <strong className="text-white">&quot;{empresa2}&quot;</strong>
          {cnpj2 && <span className="text-gray-400"> ({formatCNPJ(cnpj2)})</span>}
          {' '}compartilham <strong className="text-orange-400">{socios.length || 'multiplos'} socio(s) em comum</strong> e
          participaram como concorrentes na mesma licitacao.
        </p>
        {detail && (
          <p className="mt-2 text-gray-400 text-xs italic">{detail}</p>
        )}
      </AnalysisSection>

      <AnalysisSection title="Por que isso representa possivel fraude">
        <p>
          Quando a mesma pessoa fisica controla multiplas empresas que disputam o mesmo certame, ha forte indicacao de{' '}
          <strong className="text-red-400">conluio e direcionamento</strong>. As propostas podem ter sido coordenadas para
          simular competicao &mdash; uma pratica conhecida como &quot;cartel em licitacao&quot; ou &quot;rodizio de propostas&quot;.
          O socio em comum pode definir previamente qual empresa vencera e calibrar os precos das demais acima do valor combinado,
          eliminando a competitividade real do certame e causando prejuizo ao erario.
        </p>
        <p className="mt-2 text-yellow-400/80 text-xs">
          Este e um dos padroes mais classicos e graves de fraude licitatoria, presente em mais de 60% dos casos investigados
          pelo TCU e Ministerio Publico.
        </p>
      </AnalysisSection>

      <AnalysisSection title="Indicadores de risco">
        {socios.length > 0 ? (
          socios.map((socio: string) => (
            <RiskIndicator key={socio} label="Socio em comum" value={socio} highlight />
          ))
        ) : (
          <RiskIndicator label="Socios em comum" value="Identificados (ver detalhe)" highlight />
        )}
        <RiskIndicator label="Empresa 1" value={`${empresa1}${cnpj1 ? ' (' + formatCNPJ(cnpj1) + ')' : ''}`} />
        <RiskIndicator label="Empresa 2" value={`${empresa2}${cnpj2 ? ' (' + formatCNPJ(cnpj2) + ')' : ''}`} />
        {sharedCount > 1 && (
          <RiskIndicator
            label="Coincidencia em outras licitacoes"
            value={`Estas empresas participaram juntas em ${sharedCount} licitacoes`}
            highlight
          />
        )}
      </AnalysisSection>

      <AnalysisSection title="Fundamentacao legal">
        <p className="text-xs text-gray-400 mb-1">
          A participacao coordenada entre empresas com socios em comum configura:
        </p>
        <LegalBadge refs={[
          'Art. 337-F CP (Fraude em licitacao)',
          'Art. 178 Lei 14.133/21',
          'Art. 90 Lei 8.666/93',
          'Sumula 254 TCU',
        ]} />
      </AnalysisSection>
    </>
  )
}

function renderEmpresaRecenteAnalysis(evidence: Record<string, any>) {
  const razaoSocial = evidence.razao_social || evidence.cnpj || 'N/I'
  const dataAbertura = evidence.data_abertura
  const dataLicitacao = evidence.data_licitacao
  const diasAntes = evidence.dias_antes

  return (
    <>
      <AnalysisSection title="O que foi detectado">
        <p>
          A empresa vencedora <strong className="text-white">&quot;{razaoSocial}&quot;</strong>
          {evidence.cnpj && <span className="text-gray-400"> ({formatCNPJ(evidence.cnpj)})</span>}{' '}
          foi constituida em <strong className="text-orange-400">{formatDate(dataAbertura)}</strong>,
          apenas <strong className="text-red-400">{diasAntes} dias</strong> antes da abertura da licitacao
          ({formatDate(dataLicitacao)}).
        </p>
      </AnalysisSection>

      <AnalysisSection title="Por que isso representa possivel fraude">
        <p>
          Empresas criadas pouco tempo antes de uma licitacao podem ter sido constituidas <strong className="text-red-400">
          especificamente para participar do certame</strong>, possivelmente como &quot;empresa de fachada&quot; ou
          &quot;laranja&quot;. Uma empresa legitima normalmente possui historico operacional, clientes anteriores e
          experiencia comprovavel no ramo de atuacao. A abertura recente levanta suspeita de que a empresa foi criada
          para dar aparencia de competicao ou para receber recursos de forma fraudulenta.
        </p>
        <p className="mt-2 text-yellow-400/80 text-xs">
          Empresas com menos de 6 meses de existencia que vencem licitacoes sao classificadas como indicador de risco
          em auditorias do TCU e CGU.
        </p>
      </AnalysisSection>

      <AnalysisSection title="Indicadores de risco">
        <RiskIndicator label="Empresa" value={razaoSocial} />
        {evidence.cnpj && <RiskIndicator label="CNPJ" value={formatCNPJ(evidence.cnpj)} />}
        <RiskIndicator label="Data de constituicao" value={formatDate(dataAbertura)} highlight />
        <RiskIndicator label="Data da licitacao" value={formatDate(dataLicitacao)} />
        <RiskIndicator label="Tempo de existencia na abertura" value={`${diasAntes} dias`} highlight />
        <RiskIndicator label="Limiar de risco" value="< 180 dias (6 meses)" />
      </AnalysisSection>

      <AnalysisSection title="Fundamentacao legal">
        <p className="text-xs text-gray-400 mb-1">
          A ausencia de capacidade tecnica e operacional pode configurar:
        </p>
        <LegalBadge refs={[
          'Art. 37 CF (Principio da eficiencia)',
          'Art. 66-67 Lei 14.133/21 (Qualificacao tecnica)',
          'Acordao 1793/2011 TCU',
        ]} />
      </AnalysisSection>
    </>
  )
}

function renderCapitalIncompativelAnalysis(evidence: Record<string, any>) {
  const razaoSocial = evidence.razao_social || evidence.cnpj || 'N/I'
  const capitalSocial = Number(evidence.capital_social) || 0
  const valorContrato = Number(evidence.valor_contrato) || 0
  const percentual = Number(evidence.percentual) || 0

  return (
    <>
      <AnalysisSection title="O que foi detectado">
        <p>
          A empresa vencedora <strong className="text-white">&quot;{razaoSocial}&quot;</strong>
          {evidence.cnpj && <span className="text-gray-400"> ({formatCNPJ(evidence.cnpj)})</span>}{' '}
          possui capital social de <strong className="text-red-400">{formatCurrency(capitalSocial)}</strong>{' '}
          para executar contrato avaliado em <strong className="text-orange-400">{formatCurrency(valorContrato)}</strong>.
          O capital social representa apenas <strong className="text-red-400">{percentual}%</strong> do valor contratado.
        </p>
      </AnalysisSection>

      <AnalysisSection title="Por que isso representa possivel fraude">
        <p>
          Uma empresa com capital social desproporcional ao valor do contrato pode{' '}
          <strong className="text-red-400">nao possuir capacidade economico-financeira real</strong> para executar o servico.
          Isso pode indicar uma &quot;empresa de fachada&quot; &mdash; constituida apenas no papel, sem estrutura real,
          funcionarios ou equipamentos &mdash; criada para fraudar licitacoes e desviar recursos publicos.
          A desproporcao entre capital e contrato tambem sugere possivel inexequibilidade da proposta.
        </p>
        <p className="mt-2 text-yellow-400/80 text-xs">
          O TCU considera risco elevado quando o capital social e inferior a 10% do valor contratado.
          Neste caso, o capital representa apenas {percentual}% do contrato.
        </p>
      </AnalysisSection>

      <AnalysisSection title="Indicadores de risco">
        <RiskIndicator label="Empresa" value={razaoSocial} />
        {evidence.cnpj && <RiskIndicator label="CNPJ" value={formatCNPJ(evidence.cnpj)} />}
        <RiskIndicator label="Capital social" value={formatCurrency(capitalSocial)} highlight />
        <RiskIndicator label="Valor do contrato" value={formatCurrency(valorContrato)} />
        <RiskIndicator label="Proporcao capital/contrato" value={`${percentual}%`} highlight />
        <RiskIndicator label="Limiar de risco" value="< 1% do valor contratado" />
      </AnalysisSection>

      <AnalysisSection title="Fundamentacao legal">
        <p className="text-xs text-gray-400 mb-1">
          A ausencia de capacidade economico-financeira pode configurar:
        </p>
        <LegalBadge refs={[
          'Art. 69 Lei 14.133/21 (Qualificacao economico-financeira)',
          'Art. 31 Lei 8.666/93',
          'Art. 337-F CP (Fraude em licitacao)',
          'Acordao 1214/2013 TCU',
        ]} />
      </AnalysisSection>
    </>
  )
}

function renderSancionadaAnalysis(alert: any) {
  const meta = alert.metadata || alert.evidence || {}
  const empresa = alert.empresa_1 || meta.razao_social || meta.cnpj || 'N/I'
  const cnpj = alert.cnpj_1 || meta.cnpj || ''
  const sancoes = meta.sancoes || []
  const detail = alert.detail || ''

  return (
    <>
      <AnalysisSection title="O que foi detectado">
        <p>
          A empresa <strong className="text-white">&quot;{empresa}&quot;</strong>
          {cnpj && <span className="text-gray-400"> ({formatCNPJ(cnpj)})</span>}{' '}
          possui <strong className="text-red-400">{sancoes.length > 0 ? sancoes.length : ''} sancao(oes)</strong> registrada(s)
          em bases oficiais de penalidades da administracao publica (CEIS/CNEP).
        </p>
        {detail && <p className="mt-2 text-gray-400 text-xs italic">{detail}</p>}
      </AnalysisSection>

      <AnalysisSection title="Por que isso e critico">
        <p>
          Empresas sancionadas estao <strong className="text-red-400">legalmente impedidas de contratar com a administracao publica</strong>{' '}
          durante a vigencia da penalidade. A participacao em licitacoes durante o periodo de sancao constitui
          irregularidade grave, podendo configurar crime de fraude licitatoria. Alem disso, a existencia de sancoes
          revela historico de descumprimento contratual, conduta impropria ou fraude anterior &mdash; representando
          risco elevado de reincidencia.
        </p>
      </AnalysisSection>

      {sancoes.length > 0 && (
        <AnalysisSection title="Detalhamento das sancoes">
          <div className="space-y-2">
            {sancoes.map((s: any, idx: number) => (
              <div key={idx} className="bg-red-950/30 border border-red-900/40 rounded-md p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-red-300 mb-1">
                      {s.tipo || 'Sancao nao especificada'}
                    </div>
                    {s.orgao && (
                      <div className="text-xs text-gray-400">
                        Orgao sancionador: <span className="text-gray-300">{s.orgao}</span>
                      </div>
                    )}
                    <div className="text-xs text-gray-400 mt-0.5">
                      Periodo: <span className="text-gray-300">{formatDate(s.inicio)}</span>
                      {s.fim && <> ate <span className="text-gray-300">{formatDate(s.fim)}</span></>}
                      {!s.fim && <span className="text-red-400 ml-1">(vigente)</span>}
                    </div>
                  </div>
                  <span className="text-xs px-2 py-0.5 bg-red-900/50 text-red-300 rounded-full border border-red-800/50 shrink-0">
                    Sancao {idx + 1}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </AnalysisSection>
      )}

      <AnalysisSection title="Indicadores de risco">
        <RiskIndicator label="Empresa" value={empresa} />
        {cnpj && <RiskIndicator label="CNPJ" value={formatCNPJ(cnpj)} />}
        <RiskIndicator label="Total de sancoes" value={sancoes.length > 0 ? `${sancoes.length}` : 'Registrada no CEIS/CNEP'} highlight />
        {sancoes.some((s: any) => !s.fim) && (
          <RiskIndicator label="Sancao vigente" value="Sim - empresa impedida de licitar" highlight />
        )}
      </AnalysisSection>

      <AnalysisSection title="Fundamentacao legal">
        <p className="text-xs text-gray-400 mb-1">
          A participacao de empresa sancionada em licitacao configura:
        </p>
        <LegalBadge refs={[
          'Art. 156 Lei 14.133/21 (Sancoes)',
          'Art. 87-88 Lei 8.666/93',
          'Art. 337-M CP',
          'Lei 12.846/13 (Anticorrupcao)',
          'CEIS/CNEP (Cadastros de impedidos)',
        ]} />
      </AnalysisSection>
    </>
  )
}

function renderEnderecoCompartilhadoAnalysis(evidence: Record<string, any>, sharedCount: number) {
  const endereco = evidence.endereco || 'N/I'
  const empresas = evidence.empresas || []
  const total = evidence.total_empresas || empresas.length

  return (
    <>
      <AnalysisSection title="O que foi detectado">
        <p>
          <strong className="text-orange-400">{total} empresas concorrentes</strong> na mesma licitacao estao registradas
          no mesmo endereco: <strong className="text-white">&quot;{endereco}&quot;</strong>.
        </p>
      </AnalysisSection>

      <AnalysisSection title="Por que isso representa possivel fraude">
        <p>
          Empresas supostamente independentes e concorrentes que operam no mesmo endereco fisico levantam
          forte suspeita de <strong className="text-red-400">pertencerem ao mesmo grupo economico</strong> ou
          serem controladas pelas mesmas pessoas. Esse padrao e classico em esquemas de &quot;conluio licitatorio&quot;
          onde varias empresas sao criadas no mesmo local para simular competicao. Na pratica, todas as propostas
          podem ser elaboradas pela mesma equipe, no mesmo escritorio, com precos previamente combinados.
        </p>
        <p className="mt-2 text-yellow-400/80 text-xs">
          O compartilhamento de endereco entre concorrentes e um dos principais indicadores utilizados pela CGU
          e pelo TCU em auditorias de integridade licitatoria.
        </p>
      </AnalysisSection>

      <AnalysisSection title="Indicadores de risco">
        <RiskIndicator label="Endereco compartilhado" value={endereco} highlight />
        <RiskIndicator label="Empresas no mesmo endereco" value={`${total} empresas`} highlight />
        {empresas.map((cnpj: string) => (
          <RiskIndicator key={cnpj} label="CNPJ no endereco" value={formatCNPJ(cnpj)} />
        ))}
        {sharedCount > 1 && (
          <RiskIndicator
            label="Coincidencia em outras licitacoes"
            value={`Estas empresas participaram juntas em ${sharedCount} licitacoes`}
            highlight
          />
        )}
      </AnalysisSection>

      <AnalysisSection title="Fundamentacao legal">
        <p className="text-xs text-gray-400 mb-1">
          O compartilhamento de infraestrutura entre concorrentes pode configurar:
        </p>
        <LegalBadge refs={[
          'Art. 337-F CP (Fraude em licitacao)',
          'Art. 178 Lei 14.133/21',
          'Art. 90 Lei 8.666/93',
          'IN SEGES/ME 73/2020',
        ]} />
      </AnalysisSection>
    </>
  )
}

function renderEntidadeRelacionadaAnalysis(alert: any) {
  const meta = alert.metadata || alert.evidence || {}
  const empresa1 = alert.empresa_1 || ''
  const empresa2 = alert.empresa_2 || ''
  const cnpj1 = alert.cnpj_1 || ''
  const cnpj2 = alert.cnpj_2 || ''
  const matchScore = meta.match_score || 0
  const matchedFields = meta.matched_fields || []
  const sharedSocios = meta.shared_socios || []
  const fuzzyScore = meta.fuzzy_score || 0
  const commonTenders = meta.common_tenders || 0

  return (
    <>
      <AnalysisSection title="O que foi detectado">
        <p>
          As empresas <strong className="text-white">&quot;{empresa1}&quot;</strong>
          {cnpj1 && <span className="text-gray-400"> ({formatCNPJ(cnpj1)})</span>}
          {' '}e{' '}
          <strong className="text-white">&quot;{empresa2}&quot;</strong>
          {cnpj2 && <span className="text-gray-400"> ({formatCNPJ(cnpj2)})</span>}
          {' '}apresentam <strong className="text-orange-400">{matchScore.toFixed(0)}% de similaridade</strong> e
          participam juntas em <strong className="text-red-400">{commonTenders} licitacao(oes)</strong>.
        </p>
        {alert.detail && (
          <p className="mt-2 text-gray-400 text-xs italic">{alert.detail}</p>
        )}
      </AnalysisSection>

      <AnalysisSection title="Por que isso e suspeito">
        <p>
          Empresas com alta similaridade em razao social e/ou quadro societario que competem entre si
          podem ser entidades controladas pelo mesmo grupo economico, configurando <strong className="text-red-400">
          simulacao de competicao</strong> para manipular resultados de licitacoes.
        </p>
      </AnalysisSection>

      <AnalysisSection title="Indicadores de risco">
        {fuzzyScore > 0 && (
          <RiskIndicator label="Similaridade de nome" value={`${(fuzzyScore * 100).toFixed(0)}%`} highlight />
        )}
        {sharedSocios.length > 0 && (
          <>
            <RiskIndicator label="Socios compartilhados" value={`${sharedSocios.length} socio(s)`} highlight />
            {sharedSocios.slice(0, 5).map((s: any) => (
              <RiskIndicator key={s.cpf || s.nome} label="Socio em comum" value={s.nome || s.cpf} />
            ))}
          </>
        )}
        <RiskIndicator label="Campos com match" value={matchedFields.join(', ') || 'N/A'} />
        <RiskIndicator label="Licitacoes em comum" value={`${commonTenders}`} highlight={commonTenders > 1} />
        <RiskIndicator label="Empresa 1" value={`${empresa1}${cnpj1 ? ' (' + formatCNPJ(cnpj1) + ')' : ''}`} />
        <RiskIndicator label="Empresa 2" value={`${empresa2}${cnpj2 ? ' (' + formatCNPJ(cnpj2) + ')' : ''}`} />
      </AnalysisSection>

      <AnalysisSection title="Fundamentacao legal">
        <p className="text-xs text-gray-400 mb-1">
          A participacao de entidades relacionadas como concorrentes independentes configura:
        </p>
        <LegalBadge refs={[
          'Art. 337-F CP (Fraude em licitacao)',
          'Art. 178 Lei 14.133/21',
          'Art. 90 Lei 8.666/93',
          'Sumula 254 TCU',
        ]} />
      </AnalysisSection>
    </>
  )
}

function renderAnalysis(alert: any, sharedCount: number) {
  const alertType = getAlertType(alert).toLowerCase()
  const evidence = getEvidence(alert)

  switch (alertType) {
    case 'socio_em_comum':
      return renderSocioEmComumAnalysis(alert, sharedCount)
    case 'entidade_relacionada':
      return renderEntidadeRelacionadaAnalysis(alert)
    case 'empresa_recente':
      return renderEmpresaRecenteAnalysis(evidence)
    case 'capital_incompativel':
      return renderCapitalIncompativelAnalysis(evidence)
    case 'sancionada':
    case 'empresa_sancionada':
      return renderSancionadaAnalysis(alert)
    case 'mesmo_endereco':
    case 'endereco_compartilhado':
      return renderEnderecoCompartilhadoAnalysis(evidence, sharedCount)
    default:
      return (
        <AnalysisSection title="Detalhes">
          <p>{getDescription(alert) || 'Sem detalhes disponiveis.'}</p>
          {Object.keys(evidence).length > 0 && (
            <pre className="mt-2 text-xs text-gray-400 bg-[#111315] rounded p-3 overflow-x-auto max-h-48 border border-[#2d2f33]">
              {JSON.stringify(evidence, null, 2)}
            </pre>
          )}
        </AnalysisSection>
      )
  }
}

// ─── Main Page ─────────────────────────────────────────────────────────────
export default async function AdminIntelligencePage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string
    severity?: string
    type?: string
    search?: string
  }>
}) {
  await requirePlatformAdmin()
  const params = await searchParams

  const page = Math.max(1, parseInt(params.page || '1'))
  const severityFilter = params.severity || ''
  const typeFilter = params.type || ''
  const searchFilter = params.search || ''
  const offset = (page - 1) * PAGE_SIZE

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // ── Stats ──
  const [totalResult, criticalResult, highResult, mediumResult, analyzedResult] = await Promise.all([
    supabase.from('fraud_alerts').select('id', { count: 'exact', head: true }),
    supabase.from('fraud_alerts').select('id', { count: 'exact', head: true }).or('severity.eq.CRITICAL,severity.eq.critical'),
    supabase.from('fraud_alerts').select('id', { count: 'exact', head: true }).or('severity.eq.HIGH,severity.eq.high'),
    supabase.from('fraud_alerts').select('id', { count: 'exact', head: true }).or('severity.eq.MEDIUM,severity.eq.medium'),
    supabase.from('tenders').select('id', { count: 'exact', head: true }).eq('fraud_analyzed', true),
  ])

  const totalCount = totalResult.count || 0
  const criticalCount = criticalResult.count || 0
  const highCount = highResult.count || 0
  const mediumCount = mediumResult.count || 0
  const analyzedCount = analyzedResult.count || 0

  // ── Filtered Query ──
  let query = supabase
    .from('fraud_alerts')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (severityFilter) {
    query = query.or(`severity.eq.${severityFilter},severity.eq.${severityFilter.toLowerCase()}`)
  }
  if (typeFilter) {
    query = query.or(`alert_type.eq.${typeFilter},alert_type.eq.${typeFilter.toLowerCase()},type.eq.${typeFilter},type.eq.${typeFilter.toLowerCase()}`)
  }
  if (searchFilter) {
    query = query.or(`description.ilike.%${searchFilter}%,detail.ilike.%${searchFilter}%`)
  }

  const { data: alerts, count: filteredCount } = await query.range(offset, offset + PAGE_SIZE - 1)

  const totalPages = Math.ceil((filteredCount || 0) / PAGE_SIZE)

  // ── Batch-fetch tender context for alerts ──
  const tenderIds = [...new Set((alerts || []).map((a: any) => a.tender_id).filter(Boolean))]
  const tenderMap = new Map<string, any>()

  if (tenderIds.length > 0) {
    const { data: tenders } = await supabase
      .from('tenders')
      .select('id, objeto, orgao_nome, uf, valor_estimado, valor_total, data_abertura, data_publicacao')
      .in('id', tenderIds.slice(0, 100))

    if (tenders) {
      for (const t of tenders) {
        tenderMap.set(t.id, t)
      }
    }
  }

  // ── Cross-reference: shared tender participation ──
  // Collect unique CNPJ pairs from multi-company alerts
  const cnpjPairs: Array<{ cnpjs: string[]; alertId: string }> = []
  const allCnpjsSet = new Set<string>()

  for (const alert of alerts || []) {
    const cnpjs = getCnpjs(alert)
    if (cnpjs.length >= 2) {
      cnpjPairs.push({ cnpjs, alertId: alert.id })
      cnpjs.forEach((c: string) => allCnpjsSet.add(c))
    }
  }

  // Batch query: for all unique CNPJs involved in multi-company alerts, get their tender participation
  const sharedTenderMap = new Map<string, number>() // alertId -> shared tender count
  const allCnpjs = Array.from(allCnpjsSet).slice(0, 50) // limit for performance

  if (allCnpjs.length > 0) {
    const { data: competitorEntries } = await supabase
      .from('competitors')
      .select('cnpj, tender_id')
      .in('cnpj', allCnpjs)
      .limit(5000)

    if (competitorEntries) {
      // Build cnpj -> Set<tender_id>
      const cnpjTenders = new Map<string, Set<string>>()
      for (const entry of competitorEntries) {
        const normCnpj = entry.cnpj?.replace(/\D/g, '') || entry.cnpj
        if (!cnpjTenders.has(normCnpj)) cnpjTenders.set(normCnpj, new Set())
        cnpjTenders.get(normCnpj)!.add(entry.tender_id)
      }

      // Compute intersection for each pair
      for (const { cnpjs, alertId } of cnpjPairs) {
        const normalized = cnpjs.map(c => c?.replace(/\D/g, '') || c)
        const sets = normalized.map(c => cnpjTenders.get(c))
        if (sets.every(Boolean)) {
          const validSets = sets as Set<string>[]
          const intersection = [...validSets[0]].filter(tid =>
            validSets.every(s => s.has(tid)),
          )
          sharedTenderMap.set(alertId, intersection.length)
        }
      }
    }
  }

  // ── URL builder ──
  function buildUrl(overrides: Record<string, string>) {
    const base: Record<string, string> = {
      severity: severityFilter,
      type: typeFilter,
      search: searchFilter,
      page: String(page),
    }
    const merged = { ...base, ...overrides }
    const parts = Object.entries(merged)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    return `/admin/intelligence${parts.length ? '?' + parts.join('&') : ''}`
  }

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <h1 className="text-xl sm:text-2xl font-bold">Central de Inteligencia</h1>
        </div>
        <p className="text-sm text-gray-400">
          Analise automatizada de padroes de fraude e conluio em licitacoes.
          Cruzamento de dados com base na Receita Federal ({'>'}67M registros), CEIS/CNEP e historico de participacoes.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        <StatsCard title="Total Alertas" value={totalCount.toLocaleString('pt-BR')} description="Padroes detectados" />
        <StatsCard title="Criticos" value={criticalCount.toLocaleString('pt-BR')} description="Sancoes ativas" />
        <StatsCard title="Alto Risco" value={highCount.toLocaleString('pt-BR')} description="Socios e enderecos" />
        <StatsCard title="Medio Risco" value={mediumCount.toLocaleString('pt-BR')} description="Capital e idade" />
        <StatsCard title="Analisadas" value={analyzedCount.toLocaleString('pt-BR')} description="Licitacoes escaneadas" />
      </div>

      {/* Filters */}
      <form className="mb-8 p-4 bg-[#111315] rounded-lg border border-[#2d2f33]">
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            name="severity"
            defaultValue={severityFilter}
            className="px-3 py-2 bg-[#1a1c1f] border border-[#2d2f33] rounded-md text-sm text-white"
          >
            <option value="">Todas severidades</option>
            <option value="CRITICAL">Critico</option>
            <option value="HIGH">Alto</option>
            <option value="MEDIUM">Medio</option>
          </select>

          <select
            name="type"
            defaultValue={typeFilter}
            className="px-3 py-2 bg-[#1a1c1f] border border-[#2d2f33] rounded-md text-sm text-white"
          >
            <option value="">Todos os tipos</option>
            <option value="socio_em_comum">Socio em Comum</option>
            <option value="empresa_recente">Empresa Recente</option>
            <option value="capital_incompativel">Capital Incompativel</option>
            <option value="sancionada">Empresa Sancionada</option>
            <option value="mesmo_endereco">Endereco Compartilhado</option>
            <option value="entidade_relacionada">Entidade Relacionada</option>
          </select>

          <input
            name="search"
            type="text"
            placeholder="Buscar por CNPJ, empresa ou descricao..."
            defaultValue={searchFilter}
            className="px-3 py-2 bg-[#1a1c1f] border border-[#2d2f33] rounded-md text-sm text-white placeholder-gray-500 flex-1 min-w-0"
          />

          <button
            type="submit"
            className="px-5 py-2 bg-brand text-white rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Filtrar
          </button>
        </div>
      </form>

      {/* Alert Feed */}
      <div className="space-y-6">
        {alerts && alerts.length > 0 ? (
          alerts.map((alert: any) => {
            const alertType = getAlertType(alert)
            const config = TYPE_CONFIG[alertType] || TYPE_CONFIG[alertType.toUpperCase()] || { label: alertType, icon: '\u{1F514}', defaultSeverity: 'MEDIUM' }
            const severity = (alert.severity || config.defaultSeverity).toUpperCase()
            const styles = SEVERITY_STYLES[severity] || SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.MEDIUM
            const sharedCount = sharedTenderMap.get(alert.id) || 0
            const tender = tenderMap.get(alert.tender_id)

            return (
              <div
                key={alert.id}
                className={`${styles.bg} border ${styles.border} rounded-xl overflow-hidden ${styles.glow}`}
              >
                {/* Card Header */}
                <div className="px-5 py-3 border-b border-white/5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-md border ${styles.badge} uppercase tracking-wider`}>
                      {severity}
                    </span>
                    <span className="text-sm text-gray-200 font-medium">
                      {config.icon} {config.label}
                    </span>
                    <span className="text-xs text-gray-500">
                      {timeAgo(alert.created_at)}
                    </span>
                    {alert.status && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_STYLES[alert.status] || STATUS_STYLES.new}`}>
                        {alert.status}
                      </span>
                    )}
                  </div>
                  {alert.tender_id && (
                    <Link
                      href={`/opportunities/tender/${alert.tender_id}`}
                      className="text-xs text-brand hover:underline whitespace-nowrap shrink-0 font-medium"
                    >
                      Ver licitacao {'\u2192'}
                    </Link>
                  )}
                </div>

                {/* Tender Context */}
                {tender && (
                  <div className="px-5 py-3 bg-black/20 border-b border-white/5">
                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Licitacao</div>
                    <p className="text-sm text-gray-200 line-clamp-2">{tender.objeto || 'Objeto nao informado'}</p>
                    <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-400">
                      {tender.orgao_nome && <span>{tender.orgao_nome}</span>}
                      {tender.uf && (
                        <span className="px-1.5 py-0.5 bg-gray-800/50 rounded text-gray-300">{tender.uf}</span>
                      )}
                      {(tender.valor_total || tender.valor_estimado) && (
                        <span>{formatCurrency(tender.valor_total || tender.valor_estimado)}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Companies Involved */}
                {(() => {
                  const companies = getCompanies(alert)
                  if (companies.length === 0) return null

                  return (
                    <div className="px-5 py-3 border-b border-white/5">
                      <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Empresas envolvidas</div>
                      <div className="flex flex-wrap gap-2">
                        {companies.map((company, idx) => (
                          <div key={idx} className="bg-[#1a1c1f] border border-[#2d2f33] rounded-lg px-3 py-2">
                            <div className="text-sm text-gray-200 font-medium">{company.name}</div>
                            {company.cnpj && <div className="text-xs text-gray-400 font-mono">{formatCNPJ(company.cnpj)}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                {/* Intelligence Analysis */}
                <div className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1 h-4 bg-brand rounded-full" />
                    <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Analise de Inteligencia</div>
                  </div>
                  {renderAnalysis(alert, sharedCount)}
                </div>

                {/* Cross-reference footer */}
                {sharedCount > 1 && (
                  <div className="px-5 py-3 bg-orange-950/20 border-t border-orange-500/20">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-orange-400">{'\u26A0'}</span>
                      <span className="text-orange-300 font-medium">
                        Cruzamento de dados: estas empresas coincidem em {sharedCount} licitacoes juntas
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        ) : (
          <div className="bg-[#1a1c1f] rounded-xl border border-[#2d2f33] p-12 text-center">
            <div className="text-3xl mb-3">{'\u{1F50D}'}</div>
            <p className="text-gray-400">Nenhum alerta encontrado com os filtros selecionados.</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center mt-8 pb-4">
        <p className="text-sm text-gray-400">
          {(filteredCount || 0).toLocaleString('pt-BR')} alertas {'\u00B7'} Pagina {page} de {totalPages || 1}
        </p>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={buildUrl({ page: String(page - 1) })}
              className="px-4 py-2 border border-[#2d2f33] rounded-lg text-sm hover:bg-[#2d2f33] transition-colors"
            >
              {'\u2190'} Anterior
            </Link>
          )}
          {page < totalPages && (
            <Link
              href={buildUrl({ page: String(page + 1) })}
              className="px-4 py-2 border border-[#2d2f33] rounded-lg text-sm hover:bg-[#2d2f33] transition-colors"
            >
              Proxima {'\u2192'}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
