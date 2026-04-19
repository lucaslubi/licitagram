import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getCurrentProfile } from '@/lib/auth/profile'
import { OrgaoLogoUpload } from './logo-upload'

export const metadata: Metadata = { title: 'Dados do órgão' }

export default async function OrgaoPage() {
  const profile = await getCurrentProfile()
  if (!profile?.orgao) redirect('/onboarding')
  const canEdit = profile.papel === 'admin' || profile.papel === 'coordenador'

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-primary">Configurações</p>
        <h1 className="text-3xl font-semibold tracking-tight">Dados do órgão</h1>
        <p className="text-sm text-muted-foreground">
          Informações institucionais que aparecem nos artefatos gerados (DFD, ETP, TR, Edital, Parecer)
          e no cabeçalho dos PDFs.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" /> Identificação
          </CardTitle>
          <CardDescription>
            Dados carregados da Receita Federal no momento do cadastro. Edição via suporte.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Razão social" value={profile.orgao.razaoSocial} />
          <Field label="Nome fantasia" value={profile.orgao.nomeFantasia ?? '—'} />
          <Field label="CNPJ" value={profile.orgao.cnpj} mono />
          <Field label="Esfera" value={profile.orgao.esfera} />
          <Field
            label="Localidade"
            value={[profile.orgao.municipio, profile.orgao.uf].filter(Boolean).join(' / ') || '—'}
          />
        </CardContent>
      </Card>

      <OrgaoLogoUpload currentLogoUrl={profile.orgao.logoUrl} canEdit={canEdit} orgaoId={profile.orgao.id} />
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className={`sm:col-span-2 ${mono ? 'font-mono text-sm' : 'text-sm'}`}>{value}</dd>
    </div>
  )
}
