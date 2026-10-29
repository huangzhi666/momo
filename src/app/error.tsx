'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[page] error', error)
  }, [error])

  return (
    <div className="mx-auto max-w-lg space-y-4 py-24 text-center">
      <h1 className="font-serif text-2xl font-semibold">页面出错了</h1>
      <p className="text-sm text-muted-foreground">
        {error.message || '未知错误'}。数据仍在本地，可以重试或回首页。
      </p>
      <div className="flex justify-center gap-2">
        <Button onClick={reset}>重试</Button>
        <Button variant="outline" onClick={() => (window.location.href = '/')}>
          回首页
        </Button>
      </div>
    </div>
  )
}
