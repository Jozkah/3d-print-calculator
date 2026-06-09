/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  eslint: {
    // Linting is available on demand via `pnpm lint`; keep it out of the
    // production build so a style warning can't block a deploy.
    ignoreDuringBuilds: true,
  },
}

export default nextConfig
