import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@licitagram/shared'
import { EditalChat } from '../../[id]/chat'
import { getAuthAndProfile, getTenderDetail } from '@/lib/cache'
import { getUserWithPlan, hasFeature } from '@/lib/auth-helpers'

export default async function TenderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Single auth check (replaces redundant auth + profile queries)
  const [auth, user] = await Promise.all([
    getAuthAndProfile(),
    getUserWithPlan(),
  ])
  if (!auth) redirect('/login')

  const hasChatIa = user ? hasFeature(user, 'chat_ia') : false

  // Cached tender + docs fetch (parallel, 30 min TTL)
  const { tender, documents: docs } = await getTenderDetail(id)

  if (!tender) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">Licitação não encontrada</p>
        <Link href="/opportunities" className="text-blue-400 underline mt-2 inline-block">
          Voltar
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <Link
          href="/opportunities"
          className="text-sm text-gray-400 hover:text-gray-300"
        >
          &larr; Voltar
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold">Detalhes da Licitação</h1>
      </div>

      {/* Main info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3 flex-wrap">
            <CardTitle className="text-lg">
              {tender.objeto}
            </CardTitle>
            <Badge variant="outline">{tender.status}</Badge>
            <Badge variant="outline" className={
              tender.source === 'comprasgov' ? 'bg-blue-900/20 text-blue-400 border-blue-900/30' :
              tender.source === 'bec_sp' ? 'bg-amber-900/20 text-amber-400 border-amber-900/30' :
              'bg-green-900/20 text-green-400 border-green-900/30'
            }>
              {tender.source === 'comprasgov' ? 'Compras.gov' : tender.source === 'bec_sp' ? 'BEC SP' : 'PNCP'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-400">Órgão</p>
              <p className="font-medium">{tender.orgao_nome}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">CNPJ</p>
              <p className="font-medium">{tender.orgao_cnpj || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Modalidade</p>
              <p className="font-medium">{tender.modalidade_nome}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">UF / Município</p>
              <p className="font-medium">{tender.uf || '-'} / {tender.municipio || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Valor Estimado</p>
              <p className="font-medium text-emerald-400">
                {tender.valor_estimado ? formatCurrency(tender.valor_estimado) : 'Não informado'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Valor Homologado</p>
              <p className="font-medium">
                {tender.valor_homologado ? formatCurrency(tender.valor_homologado) : '-'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Data Publicação</p>
              <p className="font-medium">
                {tender.data_publicacao ? formatDate(tender.data_publicacao) : '-'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Data Abertura</p>
              <p className="font-medium">
                {tender.data_abertura ? formatDate(tender.data_abertura) : '-'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Encerramento Propostas</p>
              {tender.data_encerramento ? (
                <p className="font-medium">{formatDate(tender.data_encerramento)}</p>
              ) : (
                <p className="font-medium text-amber-400 text-sm">⚠️ Verificar no edital</p>
              )}
            </div>
            <div>
              <p className="text-sm text-gray-400">Situação</p>
              <p className="font-medium">{tender.situacao_nome || '-'}</p>
            </div>
            {(tender.link_sistema_origem || tender.link_pncp) && (
              <div>
                <p className="text-sm text-gray-400">Link Original</p>
                <div className="flex flex-col gap-1">
                  {tender.link_sistema_origem && (
                    <a
                      href={tender.link_sistema_origem}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 underline text-sm"
                    >
                      Abrir no sistema de origem
                    </a>
                  )}
                  {tender.link_pncp && (
                    <a
                      href={tender.link_pncp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 underline text-sm"
                    >
                      Ver no PNCP
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* AI Summary */}
      {tender.resumo && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Resumo IA</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-300">{tender.resumo}</p>
          </CardContent>
        </Card>
      )}

      {/* Requirements */}
      {tender.requisitos && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Requisitos Extraídos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(tender.requisitos as { requisitos?: Array<{ categoria: string; descricao: string; obrigatorio: boolean }> })?.requisitos?.map(
                (req: { categoria: string; descricao: string; obrigatorio: boolean }, i: number) => (
                  <div key={i} className="flex gap-3 p-3 bg-[#2d2f33] rounded-md">
                    <Badge variant={req.obrigatorio ? 'default' : 'secondary'} className="h-fit text-xs">
                      {req.obrigatorio ? 'Obrigatório' : 'Desejável'}
                    </Badge>
                    <div>
                      <p className="text-xs text-gray-400 uppercase">{req.categoria}</p>
                      <p className="text-sm">{req.descricao}</p>
                    </div>
                  </div>
                ),
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Documents */}
      {docs && docs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Documentos ({docs.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {docs.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-3 bg-[#2d2f33] rounded-md">
                  <div>
                    <p className="text-sm font-medium">{doc.titulo}</p>
                    <p className="text-xs text-gray-400">{doc.tipo}</p>
                  </div>
                  {doc.url && (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 text-sm underline"
                    >
                      Download
                    </a>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chat com o Edital */}
      <EditalChat
        tenderId={id}
        documentCount={docs?.length || 0}
        documentUrls={(docs || []).filter((d: Record<string, unknown>) => d.url).map((d: Record<string, unknown>) => ({ id: d.id as string, titulo: (d.titulo as string) || null, tipo: (d.tipo as string) || null, url: d.url as string, text: (d.texto_extraido as string) || null }))}
        hasAccess={hasChatIa}
      />
    </div>
  )
}
