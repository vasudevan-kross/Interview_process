'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { listCampaigns, deleteCampaign, Campaign } from '@/lib/api/voice-screening'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PageHeader } from '@/components/ui/page-header'
import { SkeletonPageHeader } from '@/components/ui/skeleton'
import { Plus, Loader2, Sparkles, Users, Calendar, Phone, Briefcase, Edit, Trash2, MoreVertical } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'

export default function CampaignsPage() {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [campaignToDelete, setCampaignToDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    loadCampaigns()
  }, [])

  const loadCampaigns = async () => {
    try {
      setLoading(true)
      const data = await listCampaigns()
      setCampaigns(data || [])
    } catch (err: any) {
      console.error('Failed to load campaigns:', err)
      setError(err.response?.data?.detail || 'Failed to load campaigns')
    } finally {
      setLoading(false)
    }
  }

  const getPersonaBadgeColor = (persona: string) => {
    switch (persona) {
      case 'professional': return 'bg-blue-100 text-blue-800'
      case 'casual': return 'bg-green-100 text-green-800'
      case 'technical': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getCandidateTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'fresher': return 'bg-yellow-100 text-yellow-800'
      case 'experienced': return 'bg-indigo-100 text-indigo-800'
      case 'general': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const handleDelete = (campaignId: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent card click
    setCampaignToDelete(campaignId)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!campaignToDelete) return
    try {
      setDeleting(true)
      await deleteCampaign(campaignToDelete)
      toast.success('Campaign deleted successfully!')
      loadCampaigns()
    } catch (err: any) {
      console.error('Failed to delete campaign:', err)
      toast.error('Failed to delete campaign')
    } finally {
      setDeleting(false)
      setCampaignToDelete(null)
      setDeleteDialogOpen(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto py-8 space-y-6">
        <SkeletonPageHeader />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border border-slate-200 rounded-lg p-6 space-y-3 bg-white animate-pulse">
              <div className="h-5 bg-slate-100 rounded w-3/4" />
              <div className="h-4 bg-slate-100 rounded w-1/2" />
              <div className="h-4 bg-slate-100 rounded w-full" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8">
      <PageHeader
        title="Voice Screening Campaigns"
        description="Manage AI-powered voice interview configurations"
        action={
          <Link href="/dashboard/voice-screening/campaigns/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Campaign
            </Button>
          </Link>
        }
      />

      {/* Navigation Tabs */}
      <div className="flex gap-2 border-b mb-8 mt-6">
        <button className="px-4 py-2 font-medium text-indigo-600 border-b-2 border-indigo-600">
          <Briefcase className="h-4 w-4 inline-block mr-2" />
          Campaigns
        </button>
        <Link href="/dashboard/voice-screening">
          <button className="px-4 py-2 font-medium text-gray-500 hover:text-gray-700 border-b-2 border-transparent hover:border-gray-300">
            <Phone className="h-4 w-4 inline-block mr-2" />
            Candidates
          </button>
        </Link>
      </div>

      {error && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-800">{error}</p>
          </CardContent>
        </Card>
      )}

      {campaigns.length === 0 ? (
        <Card className="border border-slate-200 bg-white">
          <CardContent className="py-16 text-center">
            <p className="text-sm font-medium text-slate-900 mb-1">No campaigns yet</p>
            <p className="text-sm text-slate-400 mb-4">
              Create your first AI-powered voice screening campaign
            </p>
            <Link href="/dashboard/voice-screening/campaigns/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Campaign
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => (
            <Card
              key={campaign.id}
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => router.push(`/dashboard/voice-screening/campaigns/${campaign.id}`)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg mb-1">{campaign.name}</CardTitle>
                    <CardDescription className="text-sm">{campaign.job_role}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {campaign.is_active && (
                      <Badge className="bg-green-50 text-green-700 border border-green-200 rounded-md">Active</Badge>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(`/dashboard/voice-screening/campaigns/${campaign.id}/edit`)
                          }}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Campaign
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => handleDelete(campaign.id, e)}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Campaign
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {campaign.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {campaign.description}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Badge className={getPersonaBadgeColor(campaign.interview_persona)}>
                      {campaign.interview_persona}
                    </Badge>
                    <Badge className={getCandidateTypeBadgeColor(campaign.candidate_type)}>
                      {campaign.candidate_type}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-muted-foreground pt-2 border-t">
                    <div className="flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      <span>{campaign.custom_questions.length} questions</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      <span>{campaign.required_fields.length} fields</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-xs text-muted-foreground pt-1">
                    <Calendar className="h-3 w-3" />
                    <span>
                      Created {formatDistanceToNow(new Date(campaign.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title="Delete Campaign"
        description="This will permanently delete the campaign and all associated candidates, interviews, and call history. This action cannot be undone. Are you sure?"
        confirmText="Delete Campaign"
        variant="destructive"
      />
    </div>
  )
}
