'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  AudioLines,
  BookOpenText,
  Clock3,
  Download,
  Loader2,
  WandSparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { Metric } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AudioPlayer } from '@/components/reader/audio-player'
import { ArticleBody } from '@/components/reader/article-body'
import { ArticleSidebar } from '@/components/reader/article-sidebar'
import { WordCard, type WordSelection } from '@/components/reader/word-card'
import { useSentencePlayer } from '@/hooks/use-sentence-player'
import { useIgnoredStore } from '@/stores/ignored'
import { apiGet, apiPost } from '@/lib/client/api'
import {
  GENRE_META,
  LEVEL_META,
  VOICES,
  type Genre,
  type VoiceId,
} from '@/lib/constants'
import type { AppSettings } from '@/lib/settings'
import type { ArticleRowDTO, WordMeta } from '@/lib/types'
import { formatDateTimeZh } from '@/lib/utils'

interface SettingsResponse {
  settings: AppSettings
}

interface GenerateResponse {
  articleId: string
  demoFallback: boolean
  notice: string | null
  warnings: string[]
}

export function ArticleView({ articleId }: { articleId: string }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [voice, setVoice] = useState<VoiceId | undefined>(undefined)
  const [selection, setSelection] = useState<WordSelection | null>(null)
  const [cardOpen, setCardOpen] = useState(false)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [ttsRequested, setTtsRequested] = useState(false)
  const startedRef = useRef<Set<string>>(new Set())
  const ignored = useIgnoredStore((state) => state.ignored)
  const ignoredSet = useMemo(() => new Set(ignored), [ignored])

  const articleQuery = useQuery({
    queryKey: ['article', articleId, voice ?? 'default'],
    queryFn: () =>
      apiGet<ArticleRowDTO>(
        `/api/articles/${articleId}${voice ? `?voice=${encodeURIComponent(voice)}` : ''}`,
      ),
    retry: 1,
  })
  const article = articleQuery.data

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiGet<SettingsResponse>('/api/settings'),
    staleTime: Infinity,
  })

  useEffect(() => {
    useIgnoredStore.persist.rehydrate()
  }, [])

  useEffect(() => {
    if (voice) return
    const initial = (article?.request?.voice ?? article?.audio.voice) as VoiceId | undefined
    if (initial) setVoice(initial)
  }, [article, voice])

  const player = useSentencePlayer(article?.sentences ?? [], {
    onMissingAudio: () => toast.info('这一句的音频还在合成中，稍等再试。'),
    onPlayError: () => toast.error('播放被浏览器拦截或音频未就绪，请再点一次。'),
  })

  const startTtsMutation = useMutation({
    mutationFn: () =>
      apiPost<unknown>(`/api/articles/${articleId}/tts`, {
        voice: voice ?? article?.request?.voice ?? 'female-us',
      }),
    onSuccess: () => {
      setTtsRequested(true)
      queryClient.invalidateQueries({ queryKey: ['article', articleId] })
    },
    onError: (error) => {
      setTtsRequested(false)
      toast.error(error instanceof Error ? error.message : '音频启动失败')
    },
  })

  useEffect(() => {
    if (!article || !voice) return
    if (article.kind === 'imported') return
    if (article.audio.ready >= article.sentenceCount) return
    if (article.audio.status === 'running') return
    const key = `${article.id}:${voice}`
    if (startedRef.current.has(key)) return
    startedRef.current.add(key)
    startTtsMutation.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.id, article?.kind, article?.audio.ready, article?.audio.status, article?.sentenceCount, voice])

  const ttsActive = ttsRequested || article?.audio.status === 'running'

  useEffect(() => {
    if (!ttsActive || !voice) return
    let cancelled = false
    const source = new EventSource(
      `/api/articles/${articleId}/tts/stream?voice=${encodeURIComponent(voice)}`,
    )
    let lastRefetch = 0
    const onProgress = (event: MessageEvent<string>) => {
      if (Date.now() - lastRefetch > 800) {
        lastRefetch = Date.now()
        queryClient.invalidateQueries({ queryKey: ['article', articleId] })
      }
    }
    const onDone = () => {
      source.close()
      if (!cancelled) {
        setTtsRequested(false)
        queryClient.invalidateQueries({ queryKey: ['article', articleId] })
      }
    }
    source.addEventListener('progress', onProgress as EventListener)
    source.addEventListener('done', onDone as EventListener)
    source.onerror = () => source.close()
    return () => {
      cancelled = true
      source.close()
    }
  }, [ttsActive, articleId, voice, queryClient])

  useEffect(() => {
    if (!player.playing) return
    const element = document.querySelector(
      `[data-sentence-index="${player.currentIndex}"]`,
    ) as HTMLElement | null
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [player.currentIndex, player.playing])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (
        cardOpen ||
        target?.isContentEditable ||
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select'
      ) {
        return
      }
      if (event.code === 'Space') {
        event.preventDefault()
        player.toggle()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        player.prev()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        player.next()
      } else if (event.key.toLowerCase() === 'r') {
        player.replay()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [player, cardOpen])

  const regenerateMutation = useMutation({
    mutationFn: () => {
      const request = article?.request
      if (!request) throw new Error('缺少原始生成参数')
      return apiPost<GenerateResponse>('/api/articles/generate', {
        level: request.level,
        length: request.length,
        newWords: Math.max(10, Math.min(100, request.newWords)),
        topic: request.topic || undefined,
        genre: request.genre,
        supplement: request.supplement || undefined,
        voice: voice ?? request.voice,
        seed: Math.floor(Math.random() * 0xffffffff),
      })
    },
    onSuccess: (response) => {
      toast.success('新版本已生成')
      if (response.demoFallback && response.notice) toast.info(response.notice)
      router.push(`/article/${response.articleId}`)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '重新生成失败'),
  })

  function openWord(selectionValue: WordSelection) {
    setSelection(selectionValue)
    setCardOpen(true)
  }

  function handleSidebarWord(word: WordMeta, rect: DOMRect) {
    const element = document.querySelector(
      `[data-word-lemma="${CSS.escape(word.lemma)}"]`,
    ) as HTMLElement | null
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    openWord({
      lemma: word.lemma,
      surface: word.surface,
      sentenceIndex: word.firstSentenceIndex,
      rect,
    })
  }

  function handleVoiceChange(next: VoiceId) {
    player.stop()
    setTtsRequested(false)
    setVoice(next)
    setCardOpen(false)
  }

  function exportText() {
    if (!article) return
    const groups = new Map<number, string[]>()
    for (const sentence of article.sentences) {
      const list = groups.get(sentence.p) ?? []
      list.push(sentence.text)
      groups.set(sentence.p, list)
    }
    const body = [...groups.values()].map((list) => list.join(' ')).join('\n\n')
    const content = `${article.title}\n\n${body}\n\n— ${article.metrics.wordCount} words · LexiLoop\n`
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${article.title.replace(/[\\/:*?"<>|]/g, ' ').trim() || 'lexiloop'}.txt`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  if (articleQuery.isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton className="h-[32rem] w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      </div>
    )
  }

  if (articleQuery.isError || !article) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-16 text-center">
        <p className="font-serif text-xl font-semibold">文章不存在或读取失败</p>
        <p className="text-sm text-muted-foreground">
          {articleQuery.error instanceof Error
            ? articleQuery.error.message
            : '它可能已被删除，或数据库尚未初始化。'}
        </p>
        <div className="flex justify-center gap-2">
          <Button onClick={() => articleQuery.refetch()}>重试</Button>
          <Button variant="outline" asChild>
            <Link href="/library">返回历史</Link>
          </Button>
        </div>
      </div>
    )
  }

  const request = article.request
  const warnings = request?.warnings ?? []
  const isDemoFallback = request?.generatedWith === 'demo-fallback'
  const isDemoSeed = article.kind === 'demo' && !isDemoFallback
  const levelLabel = LEVEL_META[article.level]?.label ?? article.level
  const genreLabel =
    article.genre && GENRE_META[article.genre as Genre]
      ? GENRE_META[article.genre as Genre].label
      : '导入'
  const targetCount = article.metrics.targetCount
  const showForgetUnderline = settingsData?.settings.showForgetUnderline ?? false
  const ttsStarting = startTtsMutation.isPending || article.audio.status === 'running'

  return (
    <div className="space-y-5 pb-52 lg:pb-36">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/library">
            <ArrowLeft /> 历史
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Select value={voice ?? 'female-us'} onValueChange={(value) => handleVoiceChange(value as VoiceId)}>
            <SelectTrigger className="h-8 w-[8.5rem] text-xs" aria-label="切换音色">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VOICES.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportText}>
            <Download /> 导出
          </Button>
          {article.kind !== 'imported' && request ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => regenerateMutation.mutate()}
              disabled={regenerateMutation.isPending}
            >
              {regenerateMutation.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <WandSparkles />
              )}
              再生成
            </Button>
          ) : null}
          {article.audio.ready < article.sentenceCount ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => startTtsMutation.mutate()}
              disabled={ttsStarting}
            >
              {ttsStarting ? <Loader2 className="animate-spin" /> : <AudioLines />}
              {article.kind === 'imported'
                ? article.audio.ready > 0
                  ? '继续合成音频'
                  : '生成跟读音频'
                : '继续合成音频'}
            </Button>
          ) : null}
        </div>
      </div>

      {isDemoFallback ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-600/25 bg-amber-500/8 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <span>
            <span className="font-medium text-foreground">预置 Demo 文章：</span>
            没有配置 LLM，本次难度 / 篇幅 / 目标词参数没有生效。配置{' '}
            <code className="font-mono">LLM_API_KEY</code> 后可生成任意主题。
          </span>
        </div>
      ) : isDemoSeed ? (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-card/60 px-4 py-2.5 text-xs text-muted-foreground">
          <BookOpenText className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span>内置 Demo 文章，可离线阅读与跟读。加词只写入本地示例词库。</span>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
          <span>{warnings.join('；')}</span>
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{levelLabel}</Badge>
          {article.kind === 'imported' ? (
            <Badge variant="secondary">导入</Badge>
          ) : (
            <Badge variant="secondary">{genreLabel}</Badge>
          )}
          {article.demo && article.kind !== 'demo' ? <Badge variant="warning">Demo</Badge> : null}
          {article.metrics.outOfBandCount > 4 ? (
            <Badge variant="danger">含 {article.metrics.outOfBandCount} 个超纲词</Badge>
          ) : null}
          {request?.model ? <Badge variant="outline">{request.model}</Badge> : null}
        </div>
        <h1 className="reader-title text-balance text-3xl leading-tight sm:text-4xl">
          {article.title}
        </h1>
        {article.summaryZh ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{article.summaryZh}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock3 className="size-3" /> {formatDateTimeZh(article.createdAt)}
          </span>
          <span>预计阅读 {article.metrics.estimatedReadingMinutes} 分钟</span>
          <span>{article.sentenceCount} 句</span>
          {article.kind !== 'imported' && targetCount > 0 ? (
            <span>
              目标词覆盖 {(article.metrics.targetCoverage * 100).toFixed(0)}%（{targetCount} 个）
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Card className="paper-card overflow-hidden">
            <CardContent className="p-5 sm:p-8 lg:p-10">
              <ArticleBody
                article={article}
                ignored={ignoredSet}
                added={added}
                activeIndex={player.currentIndex}
                showForgetUnderline={showForgetUnderline}
                onWordClick={openWord}
                onSentencePlay={player.seek}
              />
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-card/60 p-4 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="词数" value={article.metrics.wordCount} />
            <Metric label="句子" value={article.metrics.sentenceCount} />
            <Metric label="生词" value={article.metrics.newCount} tone="new" />
            <Metric label="超纲" value={article.metrics.outOfBandCount} tone="oot" />
            <Metric
              label="生词密度"
              value={`${(article.metrics.newDensity * 100).toFixed(1)}%`}
              hint="≤12% 达标"
            />
            <Metric
              label="目标词"
              value={targetCount > 0 ? `${(article.metrics.targetCoverage * 100).toFixed(0)}%` : '—'}
              hint={targetCount > 0 ? `${article.metrics.targetUsed.length}/${targetCount}` : '导入文章'}
            />
          </div>

          <p className="text-center text-[10px] text-muted-foreground">
            快捷键：空格 播放/暂停 · ←/→ 上一句/下一句 · R 重播当前句
          </p>
        </div>

        <div className="h-fit lg:sticky lg:top-4">
          <ArticleSidebar
            article={article}
            added={added}
            onWordAdded={(lemma) => setAdded((prev) => new Set(prev).add(lemma))}
            onOpenWord={handleSidebarWord}
          />
        </div>
      </div>

      <WordCard
        selection={selection}
        open={cardOpen}
        onOpenChange={setCardOpen}
        articleId={article.id}
        voice={voice ?? 'female-us'}
        added={selection ? added.has(selection.lemma) : false}
        onAdded={(lemma) => setAdded((prev) => new Set(prev).add(lemma))}
      />

      <AudioPlayer
        article={article}
        player={player}
        audioState={article.audio}
        ttsStarting={ttsStarting}
        onRetryFailed={() => {
          setTtsRequested(true)
          startTtsMutation.mutate()
        }}
      />
    </div>
  )
}
