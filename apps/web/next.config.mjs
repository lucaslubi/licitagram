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
  // Allow pdfjs-dist worker to be served as a static asset
  webpack: (config) => {
    config.resolve.alias.canvas = false
    return config
  },
}

export default nextConfig
