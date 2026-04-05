import type { Metadata } from 'next'
import { Inter, JetBrains_Mono, Roboto } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-sans',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
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
  title: 'Licitagram — Inteligência de Dados para Licitações Públicas no Brasil',
  description: '+200.000 licitações/mês monitoradas por IA. 67 milhões de CNPJs cruzados em tempo real. Propostas automáticas, preços de mercado, detecção de fraudes e inteligência competitiva. Tudo em um só lugar.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} ${jetbrainsMono.variable} ${roboto.variable} font-sans antialiased`}>{children}</body>
    </html>
  )
}
