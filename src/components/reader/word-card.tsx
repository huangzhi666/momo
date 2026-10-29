'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ChevronRight,
  EyeOff,
  Info,
  Loader2,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose } from '@/components/ui/dialog'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { SheetContent } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/progress'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useIgnoredStore } from '@/stores/ignored'
import { apiGet, apiPost } from '@/lib/client/api'
import { EXAM_TAG_LABELS, type VoiceId } from '@/lib/constants'
import type { WordCardData } from '@/lib/types'
import { cn, splitSenses } from '@/lib/utils'

export interface WordSelection {
  lemma: string
  surface: string
  sentenceIndex: number
  rect: DOMRect
}

interface ExamplesResponse {
  examples: { text: string; translation?: string }[]
  configured: boolean
  cached: boolean
}

interface AddWordResponse {
  added: boolean
  addedCount: number
  already: boolean
  simulated: boolean
  message: string
  vocabId: string | null
}

interface PersonalResponse {
  personal: {
    interpretations: string[]
    phrases: string[]
    notes: string[]
  } | null
}

const STATUS_META: Record<
  WordCardData['status'],
  { label: string; variant: 'new' | 'oot' | 'success' | 'outline' }
> = {
  new: { label: '生词', variant: 'new' },
  out_of_band: { label: '超纲', variant: 'oot' },
  known: { label: '已知', variant: 'success' },
  basic: { label: '基础词', variant: 'outline' },
  proper: { label: '专名', variant: 'outline' },
  ignored: { label: '忽略', variant: 'outline' },
}

function CardBody({
  selection,
  articleId,
  voice,
  added,
  onAdded,
  onClose,
  mobile,
}: {
  selection: WordSelection
  articleId?: string
  voice: VoiceId
  added: boolean
  onAdded: (lemma: string) => void
  onClose: () => void
  mobile: boolean
}) {
  const queryClient = useQueryClient()
  const [showPersonal, setShowPersonal] = useState(false)
  const [pronouncing, setPronouncing] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const ignore = useIgnoredStore((state) => state.ignore)

  useEffect(() => {
    setShowPersonal(false)
  }, [selection.lemma])

  const cardQuery = useQuery({
    queryKey: ['word', selection.lemma, articleId ?? '', selection.sentenceIndex],
    queryFn: () => {
      const params = new URLSearchParams()
      if (selection.surface) params.set('surface', selection.surface)
      if (articleId) params.set('articleId', articleId)
      params.set('sentence', String(selection.sentenceIndex))
      return apiGet<WordCardData>(
        `/api/words/${encodeURIComponent(selection.lemma)}?${params.toString()}`,
      )
    },
    retry: 1,
  })
  const card = cardQuery.data

  const examplesQuery = useQuery({
    queryKey: ['word-examples', selection.lemma],
    queryFn: () =>
      apiGet<ExamplesResponse>(`/api/words/${encodeURIComponent(selection.lemma)}/examples`),
    enabled: Boolean(card && !card.example && card.aiExamples.length === 0),
    staleTime: Infinity,
    retry: 0,
  })

  const personalQuery = useQuery({
    queryKey: ['word-personal', selection.lemma],
    queryFn: () =>
      apiGet<PersonalResponse>(`/api/words/${encodeURIComponent(selection.lemma)}/personal`),
    enabled: showPersonal && Boolean(card?.inVocab) && !card?.demo,
    staleTime: 5 * 60 * 1000,
    retry: 0,
  })

  const addMutation = useMutation({
    mutationFn: () =>
      apiPost<AddWordResponse>('/api/words/add', {
        lemma: card?.lemma ?? selection.lemma,
        spelling: card?.surface ?? selection.surface ?? selection.lemma,
        articleId: articleId || undefined,
      }),
    onSuccess: (result) => {
      if (result.added) toast.success(result.message)
      else toast.info(result.message)
      if (result.added) onAdded(card?.lemma ?? selection.lemma)
      queryClient.invalidateQueries({ queryKey: ['word'] })
      queryClient.invalidateQueries({ queryKey: ['additions'] })
      queryClient.invalidateQueries({ queryKey: ['status'] })
      if (articleId) queryClient.invalidateQueries({ queryKey: ['article', articleId] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '加入失败'),
  })

  async function pronounce() {
    if (!card) return
    setPronouncing(true)
    try {
      const result = await apiGet<{ url: string; provider: string }>(
        `/api/tts/pronounce?word=${encodeURIComponent(card.lemma)}&voice=${voice}`,
      )
      audioRef.current?.pause()
      const audio = new Audio(result.url)
      audioRef.current = audio
      await audio.play()
      if (result.provider === 'mock') {
        toast.info('当前使用静音占位音轨；配置 TTS 后可听到真人发音。', { duration: 5000 })
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '发音加载失败')
    } finally {
      setPronouncing(false)
    }
  }

  if (cardQuery.isLoading) {
    return (
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-7 w-7 rounded-full" />
        </div>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (cardQuery.isError || !card) {
    return (
      <div className="space-y-3 p-4 text-sm">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium">词卡读取失败</p>
          {mobile ? (
            <button onClick={onClose} aria-label="关闭" className="text-muted-foreground">
              <X className="size-4" />
            </button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {cardQuery.error instanceof Error ? cardQuery.error.message : '请稍后重试'}
        </p>
        <Button size="sm" variant="outline" onClick={() => cardQuery.refetch()}>
          重试
        </Button>
      </div>
    )
  }

  const senses = splitSenses(card.translation)
  const definitions = splitSenses(card.definition)
  const status = STATUS_META[card.status] ?? STATUS_META.basic
  const alreadyInVocab = card.inVocab || added
  const aiExamples =
    card.aiExamples.length > 0 ? card.aiExamples : (examplesQuery.data?.examples ?? [])
  const showAi = aiExamples.length > 0
  const personal = personalQuery.data?.personal

  return (
    <div className="flex max-h-[inherit] flex-col overflow-hidden">
      <div className="border-b border-border/70 bg-card/40 px-4 pb-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h3 className="font-serif text-2xl font-semibold tracking-tight">{card.lemma}</h3>
              {card.phonetic ? (
                <span className="font-sans text-xs text-muted-foreground">/{card.phonetic}/</span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge variant={status.variant}>{status.label}</Badge>
              {card.oxford ? <Badge variant="outline">Oxford 3000</Badge> : null}
              {card.knownResponse === 'FORGET' || card.knownResponse === 'VAGUE' ? (
                <Badge variant="warning">
                  {card.knownResponse === 'FORGET' ? '上次忘记' : '上次模糊'}
                </Badge>
              ) : null}
              {card.surface.toLowerCase() !== card.lemma.toLowerCase() ? (
                <Badge variant="outline">原文 {card.surface}</Badge>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={pronounce}
              disabled={pronouncing}
              aria-label="播放发音"
              title="播放发音"
            >
              {pronouncing ? <Loader2 className="animate-spin" /> : <Volume2 />}
            </Button>
            {mobile ? (
              <DialogClose asChild>
                <Button variant="ghost" size="icon-sm" aria-label="关闭">
                  <X />
                </Button>
              </DialogClose>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3.5">
        <div>
          {senses.length ? (
            <div className="space-y-1 text-sm leading-relaxed">
              {senses.slice(0, 6).map((line, index) => (
                <p key={index} className={index === 0 ? 'text-foreground' : 'text-muted-foreground'}>
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">ECDICT 暂无中文释义。</p>
          )}
          {definitions.length ? (
            <details className="mt-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none text-[11px] hover:text-foreground">
                英文释义
              </summary>
              <div className="mt-1.5 space-y-1 border-l-2 border-border pl-2.5">
                {definitions.slice(0, 4).map((line, index) => (
                  <p key={index}>{line.replace(/^[a-z]+\.\s*/i, '')}</p>
                ))}
              </div>
            </details>
          ) : null}
        </div>

        {card.tags.length || card.collins || card.frq ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {card.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {EXAM_TAG_LABELS[tag] ?? tag.toUpperCase()}
              </Badge>
            ))}
            {card.collins ? (
              <Badge variant="outline">柯林斯 {'★'.repeat(Math.min(5, card.collins))}</Badge>
            ) : null}
            {card.frq ? <Badge variant="outline">词频 #{card.frq}</Badge> : null}
          </div>
        ) : null}

        {card.forms.length ? (
          <div className="rounded-lg border border-border/70 bg-muted/30 p-2.5">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">词形</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
              {card.forms.map((form, index) => (
                <span key={`${form.label}-${index}`}>
                  <span className="text-muted-foreground">{form.label}</span>{' '}
                  <span className="font-medium">{form.value}</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {card.originalSentence ? (
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">本文原句</p>
            <p className="font-serif text-sm leading-relaxed text-foreground/90">
              “{card.originalSentence}”
            </p>
          </div>
        ) : null}

        <div>
          <p className="mb-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            例句
            {showAi ? (
              <Badge variant="outline" className="ml-1 px-1.5 py-0 text-[9px]">
                <Sparkles className="size-2.5" /> AI 生成
              </Badge>
            ) : null}
          </p>
          {card.example ? (
            <div className="space-y-0.5 text-sm">
              <p className="font-serif leading-relaxed">{card.example.text}</p>
              {card.example.translation ? (
                <p className="text-xs text-muted-foreground">{card.example.translation}</p>
              ) : null}
            </div>
          ) : examplesQuery.isLoading ? (
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : showAi ? (
            <div className="space-y-2">
              {aiExamples.map((example, index) => (
                <div key={index} className="space-y-0.5 text-sm">
                  <p className="font-serif leading-relaxed">{example.text}</p>
                  {example.translation ? (
                    <p className="text-xs text-muted-foreground">{example.translation}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              ECDICT 无例句。
              {examplesQuery.data?.configured === false
                ? ' 配置 LLM 后可生成带「AI 生成」标记的例句。'
                : examplesQuery.isError
                  ? ' 例句生成失败，稍后再试。'
                  : ''}
            </p>
          )}
        </div>

        {card.inVocab && !card.demo ? (
          <div>
            {!showPersonal ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-1 text-[11px] text-muted-foreground"
                onClick={() => setShowPersonal(true)}
              >
                <ChevronRight className="size-3" /> 查看墨墨个人内容
              </Button>
            ) : personalQuery.isLoading ? (
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> 读取个人释义 / 例句 / 助记…
              </p>
            ) : personal &&
              personal.interpretations.length + personal.phrases.length + personal.notes.length >
                0 ? (
              <div className="space-y-1.5 rounded-lg border border-border/70 p-2.5 text-[11px]">
                {personal.interpretations.map((line, index) => (
                  <p key={`i-${index}`}>释义：{line}</p>
                ))}
                {personal.phrases.map((line, index) => (
                  <p key={`p-${index}`}>例句：{line}</p>
                ))}
                {personal.notes.map((line, index) => (
                  <p key={`n-${index}`}>助记：{line}</p>
                ))}
              </div>
            ) : (
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Info className="size-3" /> 墨墨个人内容为空（只显示你自己创建的内容）。
              </p>
            )}
          </div>
        ) : null}
      </div>

      <div className="border-t border-border/70 bg-card/60 px-4 py-3">
        <div className="flex items-center gap-2">
          {alreadyInVocab ? (
            <Button variant="outline" size="sm" className="flex-1" disabled>
              <Check /> 已在词库 ✓
            </Button>
          ) : (
            <Button
              size="sm"
              variant="amber"
              className="flex-1"
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending}
            >
              {addMutation.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
              加入墨墨学习
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              ignore(card.lemma)
              toast.info(`已忽略「${card.lemma}」，本篇不再标注。`)
              onClose()
            }}
            title="本篇不再标注这个生词"
          >
            <EyeOff /> 忽略
          </Button>
        </div>
        {card.demo ? (
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            Demo 模式：加词只写入本地示例词库，不会同步到墨墨。
          </p>
        ) : card.additionStatus === 'failed' ? (
          <p className="mt-1.5 text-[10px] text-destructive">上次加入失败，可在设置页重试。</p>
        ) : (
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            通过 <code className="font-mono">/memo/vocabulary/query</code> 换 voc_id，再调{' '}
            <code className="font-mono">add_words</code>；重复点击不会重复请求。
          </p>
        )}
      </div>
    </div>
  )
}

export function WordCard({
  selection,
  open,
  onOpenChange,
  articleId,
  voice,
  added,
  onAdded,
}: {
  selection: WordSelection | null
  open: boolean
  onOpenChange: (open: boolean) => void
  articleId?: string
  voice: VoiceId
  added: boolean
  onAdded: (lemma: string) => void
}) {
  const mobile = useMediaQuery('(max-width: 767px)')
  const virtualRef = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () => selection?.rect ?? new DOMRect(0, 0, 0, 0),
      },
    }),
    [selection?.rect],
  )

  if (!selection) return null

  const body = (
    <CardBody
      selection={selection}
      articleId={articleId}
      voice={voice}
      added={added}
      onAdded={onAdded}
      onClose={() => onOpenChange(false)}
      mobile={mobile}
    />
  )

  if (mobile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <SheetContent title={`${selection.lemma} 词卡`}>{body}</SheetContent>
      </Dialog>
    )
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverContent align="start" side="bottom" collisionPadding={16}>
        {body}
      </PopoverContent>
    </Popover>
  )
}
