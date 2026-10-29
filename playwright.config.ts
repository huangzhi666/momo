import fs from 'node:fs'
import { defineConfig } from '@playwright/test'

// 优先复用本机已安装的 Edge（无需下载浏览器）；其他平台请先
// `pnpm exec playwright install chromium`，或设置 PLAYWRIGHT_CHANNEL。
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const channel =
  process.env.PLAYWRIGHT_CHANNEL ??
  (process.platform === 'win32' && fs.existsSync(edgePath) ? 'msedge' : undefined)

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 900 },
    channel,
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
