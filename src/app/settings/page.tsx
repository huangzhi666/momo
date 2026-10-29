'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  AudioLines,
  BookOpenText,
  Check,
  Database,
  KeyRound,
  Loader2,
  RefreshCw,
  RotateCcw,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress, Skeleton } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { apiGet, apiPatch, apiPost } from '@/lib/client/api'
import {
  LENGTHS,
  LEVELS,
  LEVEL_META,
  OXFORD_MODES,
  OXFORD_MODE_META,
  VOICES,
  type ArticleLength,
  type Level,
  type OxfordMode,
  type VoiceId,
} from '@/lib/constants'
import type { AppSettings } from '@/lib/settings'
import { useStatus } from '@/hooks/use-status'
import { formatDateTimeZh, relativeTimeZh } from '@/lib/utils'

interface SyncProgress {
  running: boolean
  phase: 'idle' | 'count' | 'fetch' | 'done' | 'error'
  requests: number
  found: number
  queue: number
  totalReported: number
  message: string
  startedAt: string | null
  finishedAt: string | null
  error: string | null
}

interface AdditionRow {
  lemma: string
  vocId: string | null
  spelling: string
  status: 'pending' | 'synced' | 'failed'
  error: string | null
  simulated: boolean
  createdAt: string
  updatedAt: string
}

interface AdditionsResponse {
  additions: AdditionRow[]
}

const PHASE_LABEL: Record<SyncProgress['phase'], string> = {
  idle: '待同步',
  count: '统计时间窗',
  fetch: '抓取记录',
  done: '同步完成',
  error: '同步失败',
}

function StatusLine({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 py-2.5 last:border-0">
      <div className="min-w-0">
        <p className="text-xs font-medium">{label}</p>
        {hint ? <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="shrink-0 text-right text-xs">{children}</div>
    </div>
  )
}

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const { data: status } = useStatus()
  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiGet<{ settings: AppSettings }>('/api/settings'),
  })
  const { data: additionsData } = useQuery({
    queryKey: ['additions'],
    queryFn: () => apiGet<AdditionsResponse>('/api/additions'),
  })
  const { data: initialSync } = useQuery({
    queryKey: ['sync'],
    queryFn: () => apiGet<SyncProgress>('/api/vocab/sync'),
    refetchInterval: (query) => (query.state.data?.running ? 5000 : false),
  })

  const [sync, setSync] = useState<SyncProgress | null>(null)
  const [level, setLevel] = useState<Level>('gaokao')
  const [length, setLength] = useState<ArticleLength>(320)
  const [newWords, setNewWords] = useState(12)
  const [voice, setVoice] = useState<VoiceId>('female-us')
  const [oxfordMode, setOxfordMode] = useState<OxfordMode>('oxford3000')
  const [showForgetUnderline, setShowForgetUnderline] = useState(false)
  const applied = useRef(false)
  const streamRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (initialSync) setSync(initialSync)
  }, [initialSync])

  useEffect(() => {
    if (applied.current || !settingsData?.settings) return
    applied.current = true
    const settings = settingsData.settings
    setLevel(settings.level)
    setLength(settings.length as ArticleLength)
    setNewWords(settings.newWords)
    setVoice(settings.voice as VoiceId)
    setOxfordMode(settings.oxfordMode)
    setShowForgetUnderline(settings.showForgetUnderline)
  }, [settingsData])

  function openStream() {
    if (streamRef.current) return
    const source = new EventSource('/api/vocab/sync/stream')
    streamRef.current = source
    const handle = (event: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(event.data) as SyncProgress
        setSync(parsed)
        if (!parsed.running && (parsed.phase === 'done' || parsed.phase === 'error')) {
          source.close()
          streamRef.current = null
          queryClient.invalidateQueries({ queryKey: ['status'] })
          queryClient.invalidateQueries({ queryKey: ['targets'] })
          queryClient.invalidateQueries({ queryKey: ['sync'] })
          if (parsed.phase === 'done') toast.success(parsed.message, { duration: 8000 })
          else toast.error(parsed.message)
        }
      } catch {
        // ignore malformed event
      }
    }
    source.addEventListener('progress', handle as EventListener)
    source.addEventListener('done', handle as EventListener)
    source.onerror = () => {
      source.close()
      streamRef.current = null
    }
  }

  useEffect(() => {
    if (initialSync?.running) openStream()
    return () => {
      streamRef.current?.close()
      streamRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSync?.running])

  const syncMutation = useMutation({
    mutationFn: () => apiPost<SyncProgress>('/api/vocab/sync'),
    onSuccess: (state) => {
      setSync(state)
      openStream()
      queryClient.invalidateQueries({ queryKey: ['sync'] })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '同步失败'),
  })

  const demoMutation = useMutation({
    mutationFn: () => apiPost<{ message: string }>('/api/vocab/demo', { resetVocab: true }),
    onSuccess: (data) => {
      toast.success(data.message)
      queryClient.invalidateQueries({ queryKey: ['status'] })
      queryClient.invalidateQueries({ queryKey: ['targets'] })
      queryClient.invalidateQueries({ queryKey: ['articles'] })
      queryClient.invalidateQueries({ queryKey: ['sync'] })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '载入失败'),
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      apiPatch<{ settings: AppSettings }>('/api/settings', {
        level,
        length,
        newWords,
        voice,
        oxfordMode,
        showForgetUnderline,
      }),
    onSuccess: () => {
      toast.success('默认设置已保存')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['status'] })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '保存失败'),
  })

  const retryMutation = useMutation({
    mutationFn: (lemma?: string) =>
      apiPost<{ results: { lemma: string; ok: boolean; message: string }[] }>(
        '/api/additions/retry',
        lemma ? { lemma } : {},
      ),
    onSuccess: (data) => {
      const failed = data.results.filter((item) => !item.ok)
      if (data.results.length === 0) toast.info('没有需要重试的失败记录')
      else if (failed.length === 0) toast.success(`重试成功 ${data.results.length} 个`)
      else toast.warning(`${data.results.length - failed.length} 个成功，${failed.length} 个仍失败`)
      queryClient.invalidateQueries({ queryKey: ['additions'] })
      queryClient.invalidateQueries({ queryKey: ['status'] })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '重试失败'),
  })

  const additions = additionsData?.additions ?? []
  const failedCount = additions.filter((item) => item.status === 'failed').length
  const syncPercent = sync?.totalReported
    ? Math.min(100, Math.round((sync.found / sync.totalReported) * 100))
    : sync?.phase === 'done'
      ? 100
      : 0

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="设置"
        description="Token 只存在服务端 .env.local，永不下发前端。所有业务数据、词典和音频都在本地。"
        actions={
          <Badge variant={status?.demo ? 'warning' : 'success'}>
            {status?.demo ? 'Demo 模式' : '墨墨已配置'}
          </Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <RefreshCw className="size-4 text-primary" /> 墨墨词库同步
              </CardTitle>
              <CardDescription>
                按 next_study_date 时间窗二分全量抓取，请求间隔 ≥2 秒，放后台执行，不阻塞阅读与生成。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {status?.demo ? (
                <div className="rounded-lg border border-amber-600/25 bg-amber-500/8 p-3 text-xs leading-relaxed text-muted-foreground">
                  <p className="font-medium text-foreground">当前是 Demo 模式，无法同步墨墨。</p>
                  <p className="mt-1">
                    在 <code className="font-mono">.env.local</code> 里填写{' '}
                    <code className="font-mono">MAIMEMO_API_TOKEN</code>，重启服务后即可同步。
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => syncMutation.mutate()}
                  disabled={status?.demo || sync?.running || syncMutation.isPending}
                >
                  {sync?.running ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  {sync?.running ? '同步中…' : '同步词库'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => demoMutation.mutate()}
                  disabled={!status?.demo || demoMutation.isPending}
                >
                  <RotateCcw /> 载入 Demo 词库
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  上次同步：{relativeTimeZh(status?.lastSyncAt)}
                </span>
              </div>

              {sync ? (
                <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{sync.message}</span>
                    <Badge variant={sync.phase === 'error' ? 'danger' : sync.running ? 'warning' : 'outline'}>
                      {PHASE_LABEL[sync.phase]}
                    </Badge>
                  </div>
                  <Progress value={syncPercent} />
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] tabular-nums text-muted-foreground">
                    <span>请求 {sync.requests}</span>
                    <span>已找到 {sync.found}</span>
                    <span>待处理窗口 {sync.queue}</span>
                    <span>计数合计 {sync.totalReported}</span>
                    {sync.finishedAt ? <span>完成于 {formatDateTimeZh(sync.finishedAt)}</span> : null}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  全量约 34 次请求 / 70 秒；中断后会从上次时间窗继续。24 小时 TTL，过期后生成文章时后台刷新。
                </p>
              )}

              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div className="rounded-lg border border-border p-2.5">
                  <p className="text-[10px] text-muted-foreground">词库</p>
                  <p className="mt-0.5 font-semibold tabular-nums">{status?.vocabCount ?? '—'}</p>
                </div>
                <div className="rounded-lg border border-border p-2.5">
                  <p className="text-[10px] text-muted-foreground">来源</p>
                  <p className="mt-0.5 font-semibold">{status?.vocabSource ?? '—'}</p>
                </div>
                <div className="rounded-lg border border-border p-2.5">
                  <p className="text-[10px] text-muted-foreground">ECDICT</p>
                  <p className="mt-0.5 font-semibold tabular-nums">
                    {status?.ecdictWords.toLocaleString('en-US') ?? '—'}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-2.5">
                  <p className="text-[10px] text-muted-foreground">数据目录</p>
                  <p className="mt-0.5 font-semibold">{status?.dataDir ?? 'data'}/</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 className="size-4 text-primary" /> 默认生成参数
              </CardTitle>
              <CardDescription>新生效于下一次打开生成页。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>默认难度</Label>
                  <Select value={level} onValueChange={(value) => setLevel(value as Level)}>
                    <SelectTrigger>
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
                <div className="space-y-2">
                  <Label>默认篇幅</Label>
                  <Select
                    value={String(length)}
                    onValueChange={(value) => setLength(Number(value) as ArticleLength)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LENGTHS.map((item) => (
                        <SelectItem key={item} value={String(item)}>
                          {item} 词
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="default-new-words">默认生词数</Label>
                  <Input
                    id="default-new-words"
                    type="number"
                    min={10}
                    max={100}
                    value={newWords}
                    onChange={(event) => setNewWords(Number(event.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>默认音色</Label>
                  <Select value={voice} onValueChange={(value) => setVoice(value as VoiceId)}>
                    <SelectTrigger>
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
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Oxford 基础词表</Label>
                  <Select
                    value={oxfordMode}
                    onValueChange={(value) => setOxfordMode(value as OxfordMode)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OXFORD_MODES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {OXFORD_MODE_META[item].label}
                          {item === 'off'
                            ? '（只保留功能词）'
                            : item === 'a1b2'
                              ? '（与 Oxford 3000 等价）'
                              : '（A1–B2）'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">给已选词库里的遗忘词加虚线下划线</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    默认关闭。只影响视觉，不影响生词判定。
                  </p>
                </div>
                <Switch checked={showForgetUnderline} onCheckedChange={setShowForgetUnderline} />
              </div>

              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="animate-spin" /> : <Check />}
                保存默认设置
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BookOpenText className="size-4 text-primary" /> 加词记录
                  </CardTitle>
                  <CardDescription>三态：pending / synced / failed。失败可重试。</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => retryMutation.mutate(undefined)}
                  disabled={failedCount === 0 || retryMutation.isPending}
                >
                  <RotateCcw /> 重试全部失败
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {additions.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  还没有加词记录。阅读文章时点生词，选择「加入墨墨学习」。
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-left text-xs">
                    <thead>
                      <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">词</th>
                        <th className="py-2 pr-3 font-medium">状态</th>
                        <th className="py-2 pr-3 font-medium">方式</th>
                        <th className="py-2 pr-3 font-medium">错误 / 时间</th>
                        <th className="py-2 font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {additions.map((row) => (
                        <tr key={row.lemma} className="border-b border-border/50 last:border-0">
                          <td className="py-2 pr-3">
                            <span className="font-medium">{row.lemma}</span>
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              {row.spelling !== row.lemma ? row.spelling : ''}
                            </span>
                          </td>
                          <td className="py-2 pr-3">
                            <Badge
                              variant={
                                row.status === 'synced'
                                  ? 'success'
                                  : row.status === 'failed'
                                    ? 'danger'
                                    : 'warning'
                              }
                            >
                              {row.status === 'synced' ? (
                                <Check />
                              ) : row.status === 'failed' ? (
                                <X />
                              ) : (
                                <Loader2 className="animate-spin" />
                              )}
                              {row.status}
                            </Badge>
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground">
                            {row.simulated ? 'Demo 模拟' : '墨墨 API'}
                          </td>
                          <td className="max-w-[16rem] py-2 pr-3">
                            {row.error ? (
                              <span className="block truncate text-destructive" title={row.error}>
                                {row.error}
                              </span>
                            ) : null}
                            <span className="block text-[10px] text-muted-foreground">
                              {formatDateTimeZh(row.updatedAt)}
                            </span>
                          </td>
                          <td className="py-2">
                            {row.status === 'failed' ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => retryMutation.mutate(row.lemma)}
                                disabled={retryMutation.isPending}
                              >
                                重试
                              </Button>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <KeyRound className="size-3.5 text-primary" /> 服务状态
              </CardTitle>
            </CardHeader>
            <CardContent>
              {status ? (
                <>
                  <StatusLine
                    label="墨墨 Token"
                    hint="MAIMEMO_API_TOKEN · 只读服务端"
                  >
                    <Badge variant={status.maimemo.configured ? 'success' : 'warning'}>
                      {status.maimemo.configured ? '已配置' : '未配置'}
                    </Badge>
                  </StatusLine>
                  <StatusLine label="LLM" hint="LLM_API_KEY / LLM_BASE_URL / LLM_MODEL">
                    <Badge variant={status.llm.configured ? 'success' : 'outline'}>
                      {status.llm.configured ? status.llm.model : '未配置'}
                    </Badge>
                    {status.llm.baseUrlHost ? (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {status.llm.baseUrlHost}
                      </p>
                    ) : null}
                  </StatusLine>
                  <StatusLine label="TTS" hint="Azure > ElevenLabs > OpenAI > 本地/静音">
                    <Badge variant={status.tts.configured ? 'success' : 'warning'}>
                      {status.tts.provider}
                    </Badge>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {status.tts.local ? 'Windows 本地朗读' : status.tts.configured ? '云端' : '静音占位'}
                    </p>
                  </StatusLine>
                  <StatusLine label="ECDICT" hint="本地 SQLite 主词典">
                    <Badge variant={status.ecdictReady ? 'success' : 'danger'}>
                      {status.ecdictWords.toLocaleString('en-US')} 词
                    </Badge>
                  </StatusLine>
                  <StatusLine label="Oxford 模式">
                    <Badge variant="outline">{OXFORD_MODE_META[status.oxfordMode].label}</Badge>
                  </StatusLine>
                </>
              ) : (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Database className="size-3.5 text-primary" /> 本地数据
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-[11px] leading-relaxed text-muted-foreground">
              <p>
                数据库 <code className="font-mono">data/lexiloop.db</code>；音频{' '}
                <code className="font-mono">data/audio/</code>。
              </p>
              <p>ECDICT 原始 CSV 在 data/raw/，不会提交到 Git。</p>
              <p>断网后，已生成文章和已合成音频仍然可用。</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Sparkles className="size-3.5 text-primary" /> 常用命令
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-[11px]">
              {[
                ['初始化（下载 ECDICT + Demo）', 'pnpm setup'],
                ['全量同步词库', 'pnpm db:sync'],
                ['重建 Demo 内容', 'pnpm db:seed -- --force'],
                ['单元测试', 'pnpm test'],
              ].map(([label, command]) => (
                <div key={command} className="rounded-md border border-border bg-muted/30 p-2">
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                  <code className="mt-0.5 block font-mono text-[11px] text-foreground">{command}</code>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-amber-600/20 bg-amber-500/5">
            <CardContent className="flex gap-2.5 p-4 text-[11px] leading-relaxed text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
              <div>
                <p className="font-medium text-foreground">已知限制</p>
                <p className="mt-1">
                  不做录音与发音评分；不导出整篇音频；不抓 URL、不解析 PDF/EPUB。Demo 模式的「加入墨墨」只做本地模拟。
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
