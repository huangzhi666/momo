'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  BookOpenText,
  Database,
  Headphones,
  RefreshCw,
  Settings2,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { GenerateForm } from '@/components/generate/generate-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/progress'
import { useStatus } from '@/hooks/use-status'
import { apiGet } from '@/lib/client/api'
import { LEVEL_META } from '@/lib/constants'
import type { ArticleSummaryDTO } from '@/lib/articles/summary'
import { relativeTimeZh } from '@/lib/utils'

interface ArticlesResponse {
  articles: ArticleSummaryDTO[]
}

const SOURCE_LABEL: Record<string, string> = {
  maimemo: '墨墨',
  demo: 'Demo 示例',
  mixed: '混合',
  empty: '空',
}

export default function HomePage() {
  const { data: status, isLoading } = useStatus()
  const { data: recent, isLoading: recentLoading } = useQuery({
    queryKey: ['articles', 'recent'],
    queryFn: () => apiGet<ArticlesResponse>('/api/articles?kind=generated'),
  })
  const { data: demos, isLoading: demosLoading } = useQuery({
    queryKey: ['articles', 'demo'],
    queryFn: () => apiGet<ArticlesResponse>('/api/articles?kind=demo'),
  })

  const needsSetup = status && !status.ecdictReady
  const needsVocab = status && status.ecdictReady && status.vocabCount === 0

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="LexiLoop · 词环"
        title="把已选单词，变成今天想读的那一篇。"
        description="从墨墨词库加权采样目标词，生成可读、可听、可跟读的英语文章。Oxford 3000 永不标注；生词一眼可见，点开有词典，一键加回墨墨。"
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={status?.demo ? 'warning' : 'success'}>
              {status?.demo ? 'Demo 模式' : '已连接墨墨'}
            </Badge>
            <Badge variant="outline">{status?.llm.configured ? 'LLM 就绪' : '预置文章'}</Badge>
          </div>
        }
      />

      {status?.demo ? (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-600/25 bg-amber-500/8 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Demo 模式：</span>
              {status.demoReason}。当前使用 {status.vocabCount} 个示例词；加词会模拟成功，不会写入墨墨。
            </p>
          </div>
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link href="/settings">
              <Settings2 /> 配置
            </Link>
          </Button>
        </div>
      ) : null}

      {needsSetup ? (
        <Card className="border-amber-600/30 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="size-4 text-amber-600" /> 还差一步：导入 ECDICT
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>词卡释义、词形还原、考试标签都依赖本地 ECDICT。运行：</p>
            <code className="block rounded-md border border-border bg-card px-3 py-2 font-mono text-xs text-foreground">
              pnpm setup
            </code>
          </CardContent>
        </Card>
      ) : null}

      {needsVocab ? (
        <Card className="border-amber-600/30 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpenText className="size-4 text-amber-600" /> 词库为空
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            在设置页同步墨墨词库，或运行 <code className="font-mono text-xs">pnpm db:seed</code>{' '}
            载入 300 个 Demo 词。
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <Card className="paper-card overflow-visible">
          <CardHeader className="border-b border-border/70 pb-4">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-4 text-primary" /> 生成一篇新文章
              </CardTitle>
              {isLoading ? <Skeleton className="h-5 w-24" /> : null}
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <GenerateForm />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <BookOpenText className="size-3.5 text-primary" /> 词库状态
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">已选单词</span>
                <span className="font-serif text-2xl font-semibold tabular-nums">
                  {status ? status.vocabCount.toLocaleString('en-US') : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>来源</span>
                <span>{SOURCE_LABEL[status?.vocabSource ?? 'empty']}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>上次同步</span>
                <span className={status?.syncRunning ? 'text-primary' : ''}>
                  {status?.syncRunning ? '同步中…' : relativeTimeZh(status?.lastSyncAt)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>ECDICT</span>
                <span>
                  {status ? `${status.ecdictWords.toLocaleString('en-US')} 词` : '—'}
                </span>
              </div>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href="/settings">
                  <RefreshCw /> 同步与设置
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Headphones className="size-3.5 text-primary" /> 最近生成
                </CardTitle>
                <Link href="/library" className="text-[11px] text-muted-foreground hover:text-primary">
                  全部
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              {recentLoading ? (
                <div className="space-y-2 py-1">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : recent?.articles.length ? (
                recent.articles.slice(0, 4).map((article) => (
                  <Link
                    key={article.id}
                    href={`/article/${article.id}`}
                    className="group flex items-start gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-accent/60"
                  >
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/50" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium group-hover:text-primary">
                        {article.title}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        {LEVEL_META[article.level as keyof typeof LEVEL_META]?.label ?? article.level}
                        <span>·</span>
                        {article.wordCount} 词
                        <span>·</span>
                        <span className="text-new">{article.newCount} 生词</span>
                      </span>
                    </span>
                    <ArrowRight className="mt-1 size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                ))
              ) : (
                <p className="px-2 py-3 text-xs text-muted-foreground">
                  还没有生成记录。左边设定参数，生成第一篇。
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <BookOpenText className="size-3.5 text-primary" /> Demo 文章
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {demosLoading ? (
                <div className="space-y-2 py-1">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : demos?.articles.length ? (
                demos.articles.slice(0, 3).map((article) => (
                  <Link
                    key={article.id}
                    href={`/article/${article.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-xs transition-colors hover:bg-accent/60"
                  >
                    <span className="min-w-0 truncate">{article.title}</span>
                    <Badge variant="outline" className="shrink-0">
                      {LEVEL_META[article.level as keyof typeof LEVEL_META]?.label ?? article.level}
                    </Badge>
                  </Link>
                ))
              ) : (
                <p className="px-2 py-3 text-xs text-muted-foreground">Demo 文章尚未写入。</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="bg-card/55">
        <CardContent className="grid gap-5 p-5 sm:grid-cols-3">
          {[
            {
              step: '01',
              title: '加权采样',
              text: '从墨墨已选词里挑出今天最该复习的词：遗忘 / 模糊优先，久未复习优先。',
            },
            {
              step: '02',
              title: '生成 + 确定性校验',
              text: 'LLM 只负责写；词数、句长、生词密度、超纲词、目标词覆盖由代码校验。',
            },
            {
              step: '03',
              title: '读、听、跟读',
              text: '逐句合成音频，句间留白可调；点词看释义，一键加回墨墨。',
            },
          ].map((item) => (
            <div key={item.step} className="flex gap-3">
              <span className="font-serif text-xl font-semibold text-primary/60">{item.step}</span>
              <div>
                <p className="text-sm font-medium">{item.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.text}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
