import { SkeletonPageHeader, SkeletonStatCards, SkeletonTable } from '@/components/ui/skeleton'

export default function CodingInterviewsLoading() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader />
      <SkeletonStatCards />
      <SkeletonTable rows={5} cols={7} />
    </div>
  )
}
