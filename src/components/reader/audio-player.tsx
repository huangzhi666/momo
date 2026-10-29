'use client'

import Link from 'next/link'
import {
  AlertCircle,
  AudioLines,
  Ban,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  Settings2,
  SkipBack,
  SkipForward,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { SentencePlayer } from '@/hooks/use-sentence-player'
import { GAP_FACTORS, PLAYBACK_RATES } from '@/lib/constants'
import type { ArticleAudioState, ArticleRowDTO } from '@/lib/types'
import { cn, formatDuration } from '@/lib/utils'

export function AudioPlayer({
  article,
  player,
  audioState,
  ttsStarting,
  onRetryFailed,
}: {
  article: ArticleRowDTO
  player: SentencePlayer
  audioState: ArticleAudioState
  ttsStarting: boolean
  onRetryFailed: () => void
}) {
  const ready = audioState.ready
  const total = audioState.total
  const failed = audioState.failed
  const providerLabel =
    audioState.provider === 'local-sapi'
      ? 'Windows 本地朗读'
      : audioState.provider === 'mock'
        ? '静音占位'
        : audioState.provider

  return (
    <div className="audio-bar fixed inset-x-0 bottom-[58px] z-30 border-t border-border lg:bottom-0 lg:left-60">
      <div className="mx-auto w-full max-w-6xl px-3 py-2.5 sm:px-5">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={player.prev}
            aria-label="上一句"
            title="上一句（←）"
          >
            <SkipBack />
          </Button>
          <Button
            size="icon-lg"
            className="size-10 shadow-md"
            onClick={player.toggle}
            aria-label={player.playing ? '暂停' : '播放'}
            title={player.playing ? '暂停（空格）' : '播放（空格）'}
          >
            {player.playing ? <Pause className="size-4" /> : <Play className="ml-0.5 size-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={player.next}
            aria-label="下一句"
            title="下一句（→）"
          >
            <SkipForward />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={player.replay}
            aria-label="重播当前句"
            title="重播当前句（R）"
            className="hidden sm:inline-flex"
          >
            <RotateCcw />
          </Button>

          <div className="min-w-0 flex-1 px-1">
            <p className="truncate font-serif text-[13px] leading-tight text-foreground/90">
              {player.currentSentence || '选择一句开始播放'}
            </p>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="tabular-nums">
                第 {player.currentIndex + 1} / {article.sentenceCount} 句
              </span>
              <span className="hidden tabular-nums sm:inline">
                {formatDuration(player.currentDuration)}
              </span>
              <span className="hidden items-center gap-1 sm:inline-flex">
                <AudioLines className="size-3" />
                {providerLabel}
              </span>
              {ready < total ? (
                <span className="inline-flex items-center gap-1 text-primary">
                  {ttsStarting ? '音频合成中' : '待合成'} {ready}/{total}
                </span>
              ) : null}
              {failed > 0 ? (
                <button
                  type="button"
                  onClick={onRetryFailed}
                  className="inline-flex items-center gap-1 text-destructive hover:underline"
                >
                  <AlertCircle className="size-3" /> {failed} 句失败，重试
                </button>
              ) : null}
            </div>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <Select
              value={String(player.sentenceLoop)}
              onValueChange={(value) => player.setSentenceLoop(Number(value))}
            >
              <SelectTrigger className="h-7 w-[5.4rem] text-[10px]" aria-label="单句循环次数">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 3, 5].map((count) => (
                  <SelectItem key={count} value={String(count)}>
                    单句 ×{count}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant={player.wholeLoop ? 'secondary' : 'ghost'}
              size="icon-sm"
              aria-pressed={player.wholeLoop}
              aria-label="整篇循环"
              title="整篇循环"
              onClick={() => player.setWholeLoop(!player.wholeLoop)}
            >
              <Repeat className={cn(player.wholeLoop && 'text-primary')} />
            </Button>

            <div className="flex items-center rounded-md border border-border bg-card/60 p-0.5">
              <button
                type="button"
                onClick={() => player.setMode('continuous')}
                aria-pressed={player.mode === 'continuous'}
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px]',
                  player.mode === 'continuous'
                    ? 'bg-primary/15 font-medium text-primary'
                    : 'text-muted-foreground',
                )}
              >
                连读
              </button>
              <button
                type="button"
                onClick={() => player.setMode('shadow')}
                aria-pressed={player.mode === 'shadow'}
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px]',
                  player.mode === 'shadow'
                    ? 'bg-primary/15 font-medium text-primary'
                    : 'text-muted-foreground',
                )}
              >
                跟读
              </button>
            </div>

            {player.mode === 'shadow' ? (
              <Select
                value={String(player.gapFactor)}
                onValueChange={(value) => player.setGapFactor(Number(value))}
              >
                <SelectTrigger className="h-7 w-[4.1rem] text-[10px]" aria-label="跟读留白">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GAP_FACTORS.map((factor) => (
                    <SelectItem key={factor} value={String(factor)}>
                      留白 ×{factor}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            <Select
              value={String(player.rate)}
              onValueChange={(value) => player.setRate(Number(value))}
            >
              <SelectTrigger className="h-7 w-[3.9rem] text-[10px]" aria-label="播放速度">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAYBACK_RATES.map((rate) => (
                  <SelectItem key={rate} value={String(rate)}>
                    {rate}×
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-1" role="group" aria-label="按句进度">
          {article.sentences.map((sentence) => (
            <Tooltip key={sentence.index}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="group/segment flex-1 py-1"
                  onClick={() => player.seek(sentence.index)}
                  aria-label={`跳到第 ${sentence.index + 1} 句`}
                >
                  <span
                    className="sentence-segment block"
                    data-ready={Boolean(sentence.audio?.url)}
                    data-active={sentence.index === player.currentIndex}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                第 {sentence.index + 1} 句 · {formatDuration(sentence.audio?.durationMs ?? 0)}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        <div className="mt-1 flex items-center justify-between gap-2 text-[9px] text-muted-foreground md:hidden">
          <span>
            {ready}/{total} 句音频 · {providerLabel}
          </span>
          <div className="flex flex-wrap items-center justify-end gap-1">
            <Select
              value={String(player.sentenceLoop)}
              onValueChange={(value) => player.setSentenceLoop(Number(value))}
            >
              <SelectTrigger className="h-6 w-[4.3rem] text-[9px]" aria-label="单句循环次数">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 3, 5].map((count) => (
                  <SelectItem key={count} value={String(count)}>
                    ×{count}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {player.mode === 'shadow' ? (
              <Select
                value={String(player.gapFactor)}
                onValueChange={(value) => player.setGapFactor(Number(value))}
              >
                <SelectTrigger className="h-6 w-[4.4rem] text-[9px]" aria-label="跟读留白">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GAP_FACTORS.map((factor) => (
                    <SelectItem key={factor} value={String(factor)}>
                      ×{factor}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Button
              variant={player.wholeLoop ? 'secondary' : 'ghost'}
              size="icon-sm"
              aria-label="整篇循环"
              onClick={() => player.setWholeLoop(!player.wholeLoop)}
            >
              <Repeat className={cn('size-3', player.wholeLoop && 'text-primary')} />
            </Button>
            <Select
              value={String(player.rate)}
              onValueChange={(value) => player.setRate(Number(value))}
            >
              <SelectTrigger className="h-6 w-[3.4rem] text-[9px]" aria-label="播放速度">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAYBACK_RATES.map((rate) => (
                  <SelectItem key={rate} value={String(rate)}>
                    {rate}×
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="跟读模式开关"
              title="跟读模式"
              onClick={() =>
                player.setMode(player.mode === 'shadow' ? 'continuous' : 'shadow')
              }
            >
              {player.mode === 'shadow' ? (
                <Badge variant="outline" className="px-1 text-[9px]">
                  跟读
                </Badge>
              ) : (
                <Badge variant="outline" className="px-1 text-[9px]">
                  连读
                </Badge>
              )}
            </Button>
          </div>
        </div>

        {audioState.provider === 'mock' ? (
          <div className="mt-1 flex items-center justify-between gap-2 text-[9px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Ban className="size-3" /> 当前是静音占位音轨：节奏与留白可用，但没有人声。
            </span>
            <Link href="/settings" className="inline-flex items-center gap-0.5 text-primary hover:underline">
              <Settings2 className="size-3" /> 配置 TTS
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  )
}
