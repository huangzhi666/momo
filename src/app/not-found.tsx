import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg space-y-4 py-24 text-center">
      <p className="font-serif text-5xl font-semibold text-primary/40">404</p>
      <h1 className="font-serif text-2xl font-semibold">页面不存在</h1>
      <p className="text-sm text-muted-foreground">
        链接可能过期，或文章已被删除。回首页生成一篇新的吧。
      </p>
      <Button asChild>
        <Link href="/">回到生成页</Link>
      </Button>
    </div>
  )
}
