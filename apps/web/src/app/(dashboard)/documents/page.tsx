import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AddDocumentForm } from './add-document-form'
import { DocumentRow } from './document-actions'
import { ConsultaCertidoes } from './consulta-certidoes'
import { isInfoSimplesConfigured } from '@/lib/certidoes'

const DOCUMENT_TYPES: Record<string, string> = {
  cnd_federal: 'CND Federal (Receita/PGFN)',
  cnd_estadual: 'CND Estadual',
  cnd_municipal: 'CND Municipal',
  fgts: 'Certidão FGTS',
  trabalhista: 'Certidão Negativa Trabalhista (CNDT)',
  tcu: 'TCU - Licitante Inidôneo',
  sicaf: 'SICAF',
  atestado_capacidade: 'Atestado de Capacidade Técnica',
  balanco: 'Balanço Patrimonial',
  contrato_social: 'Contrato Social / Estatuto',
  iso_9001: 'ISO 9001',
  alvara: 'Alvará de Funcionamento',
  crea_cau: 'CREA / CAU',
  outro: 'Outro',
}

export default async function DocumentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Certidões e Documentos</h1>
        <Card>
          <CardContent className="py-8 text-center text-gray-400">
            <p>Configure sua empresa primeiro para gerenciar documentos.</p>
            <a href="/company" className="text-brand underline mt-2 inline-block">Configurar Empresa</a>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Fetch company data for CNPJ and documents in parallel
  const [companyResult, docsResult] = await Promise.all([
    supabase
      .from('companies')
      .select('cnpj, uf, municipio, razao_social')
      .eq('id', profile.company_id)
      .single(),
    supabase
      .from('company_documents')
      .select('*')
      .eq('company_id', profile.company_id)
      .order('validade', { ascending: true }),
  ])

  const company = companyResult.data
  const documents = docsResult.data

  const today = new Date()
  const enriched = (documents || []).map((doc) => {
    let computedStatus = 'valido'
    if (doc.validade) {
      const valDate = new Date(doc.validade)
      const diffDays = Math.ceil((valDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      if (diffDays < 0) computedStatus = 'vencido'
      else if (diffDays <= 30) computedStatus = 'vencendo'
    }
    return { ...doc, computedStatus }
  })

  const validCount = enriched.filter((d) => d.computedStatus === 'valido').length
  const expiringCount = enriched.filter((d) => d.computedStatus === 'vencendo').length
  const expiredCount = enriched.filter((d) => d.computedStatus === 'vencido').length

  // Check for auto-fetched certidões
  const autoCount = enriched.filter((d) => d.descricao?.startsWith('[Auto]')).length
  const hasApiKey = isInfoSimplesConfigured()

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Certidões e Documentos</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-emerald-600">{validCount}</p>
            <p className="text-sm text-gray-400">Válidos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-amber-600">{expiringCount}</p>
            <p className="text-sm text-gray-400">Vencendo em 30 dias</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-red-600">{expiredCount}</p>
            <p className="text-sm text-gray-400">Vencidos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-blue-600">{autoCount}</p>
            <p className="text-sm text-gray-400">Consultados via API</p>
          </CardContent>
        </Card>
      </div>

      {/* Auto-fetch certidões */}
      {company?.cnpj && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <svg className="h-5 w-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Habilitação Automática
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ConsultaCertidoes cnpj={company.cnpj} hasApiKey={hasApiKey} />
          </CardContent>
        </Card>
      )}

      {/* Manual add document */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Adicionar Documento Manual</CardTitle>
        </CardHeader>
        <CardContent>
          <AddDocumentForm companyId={profile.company_id} documentTypes={DOCUMENT_TYPES} />
        </CardContent>
      </Card>

      {/* Documents table */}
      <Card>
        <CardHeader>
          <CardTitle>Seus Documentos ({enriched.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {enriched.length === 0 ? (
            <p className="text-center text-gray-400 py-6">
              Nenhum documento cadastrado. Use a consulta automática ou adicione manualmente.
            </p>
          ) : (
            <div className="relative w-full overflow-auto">
              <table className="w-full caption-bottom text-sm">
                <thead className="[&_tr]:border-b">
                  <tr className="border-b transition-colors hover:bg-muted/50">
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Tipo</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground hidden sm:table-cell">Descrição</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground hidden md:table-cell">Número</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Validade</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Status</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Origem</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {enriched.map((doc) => {
                    const daysLeft = doc.validade
                      ? Math.ceil((new Date(doc.validade).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                      : null

                    const isAuto = doc.descricao?.startsWith('[Auto]')

                    return (
                      <DocumentRow
                        key={doc.id}
                        doc={doc}
                        documentTypes={DOCUMENT_TYPES}
                        daysLeft={daysLeft}
                        statusBadge={<StatusBadge status={doc.computedStatus} />}
                        originBadge={
                          isAuto ? (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 text-xs">API</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-gray-50 text-gray-500 text-xs">Manual</Badge>
                          )
                        }
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string }> = {
    valido: { label: 'Válido', color: 'bg-emerald-100 text-emerald-800' },
    vencendo: { label: 'Vencendo', color: 'bg-amber-100 text-amber-800' },
    vencido: { label: 'Vencido', color: 'bg-red-100 text-red-800' },
  }
  const { label, color } = config[status] || { label: status, color: 'bg-gray-150' }
  return (
    <Badge variant="outline" className={`${color} text-xs`}>{label}</Badge>
  )
}
