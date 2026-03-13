import { SkeletonPageHeader, SkeletonTable } from '@/components/ui/skeleton'

export default function VoiceScreeningLoading() {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader />
      <SkeletonTable rows={4} cols={6} />
    </div>
  )
}
