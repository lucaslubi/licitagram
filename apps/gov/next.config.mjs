/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@licitagram/shared', '@licitagram/gov-core'],
  poweredByHeader: false,
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.posthog.com https://*.sentry.io",
      // Google Fonts (Newsreader, IBM Plex Sans/Mono, etc.) — inline style
      // é necessário pro Next.js injetar CSS-in-JS.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      // fonts.gstatic.com — arquivos .woff2 das fontes Google.
      "font-src 'self' data: https://fonts.gstatic.com",
      // APIs de IA (chain completo de 9 providers):
      //   generativelanguage.googleapis.com  — Gemini direto
      //   openrouter.ai                       — OpenRouter (9 modelos)
      //   api.deepseek.com                    — DeepSeek V3
      //   api.cerebras.ai                     — Cerebras Llama
      //   api.groq.com                        — Groq Llama
      //   api.anthropic.com                   — Claude (fallback opcional)
      //   dadosabertos.compras.gov.br         — Compras.gov (sync on-demand)
      [
        'connect-src',
        "'self'",
        'https://*.supabase.co',
        'wss://*.supabase.co',
        'https://*.posthog.com',
        'https://*.sentry.io',
        'https://generativelanguage.googleapis.com',
        'https://openrouter.ai',
        'https://api.deepseek.com',
        'https://api.cerebras.ai',
        'https://api.groq.com',
        'https://api.mistral.ai',
        'https://api.anthropic.com',
        'https://brasilapi.com.br',
        'https://receitaws.com.br',
        'https://pncp.gov.br',
        'https://dadosabertos.compras.gov.br',
      ].join(' '),
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      'upgrade-insecure-requests',
    ].join('; ')
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ]
  },
}

export default nextConfig
