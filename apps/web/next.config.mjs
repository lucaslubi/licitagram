/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@licitagram/shared'],
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse'],
  },
  eslint: {
    // ESLint 10.x removed legacy options (useEslintrc, extensions) that
    // Next.js 14 still depends on. Disable built-in linting here and
    // run ESLint separately via `pnpm lint` instead.
    ignoreDuringBuilds: true,
  },
  // Avoid bundling pdfjs-dist worker (loaded via CDN instead)
  webpack: (config) => {
    config.resolve.alias.canvas = false
    // Exclude pdf.worker from being processed by Terser
    config.module.rules.push({
      test: /pdf\.worker(\.min)?\.mjs$/,
      type: 'asset/resource',
    })
    return config
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://apis.google.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.mapbox.com",
              "img-src 'self' data: blob: https://*.stripe.com https://*.mapbox.com https://*.supabase.co",
              "font-src 'self' https://fonts.gstatic.com",
              "frame-src https://js.stripe.com https://accounts.google.com",
              "connect-src 'self' https://*.supabase.co https://api.stripe.com https://api.mapbox.com https://*.tiles.mapbox.com https://events.mapbox.com wss://*.supabase.co",
              "worker-src 'self' blob:",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

export default nextConfig
