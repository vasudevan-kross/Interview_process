import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('skeleton rounded-md', className)} />
  )
}

export function SkeletonStatCards() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-white p-6 shadow-card">
          <div className="flex items-center justify-between pb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
          <Skeleton className="h-8 w-16 mt-2" />
          <Skeleton className="h-3 w-32 mt-2" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-lg border bg-white overflow-hidden">
      <div className="border-b bg-slate-50/50 px-4 py-3 flex gap-8">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-20" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border-b last:border-0 px-4 py-3 flex gap-8 items-center">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton
              key={j}
              className={cn('h-4', j === 0 ? 'w-40' : j === cols - 1 ? 'w-16' : 'w-24')}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonPageHeader() {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-9 w-32 rounded-md" />
    </div>
  )
}
