import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: 'Rascunho', className: 'bg-gray-500/10 text-gray-400 border-gray-700' },
  ready: { label: 'Pronta', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-800/30' },
  submitted: { label: 'Enviada', className: 'bg-blue-500/10 text-blue-400 border-blue-800/30' },
  archived: { label: 'Arquivada', className: 'bg-amber-500/10 text-amber-400 border-amber-800/30' },
}

const TEMPLATE_LABELS: Record<string, string> = {
  bens: 'Bens',
  servicos: 'Serviços',
  tic_saas: 'TIC/SaaS',
}

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status: filterStatus } = await searchParams
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
        <h1 className="text-2xl font-bold mb-6">Propostas Comerciais</h1>
        <div className="rounded-2xl border border-[#2d2f33] bg-[#1a1c1f] p-8 text-center">
          <p className="text-gray-400">Configure sua empresa primeiro para gerar propostas.</p>
          <a href="/company" className="text-[#F43E01] underline mt-2 inline-block">
            Configurar Empresa
          </a>
        </div>
      </div>
    )
  }

  let query = supabase
    .from('proposals')
    .select('*')
    .eq('company_id', profile.company_id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (filterStatus && filterStatus !== 'all') {
    query = query.eq('status', filterStatus)
  }

  const { data: proposals } = await query

  const activeFilter = filterStatus || 'all'

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-6">
        <h1 className="text-2xl font-bold flex-1">Propostas Comerciais</h1>
        <Link href="/proposals/generate/new">
          <Button className="bg-[#F43E01] hover:bg-[#d63600] text-white">
            Nova Proposta
          </Button>
        </Link>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          { key: 'all', label: 'Todas' },
          { key: 'draft', label: 'Rascunhos' },
          { key: 'ready', label: 'Prontas' },
          { key: 'submitted', label: 'Enviadas' },
          { key: 'archived', label: 'Arquivadas' },
        ].map(({ key, label }) => (
          <Link key={key} href={key === 'all' ? '/proposals' : `/proposals?status=${key}`}>
            <Button
              variant={activeFilter === key ? 'default' : 'ghost'}
              size="sm"
              className={activeFilter === key
                ? 'bg-[#F43E01] hover:bg-[#d63600] text-white'
                : 'text-gray-400 hover:text-white hover:bg-[#2d2f33]'
              }
            >
              {label}
            </Button>
          </Link>
        ))}
      </div>

      {!proposals || proposals.length === 0 ? (
        <Card className="border-[#2d2f33] bg-[#1a1c1f]">
          <CardContent className="p-8 text-center">
            <div className="text-gray-500 mb-2 text-4xl">📄</div>
            <p className="text-gray-400 mb-4">Nenhuma proposta criada ainda</p>
            <Link href="/proposals/generate/new">
              <Button className="bg-[#F43E01] hover:bg-[#d63600] text-white">
                Criar Primeira Proposta
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-[#2d2f33] bg-[#1a1c1f]">
          <CardHeader>
            <CardTitle className="text-base">{proposals.length} proposta{proposals.length !== 1 ? 's' : ''}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2d2f33]">
                    <th className="text-left p-4 text-gray-400 font-medium">Licitacao</th>
                    <th className="text-left p-4 text-gray-400 font-medium">Template</th>
                    <th className="text-left p-4 text-gray-400 font-medium">Valor Global</th>
                    <th className="text-left p-4 text-gray-400 font-medium">Status</th>
                    <th className="text-left p-4 text-gray-400 font-medium">Criada em</th>
                    <th className="text-left p-4 text-gray-400 font-medium">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {proposals.map((p: Record<string, unknown>) => {
                    const statusCfg = STATUS_CONFIG[(p.status as string) || 'draft'] || STATUS_CONFIG.draft
                    return (
                      <tr key={p.id as string} className="border-b border-[#2d2f33] hover:bg-[#23262a] transition-colors">
                        <td className="p-4">
                          <div className="text-white font-medium truncate max-w-[200px]">
                            {(p.licitacao_numero as string) || 'Sem numero'}
                          </div>
                          <div className="text-gray-500 text-xs truncate max-w-[200px]">
                            {(p.licitacao_orgao as string) || ''}
                          </div>
                        </td>
                        <td className="p-4">
                          <Badge variant="outline" className="text-xs border-[#2d2f33] text-gray-300">
                            {TEMPLATE_LABELS[(p.template_type as string) || ''] || (p.template_type as string)}
                          </Badge>
                        </td>
                        <td className="p-4 text-emerald-400 font-medium">
                          {Number(p.valor_global) > 0
                            ? `R$ ${Number(p.valor_global).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                            : '-'}
                        </td>
                        <td className="p-4">
                          <Badge variant="outline" className={`text-xs ${statusCfg.className}`}>
                            {statusCfg.label}
                          </Badge>
                        </td>
                        <td className="p-4 text-gray-400">
                          {p.created_at
                            ? new Date(p.created_at as string).toLocaleDateString('pt-BR')
                            : '-'}
                        </td>
                        <td className="p-4">
                          <Link href={`/proposals/generate/${p.match_id || 'new'}?proposalId=${p.id}`}>
                            <Button variant="ghost" size="sm" className="text-[#F43E01] hover:text-white hover:bg-[#2d2f33]">
                              Editar
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
