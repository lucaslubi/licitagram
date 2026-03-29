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
        ],
      },
    ]
  },
}

export default nextConfig
