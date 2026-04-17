import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/blog', '/blog/*', '/precos', '/precos/*', '/cases', '/cases/*', '/status'],
        disallow: ['/dashboard/*', '/admin/*', '/api/*', '/onboarding'],
      },
    ],
    sitemap: 'https://licitagram.com/sitemap.xml',
    host: 'https://licitagram.com',
  }
}
