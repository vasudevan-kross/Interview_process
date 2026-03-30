'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { SkeletonPageHeader, SkeletonTable } from '@/components/ui/skeleton'
import { deleteVideoCampaign, listVideoCampaigns, type VideoInterviewCampaign } from '@/lib/api/video-interviews'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Pencil, Trash2, Plus, Video, Clock, ArrowRight, Users } from 'lucide-react'

export default function VideoInterviewsPage() {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<VideoInterviewCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  useEffect(() => {
    fetchCampaigns()
  }, [])

  const fetchCampaigns = async () => {
    try {
      setLoading(true)
      const data = await listVideoCampaigns()
      setCampaigns(data)
    } catch {
      toast.error('Failed to load video interview campaigns')
    } finally {
      setLoading(false)
    }
  }

  const requestDeleteCampaign = (campaignId: string) => {
    setPendingDeleteId(campaignId)
    setDeleteDialogOpen(true)
  }

  const confirmDeleteCampaign = async () => {
    if (!pendingDeleteId) return
    try {
      await deleteVideoCampaign(pendingDeleteId)
      setCampaigns(campaigns.filter((campaign) => campaign.id !== pendingDeleteId))
      toast.success('Campaign deleted')
    } catch {
      toast.error('Failed to delete campaign')
    } finally {
      setDeleteDialogOpen(false)
      setPendingDeleteId(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonPageHeader />
        <SkeletonTable />
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-12">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Video Interviews</h1>
          <p className="mt-1 text-sm text-slate-500">Manage autonomous AI avatar-led candidate assessments.</p>
        </div>
        <Link href="/dashboard/video-interviews/campaigns/new">
          <Button className="bg-indigo-600 hover:bg-indigo-700 shadow-sm font-medium gap-2">
            <Plus className="h-4 w-4" /> New Campaign
          </Button>
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="flex-1 rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 mb-4">
            <Video className="h-6 w-6 text-slate-400" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900">No campaigns yet</h3>
          <p className="mt-2 text-sm text-slate-500 max-w-sm mx-auto">Create your first video interview campaign to start assessing candidates automatically.</p>
          <div className="mt-6">
            <Link href="/dashboard/video-interviews/campaigns/new">
              <Button variant="outline" className="shadow-sm font-medium">Create Campaign</Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:shadow-md hover:border-indigo-200 hover:-translate-y-0.5 cursor-pointer overflow-hidden"
              onClick={() => router.push(`/dashboard/video-interviews/campaigns/${campaign.id}`)}
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              
              <div className="p-6 pb-5 flex-1 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-slate-900 tracking-tight leading-tight line-clamp-1" title={campaign.name}>
                      {campaign.name}
                    </h3>
                    <p className="text-sm text-indigo-600 font-medium line-clamp-1">{campaign.job_role}</p>
                  </div>
                  <div className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${campaign.is_active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                    {campaign.is_active ? 'Active' : 'Draft'}
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
                  <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    {campaign.interview_duration_minutes} min
                  </div>
                  <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                    <Video className="h-3.5 w-3.5 text-slate-400" />
                    {campaign.interview_style.charAt(0).toUpperCase() + campaign.interview_style.slice(1)}
                  </div>
                  <div className="flex items-center gap-1.5 bg-indigo-50/50 px-2 py-1 rounded-md border border-indigo-100/50 text-indigo-700">
                    <Users className="h-3.5 w-3.5" />
                    {campaign.candidate_count || 0} Candidates
                  </div>
                </div>

                <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed h-10">
                  {campaign.description || 'No description provided.'}
                </p>
              </div>

              <div className="grid grid-cols-3 border-t border-slate-100 bg-slate-50/50">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    router.push(`/dashboard/video-interviews/campaigns/${campaign.id}/edit`)
                  }}
                  className="flex items-center justify-center gap-1.5 py-3 text-xs font-semibold text-slate-600 hover:text-indigo-600 hover:bg-slate-100 transition-colors border-r border-slate-100"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <div className="flex items-center justify-center gap-1 py-3 text-xs font-semibold text-indigo-600 group-hover:bg-indigo-50/50 transition-colors border-r border-slate-100 col-span-1">
                  View <ArrowRight className="h-3 w-3" />
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    requestDeleteCampaign(campaign.id)
                  }}
                  className="flex items-center justify-center gap-1.5 py-3 text-xs font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDeleteCampaign}
        title="Delete session link"
        description="This will permanently delete the campaign and its invite links."
        confirmText="Delete"
        variant="destructive"
      />
    </div>
  )
}
