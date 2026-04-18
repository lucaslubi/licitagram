import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Building2, Crown, Mail, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/auth/profile'
import { formatDate } from '@licitagram/shared'

export const metadata: Metadata = { title: 'Plano' }

const TRIAL_DIAS = 14
const SUPPORT_EMAIL = 'contato@licitagram.com'

export default async function PlanoPage() {
  const profile = await getCurrentProfile()
  if (!profile?.orgao) redirect('/onboarding')

  const supabase = createClient()
  const { data: orgao } = await supabase
    .schema('licitagov' as never)
    .from('orgaos')
    .select('criado_em, metadados')
    .eq('id', profile.orgao.id)
    .maybeSingle()

  const criadoEm = (orgao?.criado_em as string | undefined) ?? new Date().toISOString()
  const criadoDate = new Date(criadoEm)
  const trialEnd = new Date(criadoDate.getTime() + TRIAL_DIAS * 24 * 3600 * 1000)
  const diasRestantes = Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / (24 * 3600 * 1000)))
  const expirado = diasRestantes === 0
  const metadados = (orgao?.metadados as Record<string, unknown> | undefined) ?? {}
  const planoTier = (metadados.plano_tier as string | undefined) ?? 'beta'
  const planoAtivo = planoTier !== 'beta' || !expirado

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <p className="text-sm font-medium text-primary">Configurações</p>
        <h1 className="text-3xl font-semibold tracking-tight">Plano e cobrança</h1>
        <p className="text-sm text-muted-foreground">
          Durante a fase beta, todos os órgãos usam o plano inicial gratuito. A cobrança será ativada com aviso prévio de 30 dias.
        </p>
      </header>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5 text-primary" />
                {planoTier === 'beta' ? 'LicitaGram Gov — Beta' : `Plano ${planoTier}`}
              </CardTitle>
              <CardDescription>
                {planoTier === 'beta'
                  ? 'Acesso completo à plataforma durante o beta de lançamento.'
                  : 'Plano ativo contratado via time comercial.'}
              </CardDescription>
            </div>
            {planoAtivo ? (
              <Badge variant="default">Ativo</Badge>
            ) : (
              <Badge variant="destructive">Trial expirado</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Órgão" value={profile.orgao.nomeFantasia ?? profile.orgao.razaoSocial} />
            <Stat label="Plano" value={planoTier === 'beta' ? 'Beta lançamento' : planoTier} />
            <Stat
              label={expirado ? 'Trial expirou em' : 'Dias de trial restantes'}
              value={expirado ? formatDate(trialEnd.toISOString()) : `${diasRestantes} dia(s)`}
            />
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            <p>
              <Building2 className="mr-1 inline h-4 w-4" />
              Conta criada em <strong>{formatDate(criadoEm)}</strong>. Durante o beta o LicitaGram Gov é gratuito, sem limite de usuários, processos ou páginas.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Crown className="h-4 w-4 text-primary" />
            Planos empresariais
          </CardTitle>
          <CardDescription>
            Após o beta, dois planos ficam disponíveis: <strong>Corporativo</strong> (até 10 usuários) e <strong>Enterprise</strong> (uso ilimitado + SLA + onboarding dedicado).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2 text-sm">
            <li className="flex gap-2"><span className="text-primary">✓</span> Fluxo completo Lei 14.133 (DFD/ETP/TR/Riscos/Preços/Edital/Parecer)</li>
            <li className="flex gap-2"><span className="text-primary">✓</span> Compliance Engine determinístico com citações TCU</li>
            <li className="flex gap-2"><span className="text-primary">✓</span> PCA Collector coletivo + IA consolidadora</li>
            <li className="flex gap-2"><span className="text-primary">✓</span> Publicação automatizada no PNCP</li>
            <li className="flex gap-2"><span className="text-primary">✓</span> LGPD: exportação e direito ao esquecimento</li>
          </ul>
          <Button asChild>
            <a href={`mailto:${SUPPORT_EMAIL}?subject=Plano LicitaGram Gov — ${encodeURIComponent(profile.orgao.razaoSocial)}`}>
              <Mail className="mr-2 h-4 w-4" /> Falar com time comercial
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1 rounded-lg border border-border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tracking-tight">{value}</p>
    </div>
  )
}
