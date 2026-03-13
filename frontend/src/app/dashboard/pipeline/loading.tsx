import { SkeletonPageHeader, SkeletonStatCards, SkeletonTable } from '@/components/ui/skeleton'

export default function PipelineLoading() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <SkeletonPageHeader />
      <SkeletonStatCards />
      <SkeletonTable rows={8} cols={6} />
    </div>
  )
}
