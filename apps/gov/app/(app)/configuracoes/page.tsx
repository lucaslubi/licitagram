import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Building2,
  ClipboardCheck,
  Lock,
  ScrollText,
  Shield,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata: Metadata = { title: 'Configurações' }

interface Section {
  label: string
  href: string
  description: string
  icon: LucideIcon
}

const SECTIONS: Section[] = [
  {
    label: 'Órgão',
    href: '/configuracoes/orgao',
    description: 'Identificação institucional, razão social, CNPJ, esfera, localidade e logomarca.',
    icon: Building2,
  },
  {
    label: 'Setores',
    href: '/configuracoes/setores',
    description: 'Unidades demandantes e estrutura hierárquica do órgão.',
    icon: ScrollText,
  },
  {
    label: 'Equipe',
    href: '/configuracoes/equipe',
    description: 'Usuários, papéis (admin, coordenador, requisitante) e convites.',
    icon: Users,
  },
  {
    label: 'Plano',
    href: '/configuracoes/plano',
    description: 'Plano contratado e limite de processos/artefatos.',
    icon: Wallet,
  },
  {
    label: 'Segurança',
    href: '/configuracoes/seguranca',
    description: 'MFA, sessões ativas, política de senhas.',
    icon: Lock,
  },
  {
    label: 'Privacidade',
    href: '/configuracoes/privacidade',
    description: 'LGPD, exportação de dados, retenção e compartilhamento.',
    icon: Shield,
  },
  {
    label: 'Auditoria',
    href: '/configuracoes/auditoria',
    description: 'Log de todas as operações sensíveis do órgão (inserção, edição, aprovação).',
    icon: ClipboardCheck,
  },
]

export default function ConfiguracoesIndexPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 animate-ink-in">
      <header className="rule-top space-y-2 pt-6">
        <p className="label-institutional">Administração do órgão</p>
        <h1 className="font-display text-[2rem] leading-[1.12] tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Gestão institucional, equipe e governança do órgão contratante.
        </p>
      </header>

      <section className="grid gap-0 overflow-hidden rounded-md border border-border sm:grid-cols-2">
        {SECTIONS.map((s, i) => (
          <Link
            key={s.href}
            href={s.href}
            className={`group flex gap-3 p-5 transition-colors hover:bg-muted/40 ${
              i % 2 === 1 ? 'sm:border-l sm:border-border' : ''
            } ${i >= 2 ? 'border-t border-border' : ''}`}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background">
              <s.icon className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-medium tracking-tight">{s.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.description}</p>
            </div>
          </Link>
        ))}
      </section>
    </div>
  )
}
