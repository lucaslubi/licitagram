import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gov.licitagram.com'
  const now = new Date()
  const pages: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
    { path: '/', priority: 1.0, changeFrequency: 'monthly' },
    { path: '/sobre', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/precos', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/ajuda', priority: 0.7, changeFrequency: 'weekly' },
    { path: '/termos', priority: 0.4, changeFrequency: 'yearly' },
    { path: '/privacidade', priority: 0.4, changeFrequency: 'yearly' },
  ]
  return pages.map((p) => ({
    url: `${base}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }))
}
