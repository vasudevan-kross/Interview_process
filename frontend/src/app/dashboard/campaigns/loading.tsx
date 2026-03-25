import { Skeleton } from '@/components/ui/skeleton'

export default function CampaignsLoading() {
  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-10 w-40 rounded-md" />
      </div>

      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, idx) => (
          <Skeleton key={`filter-skel-${idx}`} className="h-9 w-24 rounded-md" />
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={`card-skel-${idx}`} className="bg-white border border-slate-200 rounded-lg p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="space-y-2">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-4 w-16 rounded-md" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
            </div>

            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3 mt-2" />

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded" />
                <div>
                  <Skeleton className="h-5 w-10" />
                  <Skeleton className="h-3 w-16 mt-1" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded" />
                <div>
                  <Skeleton className="h-5 w-10" />
                  <Skeleton className="h-3 w-16 mt-1" />
                </div>
              </div>
            </div>

            <div className="mt-4">
              <Skeleton className="h-3 w-32" />
            </div>

            <div className="mt-3">
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
