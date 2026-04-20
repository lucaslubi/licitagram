import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Sans, IBM_Plex_Mono, Newsreader } from 'next/font/google'
import { Providers } from '@/components/providers'
import './globals.css'

/**
 * Typography system — Institutional Editorial
 *
 * Newsreader (display):   serif contemporânea, peso institucional para
 *                         cabeçalhos de artefatos e títulos de seção.
 *                         Alternativa distinta às serifas clichê.
 * IBM Plex Sans (body):   neutral enterprise-grade. Mesma família usada
 *                         em Carta, Airbnb. Zero "SaaS AI" vibe.
 * IBM Plex Mono (dados):  tabular nums perfeitos para R$ e códigos
 *                         CATMAT/CATSER em tabelas densas.
 */
const plexSans = IBM_Plex_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-plex-sans',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
})

const newsreader = Newsreader({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-newsreader',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'LicitaGram Gov — Automação de licitações sob a Lei 14.133/2021',
    template: '%s · LicitaGram Gov',
  },
  description:
    'Copiloto agêntico para órgãos públicos: DFD, ETP, TR, Mapa de Riscos, Cesta de Preços, Edital, Parecer e publicação PNCP — com compliance determinístico citando Lei 14.133/2021 e acórdãos do TCU.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://gov.licitagram.com'),
  robots: { index: true, follow: true },
  manifest: '/manifest.webmanifest',
  applicationName: 'LicitaGram Gov',
  appleWebApp: { capable: true, title: 'LicitaGov', statusBarStyle: 'black-translucent' },
  other: {
    // Modernização do apple-mobile-web-app-capable (ambos são recomendados
    // até que todos browsers adotem a tag nova).
    'mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  themeColor: '#0B0C0F',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Font variables legadas (--font-inter, --font-jetbrains-mono, --font-roboto)
  // são remapeadas pras novas famílias. Nenhum componente quebra porque os
  // @font-face do tailwind vêm do globals.css (var(--font-sans)).
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${plexSans.variable} ${plexMono.variable} ${newsreader.variable}`}
      style={{
        // Remap legacy font variables so old components (if any) keep working
        '--font-inter': 'var(--font-plex-sans)',
        '--font-jetbrains-mono': 'var(--font-plex-mono)',
        '--font-roboto': 'var(--font-plex-sans)',
        '--font-sans': 'var(--font-plex-sans)',
        '--font-mono': 'var(--font-plex-mono)',
        '--font-display': 'var(--font-newsreader)',
      } as React.CSSProperties}
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
