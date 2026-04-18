import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono, Roboto } from 'next/font/google'
import { Providers } from '@/components/providers'
import './globals.css'

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

const roboto = Roboto({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '500', '700'],
  variable: '--font-roboto',
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
}

export const viewport: Viewport = {
  themeColor: '#0a1220',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`dark ${inter.variable} ${jetbrainsMono.variable} ${roboto.variable}`}
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
