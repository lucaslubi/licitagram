import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gov.licitagram.com'
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/sobre', '/precos', '/ajuda', '/termos', '/privacidade'],
        disallow: ['/api/', '/dashboard', '/pca', '/processos', '/configuracoes', '/onboarding', '/convite/', '/s/', '/login', '/cadastro', '/mfa', '/recuperar-senha', '/redefinir-senha'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
