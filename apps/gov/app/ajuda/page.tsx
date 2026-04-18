import type { Metadata } from 'next'
import Link from 'next/link'
import { HelpCircle, Mail, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Logo } from '@/components/app/Logo'

export const metadata: Metadata = {
  title: 'Central de Ajuda — LicitaGram Gov',
  description: 'Perguntas frequentes sobre o LicitaGram Gov: Lei 14.133, PNCP, compliance, LGPD, segurança.',
}

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'O LicitaGram Gov é homologado pelo TCU ou pela Comprasnet?',
    a: 'Não existe selo oficial de "homologação" para ferramentas auxiliares. O LicitaGram Gov gera artefatos conforme a Lei 14.133/2021, cita acórdãos do TCU e publica no PNCP via API oficial — toda a responsabilidade legal permanece com o servidor público que assina o processo.',
  },
  {
    q: 'A IA substitui o agente de contratação?',
    a: 'Não. A IA é uma ferramenta de apoio que redige rascunhos de DFD, ETP, Mapa de Riscos, TR, Edital e Parecer. Todos os artefatos precisam ser revisados e aprovados por servidor designado antes da publicação.',
  },
  {
    q: 'Como funciona o Compliance Engine?',
    a: 'É um motor de regras determinísticas (não-IA) que verifica presença de DFD/ETP/TR/Parecer, matriz de riscos em contratações de grande vulto, mínimo de 3 fontes de preços (Acórdão TCU 1.875/2021), coeficiente de variação < 25%, e outras exigências legais. Bloqueia a publicação se houver pendência crítica.',
  },
  {
    q: 'Os dados ficam onde? O LicitaGram Gov é LGPD-compliant?',
    a: 'Todos os dados ficam em Postgres hospedado em região brasileira (Supabase São Paulo). Oferecemos exportação completa (art. 18 II) e direito ao esquecimento (art. 18 VI) em /configuracoes/privacidade. Há registro completo de auditoria (audit_log) de todas as mudanças.',
  },
  {
    q: 'Preciso habilitar MFA?',
    a: 'Administradores e coordenadores são obrigados a habilitar verificação em duas etapas (TOTP). Outros papéis podem habilitar voluntariamente em /configuracoes/seguranca.',
  },
  {
    q: 'Como publicar no PNCP?',
    a: 'Após o Compliance Engine liberar o processo (sem pendências críticas), um admin pode clicar em "Publicar no PNCP" na página do processo. A publicação usa a API oficial e gera um webhook para o órgão com o número PNCP, data de publicação e hash de integridade.',
  },
  {
    q: 'Posso convidar colegas pro meu órgão?',
    a: 'Sim. Em /configuracoes/equipe, administradores e coordenadores podem enviar convites por email. O link expira em 7 dias e é criptograficamente seguro (SHA-256).',
  },
  {
    q: 'O que acontece quando o beta terminar?',
    a: 'Durante o beta de lançamento (2026), o acesso é gratuito e completo. Antes do fim do beta, todos os órgãos recebem aviso prévio de 30 dias com as opções de planos empresariais (Corporativo e Enterprise). Nenhuma cobrança sem aviso.',
  },
  {
    q: 'Como reportar um bug ou sugerir melhoria?',
    a: 'Envie um email para contato@licitagram.com com o máximo de detalhes (URL, passos pra reproduzir, captura de tela). Respondemos em até 1 dia útil.',
  },
]

export default function AjudaPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link href="/"><Logo /></Link>
          <Button asChild variant="ghost" size="sm"><Link href="/login">Entrar</Link></Button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <header className="space-y-3 pb-8">
          <p className="flex items-center gap-2 text-sm font-medium text-primary">
            <HelpCircle className="h-4 w-4" /> Central de ajuda
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Perguntas frequentes</h1>
          <p className="text-muted-foreground">
            Não encontrou o que procura? Fale com a gente.
          </p>
        </header>

        <div className="space-y-4">
          {FAQ.map((item, i) => (
            <Card key={i}>
              <CardHeader>
                <CardTitle className="text-base">{item.q}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-relaxed">{item.a}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-10 rounded-lg border border-border bg-muted/30 p-6 text-center">
          <MessageCircle className="mx-auto h-8 w-8 text-primary" />
          <h2 className="mt-2 text-lg font-semibold">Ainda com dúvidas?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Escreva pra gente. Respondemos em até 1 dia útil.
          </p>
          <Button asChild className="mt-4">
            <a href="mailto:contato@licitagram.com">
              <Mail className="mr-2 h-4 w-4" /> contato@licitagram.com
            </a>
          </Button>
        </div>
      </main>
    </div>
  )
}
