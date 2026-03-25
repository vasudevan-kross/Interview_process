import { Skeleton } from '@/components/ui/skeleton'

export default function CampaignDetailLoading() {
  return (
    <div className="p-8 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={`stat-skel-${idx}`} className="bg-white border border-slate-200 rounded-lg p-4">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-4 w-28 mt-3" />
          </div>
        ))}
      </div>
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <Skeleton className="h-4 w-24" />
        <div className="mt-3 flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, idx) => (
            <Skeleton key={`filter-skel-${idx}`} className="h-8 w-24 rounded-md" />
          ))}
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {['resume', 'technical', 'voice', 'completed'].map((stage) => (
            <div key={`board-skel-${stage}`} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-16 mt-2" />
                </div>
                <Skeleton className="h-6 w-8 rounded-md" />
              </div>
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, idx) => (
                  <div key={`card-skel-${stage}-${idx}`} className="bg-white border border-slate-200 rounded-lg p-3">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-40 mt-2" />
                    <Skeleton className="h-3 w-28 mt-2" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
