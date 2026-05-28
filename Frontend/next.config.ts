import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true
  },
  turbopack: {
    root: process.cwd()
  },
  async redirects() {
    return [
      {
        source: '/play-demo',
        destination: '/play',
        permanent: true
      }
    ]
  }
}

export default nextConfig
