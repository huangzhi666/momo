'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, Filter, Loader2, Plus, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { apiPost } from '@/lib/client/api'
import type { ArticleRowDTO, WordMeta } from '@/lib/types'
import { cn } from '@/lib/utils'

type FilterMode = 'all' | 'band' | 'freq'

interface AddResponse {
  added: boolean
  addedCount: number
  already: boolean
  simulated: boolean
  message: string
  vocabId: string | null
}

function sortWords(words: WordMeta[]): WordMeta[] {
  return [...words].sort((a, b) => {
    const freqA = a.frq ?? Number.MAX_SAFE_INTEGER
    const freqB = b.frq ?? Number.MAX_SAFE_INTEGER
    if (freqA !== freqB) return freqA - freqB
    return b.count - a.count
  })
}

function WordRow({
  word,
  added,
  onAdd,
  onOpen,
  adding,
}: {
  word: WordMeta
  added: boolean
  onAdd: (word: WordMeta) => void
  onOpen: (word: WordMeta, rect: DOMRect) => void
  adding: boolean
}) {
  return (
    <div className="group flex items-start gap-2 rounded-lg border border-transparent px-2 py-2 transition-colors hover:border-border hover:bg-accent/40">
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={(event) => onOpen(word, event.currentTarget.getBoundingClientRect())}
      >
        <span className="flex items-baseline gap-1.5">
          <span className="truncate text-sm font-medium">{word.lemma}</span>
          {word.phonetic ? (
            <span className="truncate text-[10px] text-muted-foreground">{word.phonetic}</span>
          ) : null}
          {word.count > 1 ? (
            <span className="text-[10px] text-muted-foreground">×{word.count}</span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          {word.translation ?? (word.band ? '难度带内' : '超出当前难度带')}
        </span>
      </button>
      {added ? (
        <span className="mt-1 flex size-7 items-center justify-center rounded-md text-emerald-600">
          <Check className="size-3.5" />
        </span>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="mt-0.5 shrink-0 opacity-60 group-hover:opacity-100"
          aria-label={`把 ${word.lemma} 加入墨墨学习`}
          disabled={adding}
          onClick={() => onAdd(word)}
        >
          {adding ? <Loader2 className="animate-spin" /> : <Plus />}
        </Button>
      )}
    </div>
  )
}

export function ArticleSidebar({
  article,
  added,
  onWordAdded,
  onOpenWord,
}: {
  article: ArticleRowDTO
  added: Set<string>
  onWordAdded: (lemma: string) => void
  onOpenWord: (word: WordMeta, rect: DOMRect) => void
}) {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<FilterMode>('all')
  const [limit, setLimit] = useState(article.kind === 'imported' ? 30 : 100)
  const [addingLemma, setAddingLemma] = useState<string | null>(null)
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null)

  const newWords = article.wordMeta.filter((word) => word.status === 'new')
  const outWords = article.wordMeta.filter((word) => word.status === 'out_of_band')

  const filterWords = (words: WordMeta[]) =>
    words.filter((word) => {
      if (filter === 'band') return word.band
      if (filter === 'freq') return word.frq !== null && word.frq <= 20000
      return true
    })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['article', article.id] })
    queryClient.invalidateQueries({ queryKey: ['status'] })
    queryClient.invalidateQueries({ queryKey: ['targets'] })
  }

  const addMutation = useMutation({
    mutationFn: (word: WordMeta) =>
      apiPost<AddResponse>('/api/words/add', {
        lemma: word.lemma,
        spelling: word.surface,
        articleId: article.id,
      }),
    onSuccess: (result, word) => {
      if (result.added) {
        toast.success(result.message)
        onWordAdded(word.lemma)
      } else toast.info(result.message)
      invalidate()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '加入失败'),
    onSettled: () => setAddingLemma(null),
  })

  const batchMutation = useMutation({
    mutationFn: async (words: WordMeta[]) => {
      const list = words.filter((word) => !added.has(word.lemma)).slice(0, 10)
      setBatchProgress({ done: 0, total: list.length })
      let addedCount = 0
      let failed = 0
      for (let index = 0; index < list.length; index += 1) {
        const word = list[index]
        try {
          const result = await apiPost<AddResponse>('/api/words/add', {
            lemma: word.lemma,
            spelling: word.surface,
            articleId: article.id,
          })
          if (result.added) {
            addedCount += 1
            onWordAdded(word.lemma)
          }
        } catch {
          failed += 1
        }
        setBatchProgress({ done: index + 1, total: list.length })
      }
      return { addedCount, failed, total: list.length }
    },
    onSuccess: ({ addedCount, failed, total }) => {
      if (total === 0) toast.info('没有可添加的词')
      else if (failed === 0) toast.success(`已添加 ${addedCount} 个词到墨墨学习`)
      else toast.warning(`${addedCount} 个成功，${failed} 个失败，可在设置页重试`)
      invalidate()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '批量添加失败'),
    onSettled: () => setBatchProgress(null),
  })

  function handleAdd(word: WordMeta) {
    setAddingLemma(word.lemma)
    addMutation.mutate(word)
  }

  const visibleNew = useMemo(
    () => sortWords(filterWords(newWords)).slice(0, limit),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [newWords, filter, limit],
  )
  const visibleOut = useMemo(
    () => sortWords(filterWords(outWords)).slice(0, limit),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [outWords, filter, limit],
  )

  const topTen = sortWords(filterWords(newWords)).slice(0, 10)

  return (
    <div className="space-y-3">
      {article.kind === 'imported' && article.metrics.newDensity > 0.08 ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-600/25 bg-amber-500/8 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
          <span>
            生词密度 {(article.metrics.newDensity * 100).toFixed(1)}%，对你偏难。建议先看高频词，或一键添加前 10 个。
          </span>
        </div>
      ) : null}

      <Card>
        <CardHeader className="gap-2 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">生词与超纲词</CardTitle>
            <Badge variant="outline" className="tabular-nums">
              {newWords.length + outWords.length}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-1 text-[10px]">
            <Filter className="size-3 text-muted-foreground" />
            {(
              [
                ['all', '全部'],
                ['band', '仅难度带内'],
                ['freq', '仅高频'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={cn(
                  'rounded-full border px-2 py-0.5 transition-colors',
                  filter === value
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-transparent text-muted-foreground hover:bg-accent',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="pt-1">
          <Tabs defaultValue="new">
            <TabsList className="w-full">
              <TabsTrigger value="new" className="flex-1">
                生词 <span className="ml-1 tabular-nums text-new">{newWords.length}</span>
              </TabsTrigger>
              <TabsTrigger value="out" className="flex-1">
                超纲 <span className="ml-1 tabular-nums text-oot">{outWords.length}</span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="new" className="mt-2 space-y-0.5">
              {visibleNew.length ? (
                visibleNew.map((word) => (
                  <WordRow
                    key={word.lemma}
                    word={word}
                    added={added.has(word.lemma)}
                    onAdd={handleAdd}
                    onOpen={onOpenWord}
                    adding={addingLemma === word.lemma}
                  />
                ))
              ) : (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  {filter === 'all'
                    ? '这篇没有难度带内的生词。'
                    : '当前筛选下没有词，换成「全部」看看。'}
                </p>
              )}
              {newWords.length > limit ? (
                <Button variant="ghost" size="sm" className="w-full" onClick={() => setLimit(999)}>
                  显示全部 {newWords.length} 个
                </Button>
              ) : null}
            </TabsContent>
            <TabsContent value="out" className="mt-2 space-y-0.5">
              {visibleOut.length ? (
                visibleOut.map((word) => (
                  <WordRow
                    key={word.lemma}
                    word={word}
                    added={added.has(word.lemma)}
                    onAdd={handleAdd}
                    onOpen={onOpenWord}
                    adding={addingLemma === word.lemma}
                  />
                ))
              ) : (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  没有超纲词。专有名词不计入。
                </p>
              )}
              {outWords.length > limit ? (
                <Button variant="ghost" size="sm" className="w-full" onClick={() => setLimit(999)}>
                  显示全部 {outWords.length} 个
                </Button>
              ) : null}
            </TabsContent>
          </Tabs>

          {article.kind === 'imported' && topTen.length > 0 ? (
            <div className="mt-3 border-t border-border/70 pt-3">
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={batchMutation.isPending}
                onClick={() => batchMutation.mutate(topTen)}
              >
                {batchMutation.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {batchProgress
                  ? `添加中 ${batchProgress.done}/${batchProgress.total}`
                  : `一键添加前 ${topTen.length} 个`}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="bg-card/50">
        <CardContent className="space-y-1.5 p-3 text-[10px] leading-relaxed text-muted-foreground">
          <p>
            <span className="text-new">生词</span>：不在词库、不在基础表、在难度带内。
          </p>
          <p>
            <span className="text-oot">超纲</span>：不在词库、不在基础表、超出难度带。
          </p>
          <p>Oxford 3000 永远不标注；同一 lemma 第 2 次出现颜色变淡。</p>
        </CardContent>
      </Card>
    </div>
  )
}
