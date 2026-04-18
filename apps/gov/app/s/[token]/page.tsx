import type { Metadata } from 'next'
import { AlertTriangle, Building2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { resolveTokenAction } from '@/lib/pca/public-actions'
import { PublicForm } from './public-form'
import { Logo } from '@/components/app/Logo'

export const metadata: Metadata = { title: 'Coleta PCA' }

export default async function PublicTokenPage({ params }: { params: { token: string } }) {
  const resolution = await resolveTokenAction(params.token)

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4 sm:px-6">
          <Logo />
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        {!resolution ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-warning">
                <AlertTriangle className="h-5 w-5" />
                Link inválido ou expirado
              </CardTitle>
              <CardDescription>
                Este link de coleta não é mais válido. Pode ter expirado, sido revogado, ou está incorreto.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Procure o responsável da campanha no seu órgão para receber um novo link.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" aria-hidden />
              <span className="font-medium text-foreground">{resolution.orgaoRazaoSocial}</span>
              <span>·</span>
              <span>{resolution.setorNome}{resolution.setorSigla ? ` (${resolution.setorSigla})` : ''}</span>
            </div>

            <header className="space-y-2">
              <p className="font-mono text-xs uppercase tracking-wide text-primary">PCA {resolution.campanhaAno}</p>
              <h1 className="text-3xl font-semibold tracking-tight">{resolution.campanhaTitulo}</h1>
              <p className="text-sm text-muted-foreground">
                Liste os itens que seu setor precisa contratar no próximo exercício. Quanto mais preciso, mais fácil é consolidar o PCA do órgão.
              </p>
            </header>

            <PublicForm
              token={params.token}
              setorNome={resolution.setorNome}
              prazoIso={resolution.expiraEm}
              previouslyResponded={!!resolution.respondidoEm}
            />
          </div>
        )}
      </main>
    </div>
  )
}
