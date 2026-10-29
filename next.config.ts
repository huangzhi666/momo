import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  // Windows 上 standalone 的符号链接复制需要开发者模式；默认关闭。
  // Docker 构建时通过 NEXT_OUTPUT_STANDALONE=1 打开。
  ...(process.env.NEXT_OUTPUT_STANDALONE === '1' ? { output: 'standalone' as const } : {}),
  devIndicators: false,
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
}

export default nextConfig
