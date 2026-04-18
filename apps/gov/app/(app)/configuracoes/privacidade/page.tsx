import type { Metadata } from 'next'
import { Download, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DeleteAccountButton } from './delete-button'

export const metadata: Metadata = { title: 'Privacidade' }

export default function PrivacidadePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-primary">Configurações</p>
        <h1 className="text-3xl font-semibold tracking-tight">Privacidade & LGPD</h1>
        <p className="text-sm text-muted-foreground">
          Direitos garantidos pela Lei 13.709/2018 (LGPD), art. 18.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4 text-primary" /> Exportar meus dados
          </CardTitle>
          <CardDescription>
            Baixe um arquivo JSON com todos os seus dados pessoais e atos administrativos registrados em seu nome.
            LGPD art. 18, inciso II (direito de acesso).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <a href="/api/user/export" download>
              Baixar meus dados (JSON)
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-destructive">
            <ShieldAlert className="h-4 w-4" /> Solicitar exclusão
          </CardTitle>
          <CardDescription>
            LGPD art. 18, inciso VI (eliminação de dados). Suas informações pessoais (nome, email, CPF, cargo) serão
            anonimizadas imediatamente. <strong>Atos administrativos criados por você permanecem auditáveis sem
            identificação pessoal</strong> — exigência do art. 6º da Lei 14.133/2021 e da norma TCU de rastreabilidade.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteAccountButton />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">O que fazemos com seus dados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Dados coletados:</strong> nome completo, email institucional, CPF (opcional),
            cargo, papel no órgão, atos administrativos que você realiza no sistema (criação de campanhas, processos,
            aprovação de artefatos, etc.).
          </p>
          <p>
            <strong className="text-foreground">Base legal:</strong> execução de contrato (LGPD art. 7º V) + obrigação
            legal (LGPD art. 7º II) para os atos administrativos exigidos pela Lei 14.133/2021.
          </p>
          <p>
            <strong className="text-foreground">Retenção:</strong> dados pessoais enquanto sua conta estiver ativa. Atos
            administrativos têm retenção mínima de 10 anos após o encerramento do contrato, conforme Decreto
            10.278/2020 (temporalidade de documentos).
          </p>
          <p>
            <strong className="text-foreground">Compartilhamento:</strong> nenhum com terceiros fora dos sistemas
            oficiais (PNCP, Compras.gov.br, Supabase como processador). Provedores de IA (Google Gemini) recebem
            conteúdo dos artefatos em geração — não dados pessoais dos usuários.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
