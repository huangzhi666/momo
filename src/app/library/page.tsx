'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpenText, Clock3, FileInput, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, EmptyState } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/progress'
import { apiDelete, apiGet } from '@/lib/client/api'
import { GENRE_META, LEVEL_META, type Genre, type Level } from '@/lib/constants'
import type { ArticleSummaryDTO } from '@/lib/articles/summary'
import { formatDateTimeZh } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface ArticlesResponse {
  articles: ArticleSummaryDTO[]
}

const FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'generated', label: '生成' },
  { value: 'imported', label: '导入' },
  { value: 'demo', label: 'Demo' },
] as const

const KIND_LABEL: Record<string, string> = {
  generated: '生成',
  imported: '导入',
  demo: 'Demo',
}

export default function LibraryPage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['value']>('all')
  const [pendingDelete, setPendingDelete] = useState<ArticleSummaryDTO | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['articles', 'library', filter],
    queryFn: () =>
      apiGet<ArticlesResponse>(
        `/api/articles${filter === 'all' ? '' : `?kind=${filter}`}`,
      ),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/api/articles/${id}`),
    onSuccess: () => {
      toast.success('已删除文章')
      setPendingDelete(null)
      queryClient.invalidateQueries({ queryKey: ['articles'] })
      queryClient.invalidateQueries({ queryKey: ['status'] })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '删除失败'),
  })

  const articles = data?.articles ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Library"
        title="历史文章"
        description="生成和导入的文章都在本地 SQLite 里。断网后仍可阅读；音频与缓存也留在本地。"
        actions={
          <Button asChild>
            <Link href="/">
              <Sparkles /> 生成新文章
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-1 rounded-lg bg-muted p-1 sm:w-fit">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setFilter(item.value)}
            className={cn(
              'rounded-md px-4 py-1.5 text-xs font-medium transition-all',
              filter === item.value
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
            aria-pressed={filter === item.value}
          >
            {item.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-44 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={<BookOpenText className="size-6" />}
          title="读取历史失败"
          description={error instanceof Error ? error.message : '请稍后重试'}
          action={<Button onClick={() => refetch()}>重试</Button>}
        />
      ) : articles.length === 0 ? (
        <EmptyState
          icon={<BookOpenText className="size-6" />}
          title="这里还没有文章"
          description="生成一篇，或把一段英文粘贴到「分析」里开始。"
          action={
            <div className="flex gap-2">
              <Button asChild>
                <Link href="/">
                  <Sparkles /> 去生成
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/import">
                  <FileInput /> 分析文章
                </Link>
              </Button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {articles.map((article) => (
            <Card key={article.id} className="group relative overflow-hidden transition-shadow hover:shadow-lg">
              <Link href={`/article/${article.id}`} className="block">
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">
                        {LEVEL_META[article.level as Level]?.label ?? article.level}
                      </Badge>
                      <Badge variant="secondary">{KIND_LABEL[article.kind] ?? article.kind}</Badge>
                      {article.genre && GENRE_META[article.genre as Genre] ? (
                        <Badge variant="outline">{GENRE_META[article.genre as Genre].label}</Badge>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`删除 ${article.title}`}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        setPendingDelete(article)
                      }}
                      className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <Trash2 className="text-muted-foreground" />
                    </Button>
                  </div>
                  <div>
                    <h2 className="font-serif text-lg leading-snug tracking-tight group-hover:text-primary">
                      {article.title}
                    </h2>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {article.summaryZh || article.preview}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span>{article.wordCount} 词</span>
                    <span className="text-new">{article.newCount} 生词</span>
                    {article.outOfBandCount > 0 ? (
                      <span className="text-oot">{article.outOfBandCount} 超纲</span>
                    ) : null}
                    <span className="ml-auto inline-flex items-center gap-1">
                      <Clock3 className="size-3" />
                      {formatDateTimeZh(article.createdAt)}
                    </span>
                  </div>
                </CardContent>
              </Link>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除这篇文章？</DialogTitle>
            <DialogDescription>
              「{pendingDelete?.title}」及其标注会从本地删除。音频缓存会保留，但无法再从文章进入。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
            >
              {deleteMutation.isPending ? '删除中…' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
