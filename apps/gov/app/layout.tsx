import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { Providers } from '@/components/providers'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'LicitaGram Gov — Copiloto agêntico de licitações públicas',
    template: '%s · LicitaGram Gov',
  },
  description:
    'Automatize integralmente a fase interna das licitações (PCA, DFD, ETP, TR, Edital) sob a Lei 14.133/2021.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://gov.licitagram.com'),
  robots: { index: true, follow: true },
  manifest: '/manifest.webmanifest',
  applicationName: 'LicitaGram Gov',
  appleWebApp: { capable: true, title: 'LicitaGov', statusBarStyle: 'black-translucent' },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
