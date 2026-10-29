'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  Loader2,
  RefreshCw,
  Settings2,
  Shuffle,
  Sparkles,
  Volume2,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import {
  DEFAULT_SETTINGS,
  GENRES,
  GENRE_META,
  LENGTHS,
  LEVELS,
  LEVEL_META,
  OXFORD_MODE_META,
  VOICES,
  type Genre,
  type Level,
  type VoiceId,
} from '@/lib/constants'
import type { AppSettings } from '@/lib/settings'
import { ApiError, apiGet, apiPost } from '@/lib/client/api'
import { useStatus } from '@/hooks/use-status'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface TargetItem {
  lemma: string
  spelling: string
  gloss: string
}

interface TargetResponse {
  seed: number
  level: string
  total: number
  targets: TargetItem[]
}

interface GenerateResponse {
  articleId: string
  demoFallback: boolean
  notice: string | null
  warnings: string[]
  provider: string
  metrics: { wordCount: number; newCount: number; outOfBandCount: number }
  validation: { acceptable: boolean } | null
}

const LENGTH_HINTS: Record<number, string> = {
  200: '短文',
  320: '高考阅读',
  450: '六级/考研',
  600: '长文',
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: { value: T; label: string; hint?: string }[]
  onChange: (value: T) => void
  ariaLabel: string
}) {
  return (
    <div
      className="flex flex-wrap gap-1 rounded-lg bg-muted p-1"
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all',
              active
                ? 'bg-card text-foreground shadow-sm ring-1 ring-border/60'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="block whitespace-nowrap">{option.label}</span>
            {option.hint ? (
              <span className="mt-0.5 block text-[9px] font-normal text-muted-foreground">
                {option.hint}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export function GenerateForm() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: status } = useStatus()
  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiGet<{ settings: AppSettings }>('/api/settings'),
    staleTime: Infinity,
  })

  const [level, setLevel] = useState<Level>(DEFAULT_SETTINGS.level)
  const [length, setLength] = useState<number>(DEFAULT_SETTINGS.length)
  const [newWords, setNewWords] = useState(DEFAULT_SETTINGS.newWords)
  const [topicMode, setTopicMode] = useState<'random' | 'manual'>('random')
  const [topic, setTopic] = useState('')
  const [genre, setGenre] = useState<Genre | 'random'>('random')
  const [supplement, setSupplement] = useState('')
  const [voice, setVoice] = useState<VoiceId>(DEFAULT_SETTINGS.voice)
  const [seed, setSeed] = useState<number | undefined>(undefined)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const appliedDefaults = useRef(false)
  const startedAt = useRef<number | null>(null)

  useEffect(() => {
    if (appliedDefaults.current || !settingsData?.settings) return
    appliedDefaults.current = true
    const settings = settingsData.settings
    setLevel(settings.level)
    setLength(settings.length)
    setNewWords(settings.newWords)
    setVoice(settings.voice as VoiceId)
  }, [settingsData])

  const maxNew = Math.max(10, Math.floor(length * 0.12))
  const effectiveNew = Math.min(newWords, maxNew)

  useEffect(() => {
    if (newWords > maxNew) setNewWords(maxNew)
  }, [maxNew, newWords])

  const targetsQuery = useQuery({
    queryKey: ['targets', level, effectiveNew, seed ?? 'auto'],
    queryFn: () =>
      apiGet<TargetResponse>(
        `/api/vocab/targets?count=${effectiveNew}&level=${level}${seed ? `&seed=${seed}` : ''}`,
      ),
    enabled: Boolean(status?.vocabCount),
    staleTime: 10_000,
  })

  const sampleSeed = seed ?? targetsQuery.data?.seed
  const targets = targetsQuery.data?.targets ?? []

  const mutation = useMutation({
    mutationFn: async () => {
      setError(null)
      return apiPost<GenerateResponse>('/api/articles/generate', {
        level,
        length,
        newWords: effectiveNew,
        topic: topicMode === 'manual' ? topic.trim() || undefined : undefined,
        genre,
        supplement: supplement.trim() || undefined,
        voice,
        seed: sampleSeed,
      })
    },
    onMutate: () => {
      startedAt.current = Date.now()
      setElapsed(0)
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['articles'] })
      queryClient.invalidateQueries({ queryKey: ['status'] })
      if (response.demoFallback && response.notice) toast.info(response.notice, { duration: 8000 })
      else toast.success('文章已生成，音频正在后台合成。')
      if (response.warnings?.length) {
        toast.warning(response.warnings.slice(0, 2).join('；'), { duration: 9000 })
      }
      router.push(`/article/${response.articleId}`)
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : '生成失败，请重试'
      setError(message)
      toast.error(message)
    },
  })

  useEffect(() => {
    if (!mutation.isPending) return
    const timer = setInterval(() => {
      if (startedAt.current) setElapsed(Math.floor((Date.now() - startedAt.current) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [mutation.isPending])

  const stage = useMemo(() => {
    if (!mutation.isPending) return ''
    if (elapsed < 2) return '采样目标词、读取词库…'
    if (elapsed < 8) return '生成英文文章…'
    if (elapsed < 16) return '校验生词密度、句长与超纲词…'
    if (elapsed < 40) return '仍在生成，必要时会重写一轮…'
    return '比预期慢一些，LLM 可能正在排队…'
  }, [mutation.isPending, elapsed])

  const disabled = mutation.isPending
  const llmReady = status?.llm.configured
  const vocabReady = (status?.vocabCount ?? 0) > 0

  function refreshTargets() {
    setSeed(Math.floor(Math.random() * 0xffffffff))
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault()
        mutation.mutate()
      }}
    >
      <div className="space-y-2.5">
        <Label>难度</Label>
        <Segmented
          value={level}
          ariaLabel="选择难度"
          onChange={setLevel}
          options={LEVELS.map((item) => ({ value: item, label: LEVEL_META[item].label }))}
        />
        <p className="text-[11px] text-muted-foreground">{LEVEL_META[level].description}</p>
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <Label>篇幅</Label>
          <span className="text-[11px] text-muted-foreground">
            {LENGTH_HINTS[length] ?? ''} · 约 {Math.round(length / 200)} 分钟阅读
          </span>
        </div>
        <Segmented
          value={length}
          ariaLabel="选择篇幅"
          onChange={setLength}
          options={LENGTHS.map((item) => ({
            value: item,
            label: `${item} 词`,
            hint: LENGTH_HINTS[item],
          }))}
        />
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="new-words">生词数量</Label>
          <span className="text-xs tabular-nums text-muted-foreground">
            <span className="font-semibold text-new">{effectiveNew}</span> / 上限 {maxNew}
          </span>
        </div>
        <input
          id="new-words"
          type="range"
          min={10}
          max={maxNew}
          step={1}
          value={effectiveNew}
          disabled={disabled}
          onChange={(event) => setNewWords(Number(event.target.value))}
          className="w-full"
        />
        <p className="text-[11px] text-muted-foreground">
          当前篇幅下最多约 {maxNew} 个（12% 密度上限）。默认 12 个。
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>主题</Label>
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            <button
              type="button"
              aria-pressed={topicMode === 'random'}
              onClick={() => setTopicMode('random')}
              className={cn(
                'flex-1 rounded-md px-2 py-1.5 text-xs font-medium',
                topicMode === 'random'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground',
              )}
            >
              随机
            </button>
            <button
              type="button"
              aria-pressed={topicMode === 'manual'}
              onClick={() => setTopicMode('manual')}
              className={cn(
                'flex-1 rounded-md px-2 py-1.5 text-xs font-medium',
                topicMode === 'manual'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground',
              )}
            >
              自定义
            </button>
          </div>
          {topicMode === 'manual' ? (
            <Input
              value={topic}
              maxLength={120}
              disabled={disabled}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="例如：城市夜班护士的故事"
            />
          ) : (
            <p className="rounded-md border border-dashed border-border px-2.5 py-2 text-[11px] text-muted-foreground">
              自动选题，避开最近 5 篇
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>体裁</Label>
          <Select
            value={genre}
            onValueChange={(value) => setGenre(value as Genre | 'random')}
            disabled={disabled}
          >
            <SelectTrigger aria-label="选择体裁">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="random">随机</SelectItem>
              {GENRES.map((item) => (
                <SelectItem key={item} value={item}>
                  {GENRE_META[item].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>目标词</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={refreshTargets}
            disabled={disabled || !vocabReady || targetsQuery.isFetching}
            className="h-7 px-2 text-[11px] text-muted-foreground"
          >
            <Shuffle className={cn('size-3', targetsQuery.isFetching && 'animate-spin')} /> 换一批
          </Button>
        </div>
        <div className="min-h-16 rounded-lg border border-border bg-muted/35 p-2.5">
          {!vocabReady ? (
            <p className="text-xs text-muted-foreground">
              词库为空。先在设置页同步墨墨词库，或载入 Demo 词库。
            </p>
          ) : targetsQuery.isLoading ? (
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <span key={i} className="h-6 w-16 animate-pulse rounded-full bg-muted" />
              ))}
            </div>
          ) : targets.length === 0 ? (
            <p className="text-xs text-muted-foreground">没有可用目标词，请检查词库。</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {targets.slice(0, 12).map((target) => (
                <span
                  key={target.lemma}
                  title={target.gloss || target.spelling}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px]"
                >
                  <span className="font-medium">{target.lemma}</span>
                  {target.gloss ? (
                    <span className="max-w-24 truncate text-[10px] text-muted-foreground">
                      {target.gloss}
                    </span>
                  ) : null}
                </span>
              ))}
              {targets.length > 12 ? (
                <span className="inline-flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                  +{targets.length - 12}
                </span>
              ) : null}
            </div>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          按掌握度加权采样：遗忘 / 模糊优先，学习次数少、久未复习的优先；排除最近 3 篇用过的词。
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="supplement">补充要求</Label>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {supplement.length}/300
          </span>
        </div>
        <Textarea
          id="supplement"
          value={supplement}
          maxLength={300}
          rows={2}
          disabled={disabled}
          onChange={(event) => setSupplement(event.target.value)}
          placeholder="例如：写一个关于城市夜班的护士的故事，多用对话（软约束）"
          className="resize-none"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>音色</Label>
          <Select
            value={voice}
            onValueChange={(value) => setVoice(value as VoiceId)}
            disabled={disabled}
          >
            <SelectTrigger aria-label="选择音色">
              <span className="inline-flex items-center gap-2">
                <Volume2 className="size-3.5 text-muted-foreground" />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              {VOICES.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end pb-0.5 text-[11px] text-muted-foreground">
          播放时变速 0.75–1.15×，不重新合成。跟读留白在阅读器里调。
        </div>
      </div>

      {error ? (
        <div className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-destructive">生成没有成功</p>
            <p className="mt-0.5 break-words text-xs text-muted-foreground">{error}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => mutation.mutate()}>
                重试
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href="/settings">
                  <Settings2 /> 检查配置
                </Link>
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <Button type="submit" size="lg" disabled={disabled} className="w-full">
          {disabled ? (
            <>
              <Loader2 className="animate-spin" />
              生成中 · {elapsed}s
            </>
          ) : (
            <>
              <Sparkles />
              {llmReady ? '生成文章' : '载入 Demo 文章'}
              <ArrowRight className="ml-1" />
            </>
          )}
        </Button>
        {disabled ? (
          <p className="text-center text-[11px] text-muted-foreground">{stage}</p>
        ) : (
          <p className="text-center text-[11px] text-muted-foreground">
            {llmReady
              ? `使用 ${status?.llm.model ?? 'LLM'} 生成；文章先落库，音频随后逐句合成。`
              : '未配置 LLM_API_KEY：将返回预置 Demo 文章，参数不会真正生效。'}
          </p>
        )}
        {!status?.demo ? (
          <p className="text-center text-[10px] text-muted-foreground">
            Oxford 3000 白名单：{OXFORD_MODE_META[status?.oxfordMode ?? 'oxford3000'].label}
          </p>
        ) : null}
      </div>
    </form>
  )
}
