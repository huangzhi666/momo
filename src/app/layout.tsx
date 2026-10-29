import type { Metadata } from 'next'
import '@fontsource-variable/inter'
import '@fontsource-variable/source-serif-4'
import './globals.css'
import { Providers } from '@/components/providers'
import { AppShell } from '@/components/app-shell'

export const metadata: Metadata = {
  title: 'LexiLoop 词环 — 把已选单词变成文章',
  description: '从墨墨已选词库生成可读、可听、可跟读的英语文章；生词一眼可见，一键加回墨墨。',
}

const themeScript = `
(function(){
  try {
    var stored = localStorage.getItem('lexiloop-theme');
    var dark = stored === 'dark' || ((!stored || stored === 'system') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  )
}
