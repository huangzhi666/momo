'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, FileInput, FileUp, Loader2, Sparkles, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { apiGet, apiPost } from '@/lib/client/api'
import { LEVELS, LEVEL_META, MAX_IMPORT_CHARS, type Level } from '@/lib/constants'
import type { ArticleSummaryDTO } from '@/lib/articles/summary'
import { formatDateTimeZh } from '@/lib/utils'

interface AnalyzeResponse {
  articleId: string
  title: string
  metrics: {
    wordCount: number
    sentenceCount: number
    newCount: number
    outOfBandCount: number
    newDensity: number
    targetCount: number
  }
  warnings: string[]
}

interface ArticlesResponse {
  articles: ArticleSummaryDTO[]
}

const SAMPLE = `The rain had stopped by the time the last bus pulled into the square. A woman with a folded umbrella was waiting under the clock, though the clock had been wrong for years. She did not seem to mind. When the doors opened, she stepped up, paid with coins, and sat near the front, where the driver kept a small radio playing old songs. For three stops neither of them spoke. Then, without looking up, she said, "You still take the long way home." "The long way," he said, "is the only way I know."`

export default function ImportPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [level, setLevel] = useState<Level>('gaokao')
  const [error, setError] = useState<string | null>(null)

  const { data: imported } = useQuery({
    queryKey: ['articles', 'imported'],
    queryFn: () => apiGet<ArticlesResponse>('/api/articles?kind=imported'),
  })

  const mutation = useMutation({
    mutationFn: () =>
      apiPost<AnalyzeResponse>('/api/analyze', {
        text,
        title: title.trim() || undefined,
        level,
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['articles'] })
      toast.success(
        `分析完成：${response.metrics.wordCount} 词，${response.metrics.newCount} 个生词`,
        { description: '已保存到本地，可以在阅读器里边读边加词。' },
      )
      if (response.warnings.length) {
        toast.warning(response.warnings[0], { duration: 9000 })
      }
      router.push(`/article/${response.articleId}`)
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : '分析失败'
      setError(message)
      toast.error(message)
    },
  })

  const tooLong = text.length > MAX_IMPORT_CHARS

  async function handleFile(file: File | null) {
    if (!file) return
    if (file.size > MAX_IMPORT_CHARS * 4) {
      toast.error('文件太大，请换一个小于 20,000 字符的文本。')
      return
    }
    const content = await file.text()
    setText(content.slice(0, MAX_IMPORT_CHARS + 1))
    if (!title) setTitle(file.name.replace(/\.(txt|md)$/i, ''))
    if (content.length > MAX_IMPORT_CHARS) {
      toast.warning('文本超过 20,000 字符，已截断到上限附近。')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analyze"
        title="分析我传入的文章"
        description="粘贴英文，或上传 .txt / .md。系统会清洗文本、分句分词、按 lemma 还原，并把生词标出来。不抓 URL，不上传云端。"
        actions={
          <Badge variant="outline">上限 {MAX_IMPORT_CHARS.toLocaleString('en-US')} 字符</Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="paper-card">
          <CardHeader className="border-b border-border/70 pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileInput className="size-4 text-primary" /> 粘贴或上传
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
              <div className="space-y-2">
                <Label htmlFor="import-title">标题（可选）</Label>
                <Input
                  id="import-title"
                  value={title}
                  maxLength={120}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="留空则取正文前 8 个词"
                />
              </div>
              <div className="space-y-2">
                <Label>难度带</Label>
                <Select value={level} onValueChange={(value) => setLevel(value as Level)}>
                  <SelectTrigger aria-label="选择难度带">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((item) => (
                      <SelectItem key={item} value={item}>
                        {LEVEL_META[item].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="import-text">英文正文</Label>
                <span
                  className={`text-[11px] tabular-nums ${tooLong ? 'text-destructive' : 'text-muted-foreground'}`}
                >
                  {text.length.toLocaleString('en-US')} / {MAX_IMPORT_CHARS.toLocaleString('en-US')}
                </span>
              </div>
              <Textarea
                id="import-text"
                value={text}
                onChange={(event) => {
                  setText(event.target.value)
                  setError(null)
                }}
                rows={14}
                placeholder="Paste an English article here…"
                className="min-h-[18rem] resize-y font-serif text-[15px] leading-7"
                spellCheck={false}
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".txt,.md,text/plain,text/markdown"
                  className="hidden"
                  onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                >
                  <FileUp /> 上传文件
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setText(SAMPLE)
                    setTitle('The Long Way Home')
                  }}
                >
                  <Wand2 /> 填入示例
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  支持 .txt / .md；自动统一弯引号、去空行、修复断词连字符
                </span>
              </div>
            </div>

            {error ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            ) : null}

            <Button
              size="lg"
              className="w-full"
              disabled={!text.trim() || tooLong || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="animate-spin" /> 分析中…
                </>
              ) : (
                <>
                  <Sparkles /> 分析并打开阅读器
                  <ArrowRight className="ml-1" />
                </>
              )}
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              默认显示前 30 个生词；可按「仅难度带内 / 仅高频」筛选，一键添加前 10 个。
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">分析会做什么</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-xs leading-relaxed text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">1. 清洗</span> 统一引号、压缩空行、修复跨行连字符。
              </p>
              <p>
                <span className="font-medium text-foreground">2. 分句分词</span> 原生 Intl.Segmenter，保留 offset。
              </p>
              <p>
                <span className="font-medium text-foreground">3. 还原分类</span> 只做屈折还原；Oxford 3000 永不标注。
              </p>
              <p>
                <span className="font-medium text-foreground">4. 统计</span> 词数、生词密度、基础词覆盖、阅读时长。
              </p>
              <p className="rounded-md border border-border bg-muted/50 p-2 text-[11px]">
                生词密度 &gt; 8% 会提示「这篇文章对你偏难」。生词太多时，侧栏按难度带与词频排序。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">最近导入</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {imported?.articles.length ? (
                imported.articles.slice(0, 5).map((article) => (
                  <Link
                    key={article.id}
                    href={`/article/${article.id}`}
                    className="block rounded-lg px-2 py-2 transition-colors hover:bg-accent/60"
                  >
                    <span className="block truncate text-xs font-medium">{article.title}</span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      {article.wordCount} 词 · {article.newCount} 生词 ·{' '}
                      {formatDateTimeZh(article.createdAt)}
                    </span>
                  </Link>
                ))
              ) : (
                <p className="px-2 py-3 text-xs text-muted-foreground">
                  还没有导入记录。先贴一段试试。
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
