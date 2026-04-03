import { redirect } from 'next/navigation'
import { getUserWithPlan } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import { CalendarView } from './calendar-view'

export const dynamic = 'force-dynamic'

interface CalendarEvent {
  id: string
  date: string
  type: 'abertura' | 'encerramento' | 'certidao' | 'impugnacao' | 'proposta'
  title: string
  description: string
  link: string
  urgency: 'normal' | 'soon' | 'urgent'
}

export default async function CalendarPage() {
  const user = await getUserWithPlan()
  if (!user) redirect('/login')
  if (!user.companyId) redirect('/company')

  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  const events: CalendarEvent[] = []

  // 1. Tenders from pipeline — only recent/future (last 7 days + future)
  const { data: matches } = await supabase
    .from('matches')
    .select('id, tender_id, score, status, tenders(id, objeto, orgao_nome, data_abertura, data_encerramento)')
    .eq('company_id', user.companyId)
    .not('status', 'in', '(dismissed,lost)')
    .gte('score', 50)
    .or(`tenders.data_abertura.gte.${sevenDaysAgo},tenders.data_encerramento.gte.${sevenDaysAgo}`)
    .order('score', { ascending: false })
    .limit(200)

  for (const m of matches || []) {
    const t = m.tenders as any
    if (!t) continue

    if (t.data_abertura) {
      const daysUntil = Math.ceil((new Date(t.data_abertura).getTime() - Date.now()) / 86400000)
      events.push({
        id: `abertura-${t.id}`,
        date: t.data_abertura,
        type: 'abertura',
        title: `Abertura: ${t.objeto?.substring(0, 80) || 'Licitação'}`,
        description: t.orgao_nome || '',
        link: `/opportunities/${m.id}`,
        urgency: daysUntil <= 1 ? 'urgent' : daysUntil <= 3 ? 'soon' : 'normal',
      })
    }

    if (t.data_encerramento) {
      const daysUntil = Math.ceil((new Date(t.data_encerramento).getTime() - Date.now()) / 86400000)
      events.push({
        id: `enc-${t.id}`,
        date: t.data_encerramento,
        type: 'encerramento',
        title: `Encerramento: ${t.objeto?.substring(0, 80) || 'Licitação'}`,
        description: t.orgao_nome || '',
        link: `/opportunities/${m.id}`,
        urgency: daysUntil <= 1 ? 'urgent' : daysUntil <= 3 ? 'soon' : 'normal',
      })
    }
  }

  // 2. Company documents (certidões)
  const { data: docs } = await supabase
    .from('company_documents')
    .select('id, tipo, descricao, validade, status')
    .eq('company_id', user.companyId)
    .not('status', 'eq', 'expired')
    .not('validade', 'is', null)

  for (const d of docs || []) {
    if (!d.validade) continue
    const daysUntil = Math.ceil((new Date(d.validade).getTime() - Date.now()) / 86400000)
    events.push({
      id: `cert-${d.id}`,
      date: d.validade,
      type: 'certidao',
      title: `Vencimento: ${d.tipo?.replace(/_/g, ' ').toUpperCase() || 'Certidão'}`,
      description: d.descricao || '',
      link: '/documents',
      urgency: daysUntil <= 3 ? 'urgent' : daysUntil <= 7 ? 'soon' : 'normal',
    })
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Agenda</h1>
      <CalendarView events={events} />
    </div>
  )
}
