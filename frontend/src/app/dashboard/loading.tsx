import { SkeletonPageHeader, SkeletonStatCards, SkeletonTable } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader />
      <SkeletonStatCards />
      <SkeletonTable rows={4} cols={4} />
    </div>
  )
}
