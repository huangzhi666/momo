'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  AudioLines,
  BookOpenText,
  Database,
  FileInput,
  LibraryBig,
  Moon,
  RefreshCw,
  Settings2,
  Sparkles,
  Sun,
} from 'lucide-react'
import { useTheme } from '@/components/providers'
import { useStatus } from '@/hooks/use-status'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/', label: '生成', icon: Sparkles },
  { href: '/library', label: '历史', icon: LibraryBig },
  { href: '/import', label: '分析', icon: FileInput },
  { href: '/settings', label: '设置', icon: Settings2 },
] as const

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { resolved, toggle } = useTheme()
  return (
    <Button
      variant="ghost"
      size={compact ? 'icon-sm' : 'icon'}
      onClick={toggle}
      aria-label={resolved === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
      title={resolved === 'dark' ? '浅色模式' : '深色模式'}
    >
      {resolved === 'dark' ? <Sun /> : <Moon />}
    </Button>
  )
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-2.5">
      <span className="relative flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <RefreshCw className="size-4.5 transition-transform duration-500 group-hover:rotate-180" />
      </span>
      <span className={cn('flex flex-col leading-none', compact && 'sr-only')}>
        <span className="font-serif text-[1.05rem] font-semibold tracking-tight">LexiLoop</span>
        <span className="mt-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          词环
        </span>
      </span>
    </Link>
  )
}

function StatusCard() {
  const { data, isLoading } = useStatus()
  const demo = data?.demo
  return (
    <div className="rounded-xl border border-border bg-card/70 p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">
          {isLoading ? '读取状态…' : demo ? 'Demo 模式' : '已连接墨墨'}
        </span>
        <span
          className={cn(
            'size-2 rounded-full',
            demo ? 'bg-amber-500' : 'bg-emerald-500',
            isLoading && 'animate-soft-pulse bg-muted-foreground',
          )}
        />
      </div>
      <div className="mt-2.5 space-y-1.5 text-muted-foreground">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5">
            <BookOpenText className="size-3" /> 词库
          </span>
          <span className="tabular-nums text-foreground">
            {data ? data.vocabCount.toLocaleString('en-US') : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5">
            <Database className="size-3" /> 词典
          </span>
          <span className={data?.ecdictReady ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600'}>
            {data ? (data.ecdictReady ? '就绪' : '未导入') : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5">
            <AudioLines className="size-3" /> 音色
          </span>
          <span className="max-w-[7.5rem] truncate text-foreground">
            {data?.tts.provider === 'local-sapi'
              ? '本地朗读'
              : data?.tts.provider === 'mock'
                ? '静音占位'
                : data?.tts.provider ?? '—'}
          </span>
        </div>
      </div>
      {demo ? (
        <Link
          href="/settings"
          className="mt-2.5 inline-flex text-[11px] font-medium text-primary hover:underline"
        >
          配置 Token / LLM →
        </Link>
      ) : null}
    </div>
  )
}

function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border/80 bg-card/55 px-4 py-5 backdrop-blur-sm lg:flex">
      <div className="px-1">
        <Logo />
      </div>
      <nav className="mt-8 flex flex-col gap-1" aria-label="主导航">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                active
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <item.icon className={cn('size-4', active && 'text-primary')} />
              {item.label}
              {active ? <span className="ml-auto size-1.5 rounded-full bg-primary" /> : null}
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto space-y-3">
        <StatusCard />
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] text-muted-foreground">单用户 · 本地优先</span>
          <ThemeToggle compact />
        </div>
      </div>
    </aside>
  )
}

function MobileHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/70 bg-background/80 px-4 backdrop-blur-md lg:hidden">
      <Logo />
      <div className="flex items-center gap-1">
        <Badge variant="outline" className="mr-1 hidden xs:inline-flex">
          LexiLoop
        </Badge>
        <ThemeToggle compact />
      </div>
    </header>
  )
}

function MobileNav() {
  const pathname = usePathname()
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex h-[58px] items-stretch border-t border-border bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      aria-label="移动端导航"
    >
      {NAV.map((item) => {
        const active = isActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px]',
              active ? 'text-primary' : 'text-muted-foreground',
            )}
            aria-current={active ? 'page' : undefined}
          >
            <item.icon className="size-[18px]" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:pl-60">
      <Sidebar />
      <MobileHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-16 lg:pt-9">
        {children}
      </main>
      <MobileNav />
    </div>
  )
}
