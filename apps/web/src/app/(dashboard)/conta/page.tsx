import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata = { title: 'Minha Conta · Licitagram' }

const SECTIONS = [
  {
    href: '/conta/notificacoes',
    title: 'Notificações',
    desc: 'Defina presets de qualidade, score mínimo, canais e janelas de silêncio.',
  },
  {
    href: '/settings',
    title: 'Configurações da empresa',
    desc: 'Filtros de UF, faixa de valor, palavras-chave e canais conectados.',
  },
  {
    href: '/billing',
    title: 'Plano e cobrança',
    desc: 'Veja seu plano atual, faturas e gerencie a assinatura.',
  },
]

export default function ContaHubPage() {
  return (
    <div className="max-w-3xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Minha Conta</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gerencie suas preferências de notificação, dados da empresa e plano.
        </p>
      </header>
      <div className="grid gap-3">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="hover:border-primary transition-colors cursor-pointer">
              <CardHeader>
                <CardTitle className="text-lg">{s.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
