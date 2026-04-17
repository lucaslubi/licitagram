import type { MetadataRoute } from 'next'
import { getAllArticles } from '@/content/blog/articles'

const BASE = 'https://licitagram.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const articles = getAllArticles().map((a) => ({
    url: `${BASE}/blog/${a.meta.slug}`,
    lastModified: new Date(a.meta.updatedAt ?? a.meta.publishedAt),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }))

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE}/blog`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE}/cases`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/status`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.5 },
    { url: `${BASE}/signup`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/login`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  ]

  return [...staticPages, ...articles]
}
