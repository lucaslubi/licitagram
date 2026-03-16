import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AddWatchlistForm } from './watchlist-form'
import { DeleteWatchlistButton } from './delete-watchlist-button'

export default async function CompetitorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()

  const tab = params.tab || 'watchlist'
  const searchQuery = params.q || ''

  // Get watchlist
  const { data: watchlist } = await supabase
    .from('competitor_watchlist')
    .select('*')
    .eq('company_id', profile?.company_id || '')
    .order('created_at', { ascending: false })

  // Get competitor stats for watchlist items
  const watchlistCnpjs = (watchlist || []).map((w) => w.competitor_cnpj)
  let watchlistStats: Record<string, {
    participacoes: number; vitorias: number; valorMedio: number
    porte?: string; cnae_nome?: string; uf?: string; municipio?: string
  }> = {}

  if (watchlistCnpjs.length > 0) {
    const { data: stats } = await supabase
      .from('competitors')
      .select('cnpj, situacao, valor_proposta, porte, cnae_nome, uf_fornecedor, municipio_fornecedor')
      .in('cnpj', watchlistCnpjs)

    if (stats) {
      for (const s of stats) {
        if (!watchlistStats[s.cnpj]) {
          watchlistStats[s.cnpj] = { participacoes: 0, vitorias: 0, valorMedio: 0 }
        }
        watchlistStats[s.cnpj].participacoes++
        const isWinner = s.situacao && typeof s.situacao === 'string' && s.situacao.toLowerCase().includes('homologad')
        if (isWinner) watchlistStats[s.cnpj].vitorias++
        // Capture enrichment data from the first record that has it
        if (s.porte && !watchlistStats[s.cnpj].porte) watchlistStats[s.cnpj].porte = s.porte
        if (s.cnae_nome && !watchlistStats[s.cnpj].cnae_nome) watchlistStats[s.cnpj].cnae_nome = s.cnae_nome
        if (s.uf_fornecedor && !watchlistStats[s.cnpj].uf) watchlistStats[s.cnpj].uf = s.uf_fornecedor
        if (s.municipio_fornecedor && !watchlistStats[s.cnpj].municipio) watchlistStats[s.cnpj].municipio = s.municipio_fornecedor
      }
    }
  }

  // Search results
  let searchResults: Array<{
    cnpj: string; nome: string; participacoes: number; vitorias: number
    porte?: string; cnae_nome?: string; uf?: string; municipio?: string
  }> = []

  if (searchQuery && tab === 'buscar') {
    const cleanQuery = searchQuery.replace(/\D/g, '')
    const isNumeric = cleanQuery.length >= 3

    const { data: competitors } = await supabase
      .from('competitors')
      .select('cnpj, nome, situacao, porte, cnae_nome, uf_fornecedor, municipio_fornecedor')
      .or(
        isNumeric
          ? `cnpj.ilike.%${cleanQuery}%,nome.ilike.%${searchQuery}%`
          : `nome.ilike.%${searchQuery}%`,
      )
      .limit(200)

    if (competitors) {
      const grouped: Record<string, {
        nome: string; participacoes: number; vitorias: number
        porte?: string; cnae_nome?: string; uf?: string; municipio?: string
      }> = {}
      for (const c of competitors) {
        if (!grouped[c.cnpj]) {
          grouped[c.cnpj] = { nome: c.nome, participacoes: 0, vitorias: 0 }
        }
        grouped[c.cnpj].participacoes++
        const isWinner = c.situacao && typeof c.situacao === 'string' && c.situacao.toLowerCase().includes('homologad')
        if (isWinner) grouped[c.cnpj].vitorias++
        if (c.porte && !grouped[c.cnpj].porte) grouped[c.cnpj].porte = c.porte
        if (c.cnae_nome && !grouped[c.cnpj].cnae_nome) grouped[c.cnpj].cnae_nome = c.cnae_nome
        if (c.uf_fornecedor && !grouped[c.cnpj].uf) grouped[c.cnpj].uf = c.uf_fornecedor
        if (c.municipio_fornecedor && !grouped[c.cnpj].municipio) grouped[c.cnpj].municipio = c.municipio_fornecedor
      }
      searchResults = Object.entries(grouped).map(([cnpj, data]) => ({ cnpj, ...data }))
        .sort((a, b) => b.participacoes - a.participacoes)
        .slice(0, 20)
    }
  }

  // Top competitors from the same tenders
  let topCompetitors: Array<{
    cnpj: string; nome: string; count: number; wins: number
    porte?: string; cnae_nome?: string; uf?: string; municipio?: string
  }> = []
  if (profile?.company_id && tab === 'ranking') {
    // Get tenders the user has matched with (only open, competitive ones)
    const today = new Date().toISOString().split('T')[0]
    const { data: matchedTenders } = await supabase
      .from('matches')
      .select('tender_id, tenders!inner(data_encerramento, modalidade_id)')
      .eq('company_id', profile.company_id)
      .not('tenders.modalidade_id', 'in', '(9,14)')
      .or(`data_encerramento.is.null,data_encerramento.gte.${today}`, { referencedTable: 'tenders' })
      .limit(100)

    if (matchedTenders && matchedTenders.length > 0) {
      const tenderIds = matchedTenders.map((m) => m.tender_id)
      const { data: competitors } = await supabase
        .from('competitors')
        .select('cnpj, nome, situacao, porte, cnae_nome, uf_fornecedor, municipio_fornecedor')
        .in('tender_id', tenderIds)

      if (competitors) {
        const grouped: Record<string, {
          nome: string; count: number; wins: number
          porte?: string; cnae_nome?: string; uf?: string; municipio?: string
        }> = {}
        for (const c of competitors) {
          if (!grouped[c.cnpj]) grouped[c.cnpj] = { nome: c.nome, count: 0, wins: 0 }
          grouped[c.cnpj].count++
          const isWinner = c.situacao && typeof c.situacao === 'string' && c.situacao.toLowerCase().includes('homologad')
          if (isWinner) grouped[c.cnpj].wins++
          if (c.porte && !grouped[c.cnpj].porte) grouped[c.cnpj].porte = c.porte
          if (c.cnae_nome && !grouped[c.cnpj].cnae_nome) grouped[c.cnpj].cnae_nome = c.cnae_nome
          if (c.uf_fornecedor && !grouped[c.cnpj].uf) grouped[c.cnpj].uf = c.uf_fornecedor
          if (c.municipio_fornecedor && !grouped[c.cnpj].municipio) grouped[c.cnpj].municipio = c.municipio_fornecedor
        }
        topCompetitors = Object.entries(grouped)
          .map(([cnpj, data]) => ({ cnpj, ...data }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 15)
      }
    }
  }

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold mb-6">Inteligência Competitiva</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {[
          { key: 'watchlist', label: 'Watchlist' },
          { key: 'ranking', label: 'Ranking' },
          { key: 'buscar', label: 'Buscar' },
        ].map((t) => (
          <Link
            key={t.key}
            href={`/competitors?tab=${t.key}`}
            className={`px-3 sm:px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap ${
              tab === t.key ? 'bg-brand text-white' : 'bg-gray-150 text-gray-900 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === 'watchlist' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Adicionar Concorrente</CardTitle>
            </CardHeader>
            <CardContent>
              <AddWatchlistForm companyId={profile?.company_id || ''} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sua Watchlist ({watchlist?.length || 0})</CardTitle>
            </CardHeader>
            <CardContent>
              {(!watchlist || watchlist.length === 0) ? (
                <p className="text-center text-gray-400 py-6">Nenhum concorrente na watchlist. Adicione acima.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full caption-bottom text-sm">
                    <thead className="[&_tr]:border-b">
                      <tr className="border-b transition-colors hover:bg-muted/50">
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground hidden sm:table-cell">CNPJ</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Nome</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground hidden md:table-cell">Porte</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground hidden lg:table-cell">Local</th>
                        <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Part.</th>
                        <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Vit.</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground hidden lg:table-cell">Notas</th>
                        <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="[&_tr:last-child]:border-0">
                      {watchlist.map((w) => {
                        const stats = watchlistStats[w.competitor_cnpj] || { participacoes: 0, vitorias: 0 }
                        return (
                          <tr key={w.id} className="border-b transition-colors hover:bg-muted/50">
                            <td className="p-4 text-sm font-mono hidden sm:table-cell">{formatCnpj(w.competitor_cnpj)}</td>
                            <td className="p-4 text-sm font-medium">
                              {w.competitor_nome || '-'}
                              {stats.cnae_nome && (
                                <span className="block text-xs text-gray-400 mt-0.5">{stats.cnae_nome}</span>
                              )}
                            </td>
                            <td className="p-4 text-sm hidden md:table-cell">
                              {stats.porte ? (
                                <Badge variant="outline" className="text-xs">{stats.porte}</Badge>
                              ) : '-'}
                            </td>
                            <td className="p-4 text-sm text-gray-400 hidden lg:table-cell">
                              {stats.municipio && stats.uf
                                ? `${stats.municipio}/${stats.uf}`
                                : stats.uf || '-'}
                            </td>
                            <td className="p-4 text-center">{stats.participacoes}</td>
                            <td className="p-4 text-center">
                              <Badge variant={stats.vitorias > 0 ? 'default' : 'secondary'}>
                                {stats.vitorias}
                              </Badge>
                            </td>
                            <td className="p-4 text-sm text-gray-400 hidden lg:table-cell">{w.notes || '-'}</td>
                            <td className="p-4 text-center">
                              <DeleteWatchlistButton watchlistId={w.id} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'ranking' && (
        <Card>
          <CardHeader>
            <CardTitle>Concorrentes Mais Frequentes nas Suas Licitações</CardTitle>
          </CardHeader>
          <CardContent>
            {topCompetitors.length === 0 ? (
              <p className="text-center text-gray-400 py-6">
                Dados insuficientes. Os rankings serão exibidos quando houver dados de resultados de licitações.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full caption-bottom text-sm">
                  <thead className="[&_tr]:border-b">
                    <tr className="border-b transition-colors hover:bg-muted/50">
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-8">#</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground hidden sm:table-cell">CNPJ</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Nome</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground hidden md:table-cell">Porte</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground hidden md:table-cell">UF</th>
                      <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Part.</th>
                      <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Vit.</th>
                      <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Taxa</th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {topCompetitors.map((c, i) => (
                      <tr key={c.cnpj} className="border-b transition-colors hover:bg-muted/50">
                        <td className="p-4 font-bold">{i + 1}</td>
                        <td className="p-4 text-sm font-mono hidden sm:table-cell">{formatCnpj(c.cnpj)}</td>
                        <td className="p-4 text-sm font-medium">
                          {c.nome || '-'}
                          {c.cnae_nome && (
                            <span className="block text-xs text-gray-400 mt-0.5">{c.cnae_nome}</span>
                          )}
                        </td>
                        <td className="p-4 text-sm hidden md:table-cell">
                          {c.porte ? (
                            <Badge variant="outline" className="text-xs">{c.porte}</Badge>
                          ) : '-'}
                        </td>
                        <td className="p-4 text-sm text-gray-400 hidden md:table-cell">{c.uf || '-'}</td>
                        <td className="p-4 text-center">{c.count}</td>
                        <td className="p-4 text-center">
                          <Badge variant={c.wins > 0 ? 'default' : 'secondary'}>{c.wins}</Badge>
                        </td>
                        <td className="p-4 text-center text-sm">
                          {c.count > 0 ? `${Math.round((c.wins / c.count) * 100)}%` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'buscar' && (
        <Card>
          <CardHeader>
            <CardTitle>Buscar Concorrente</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex gap-3 mb-6">
              <input type="hidden" name="tab" value="buscar" />
              <input
                name="q"
                type="text"
                defaultValue={searchQuery}
                placeholder="Buscar por CNPJ ou nome..."
                className="flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="h-10 px-4 bg-brand text-white rounded-md hover:bg-brand-dark text-sm"
              >
                Buscar
              </button>
            </form>

            {searchResults.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full caption-bottom text-sm">
                  <thead className="[&_tr]:border-b">
                    <tr className="border-b transition-colors hover:bg-muted/50">
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground hidden sm:table-cell">CNPJ</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Nome</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground hidden md:table-cell">Porte</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground hidden lg:table-cell">Local</th>
                      <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Part.</th>
                      <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Vit.</th>
                      <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Taxa</th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {searchResults.map((c) => (
                      <tr key={c.cnpj} className="border-b transition-colors hover:bg-muted/50">
                        <td className="p-4 text-sm font-mono hidden sm:table-cell">{formatCnpj(c.cnpj)}</td>
                        <td className="p-4 text-sm font-medium">
                          {c.nome || '-'}
                          {c.cnae_nome && (
                            <span className="block text-xs text-gray-400 mt-0.5">{c.cnae_nome}</span>
                          )}
                        </td>
                        <td className="p-4 text-sm hidden md:table-cell">
                          {c.porte ? (
                            <Badge variant="outline" className="text-xs">{c.porte}</Badge>
                          ) : '-'}
                        </td>
                        <td className="p-4 text-sm text-gray-400 hidden lg:table-cell">
                          {c.municipio && c.uf
                            ? `${c.municipio}/${c.uf}`
                            : c.uf || '-'}
                        </td>
                        <td className="p-4 text-center">{c.participacoes}</td>
                        <td className="p-4 text-center">
                          <Badge variant={c.vitorias > 0 ? 'default' : 'secondary'}>{c.vitorias}</Badge>
                        </td>
                        <td className="p-4 text-center text-sm">
                          {c.participacoes > 0 ? `${Math.round((c.vitorias / c.participacoes) * 100)}%` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : searchQuery ? (
              <p className="text-center text-gray-400 py-6">Nenhum resultado para &quot;{searchQuery}&quot;</p>
            ) : (
              <p className="text-center text-gray-400 py-6">Digite um CNPJ ou nome para buscar</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function formatCnpj(cnpj: string): string {
  if (cnpj.length !== 14) return cnpj
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}
