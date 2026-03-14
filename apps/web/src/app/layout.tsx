import type { Metadata } from 'next'
import { Space_Grotesk, IBM_Plex_Mono, Roboto } from 'next/font/google'
import './globals.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-sans',
  display: 'swap',
})

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
})

const roboto = Roboto({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '500', '700'],
  variable: '--font-roboto',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Licitagram',
  description: 'Inteligência artificial para licitações públicas',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className={`${spaceGrotesk.variable} ${ibmPlexMono.variable} ${roboto.variable} font-sans antialiased`}>{children}</body>
    </html>
  )
}
