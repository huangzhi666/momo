import { Skeleton } from '@/components/ui/progress'

export default function Loading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-12 w-2/3" />
      <Skeleton className="h-4 w-full max-w-xl" />
      <Skeleton className="h-[32rem] w-full rounded-xl" />
    </div>
  )
}
