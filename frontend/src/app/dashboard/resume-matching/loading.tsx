import { SkeletonPageHeader, SkeletonTable } from '@/components/ui/skeleton'

export default function ResumeMatchingLoading() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader />
      <SkeletonTable rows={4} cols={5} />
    </div>
  )
}
