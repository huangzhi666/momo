'use client'

import { Play } from 'lucide-react'
import type { ArticleRowDTO, SentenceWithTokens, TokenRecord } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { WordSelection } from './word-card'

interface ArticleBodyProps {
  article: ArticleRowDTO
  ignored: Set<string>
  added: Set<string>
  activeIndex: number
  showForgetUnderline: boolean
  onWordClick: (selection: WordSelection) => void
  onSentencePlay: (index: number) => void
}

function tokenClass(token: TokenRecord, ignored: Set<string>, added: Set<string>): string {
  if (ignored.has(token.lemma) || added.has(token.lemma)) return ''
  if (token.status === 'new') return cn('tok tok-new', token.repeat && 'tok-repeat')
  if (token.status === 'out_of_band') return cn('tok tok-oot', token.repeat && 'tok-repeat')
  return ''
}

function Sentence({
  sentence,
  ignored,
  added,
  active,
  showForgetUnderline,
  onWordClick,
  onSentencePlay,
}: {
  sentence: SentenceWithTokens
  ignored: Set<string>
  added: Set<string>
  active: boolean
  showForgetUnderline: boolean
  onWordClick: (selection: WordSelection) => void
  onSentencePlay: (index: number) => void
}) {
  const pieces: React.ReactNode[] = []
  let cursor = 0
  const tokens = [...sentence.tokens].sort((a, b) => a.start - b.start)

  for (const token of tokens) {
    if (token.start > cursor) {
      pieces.push(sentence.text.slice(cursor, token.start))
    }
    if (token.start < cursor) {
      // 理论上不会发生；跳过重叠 token，避免文本重复
      continue
    }
    const isIgnored = ignored.has(token.lemma)
    const isAdded = added.has(token.lemma)
    const knownForget =
      token.status === 'known' &&
      showForgetUnderline &&
      (token.knownResponse === 'FORGET' || token.knownResponse === 'VAGUE')
    const className = tokenClass(token, ignored, added)

    if (!isIgnored && !isAdded && (token.status === 'new' || token.status === 'out_of_band')) {
      pieces.push(
        <button
          key={token.idx}
          type="button"
          className={className}
          data-word-lemma={token.lemma}
          data-word-surface={token.surface}
          data-sentence-index={sentence.index}
          aria-label={`${token.surface}，${token.status === 'new' ? '生词' : '超纲词'}，查看词卡`}
          onClick={(event) => {
            event.stopPropagation()
            onWordClick({
              lemma: token.lemma,
              surface: token.surface,
              sentenceIndex: sentence.index,
              rect: event.currentTarget.getBoundingClientRect(),
            })
          }}
        >
          {token.surface}
        </button>,
      )
    } else if (knownForget && !isIgnored && !isAdded) {
      pieces.push(
        <span
          key={token.idx}
          className="tok-known-forget"
          data-word-lemma={token.lemma}
          title="已选词库 · 上次遗忘/模糊"
        >
          {token.surface}
        </span>,
      )
    } else {
      pieces.push(
        <span key={token.idx} data-word-lemma={token.lemma}>
          {token.surface}
        </span>,
      )
    }
    cursor = token.end
  }
  if (cursor < sentence.text.length) pieces.push(sentence.text.slice(cursor))

  return (
    <span
      className={cn('sentence', active && 'sentence-active')}
      data-sentence-index={sentence.index}
      onClick={() => onSentencePlay(sentence.index)}
      role="presentation"
    >
      <button
        type="button"
        className="sentence-play"
        aria-label={`播放第 ${sentence.index + 1} 句`}
        title={`播放第 ${sentence.index + 1} 句`}
        onClick={(event) => {
          event.stopPropagation()
          onSentencePlay(sentence.index)
        }}
      >
        <Play className="size-3 fill-current" />
      </button>
      {pieces}
      {sentence.audio?.status === 'failed' ? (
        <span
          className="ml-1 inline-block size-1.5 rounded-full bg-destructive align-middle"
          title="该句音频合成失败，可在工具栏重试"
        />
      ) : null}
      {' '}
    </span>
  )
}

export function ArticleBody({
  article,
  ignored,
  added,
  activeIndex,
  showForgetUnderline,
  onWordClick,
  onSentencePlay,
}: ArticleBodyProps) {
  const paragraphs = new Map<number, SentenceWithTokens[]>()
  for (const sentence of article.sentences) {
    const list = paragraphs.get(sentence.p) ?? []
    list.push(sentence)
    paragraphs.set(sentence.p, list)
  }

  return (
    <div className="article-body">
      {[...paragraphs.entries()].map(([p, sentences]) => (
        <p key={p}>
          {sentences.map((sentence) => (
            <Sentence
              key={sentence.index}
              sentence={sentence}
              ignored={ignored}
              added={added}
              active={sentence.index === activeIndex}
              showForgetUnderline={showForgetUnderline}
              onWordClick={onWordClick}
              onSentencePlay={onSentencePlay}
            />
          ))}
        </p>
      ))}
    </div>
  )
}
