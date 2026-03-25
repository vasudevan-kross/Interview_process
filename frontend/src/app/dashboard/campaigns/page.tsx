'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { TimePicker } from '@/components/ui/time-picker'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Plus, Users, Briefcase, Calendar, Archive, Pencil, Trash2 } from 'lucide-react'
import Link from 'next/link'

interface Campaign {
  id: string
  name: string
  description: string | null
  status: string
  metadata: {
    slots?: Array<{
      name: string
      time_start: string
      time_end: string
    }>
    target_roles?: string[]
  }
  created_at: string
  statistics?: {
    total_candidates?: number
    unique_jobs?: number
    by_stage?: Record<string, number>
  }
}

export default function CampaignsPage() {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'active' | 'completed' | 'archived' | 'all'>('active')
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteCampaignId, setDeleteCampaignId] = useState<string | null>(null)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    status: 'active',
    slots: [] as Array<{ name: string; time_start: string; time_end: string }>,
  })

  useEffect(() => {
    loadCampaigns()
  }, [filter])

  const loadCampaigns = async () => {
    try {
      setLoading(true)
      const params = filter !== 'all' ? { status: filter } : {}
      const response = await apiClient.listCampaigns(params)
      setCampaigns(response.campaigns || [])
    } catch (error) {
      console.error('Error loading campaigns:', error)
    } finally {
      setLoading(false)
    }
  }

  const openDeleteDialog = (campaignId: string) => {
    setDeleteCampaignId(campaignId)
    setShowDeleteDialog(true)
  }

  const confirmDeleteCampaign = async () => {
    if (!deleteCampaignId) return
    const campaignId = deleteCampaignId
    setShowDeleteDialog(false)
    setDeleteCampaignId(null)

    try {
      await apiClient.deleteCampaign(campaignId)
      toast.success('Campaign deleted successfully')
      loadCampaigns()
    } catch (error: any) {
      console.error('Error deleting campaign:', error)
      toast.error(error.response?.data?.detail || 'Failed to delete campaign')
    }
  }

  const openEditDialog = (campaign: Campaign) => {
    setEditingCampaignId(campaign.id)
    setEditForm({
      name: campaign.name,
      description: campaign.description || '',
      status: campaign.status,
      slots: campaign.metadata?.slots || [],
    })
    setShowEditDialog(true)
  }

  const handleEditAddSlot = () => {
    setEditForm({
      ...editForm,
      slots: [...editForm.slots, { name: '', time_start: '', time_end: '' }],
    })
  }

  const handleEditRemoveSlot = (index: number) => {
    setEditForm({
      ...editForm,
      slots: editForm.slots.filter((_, i) => i !== index),
    })
  }

  const handleEditUpdateSlot = (index: number, field: string, value: string) => {
    const nextSlots = [...editForm.slots]
    nextSlots[index] = { ...nextSlots[index], [field]: value }
    setEditForm({ ...editForm, slots: nextSlots })
  }

  const handleSaveEdit = async () => {
    if (!editingCampaignId) return
    if (!editForm.name.trim()) {
      toast.error('Campaign name is required')
      return
    }

    const invalidSlot = editForm.slots.find(
      (slot) => !slot.name?.trim() || !slot.time_start?.trim() || !slot.time_end?.trim()
    )
    if (invalidSlot) {
      toast.error('Please complete all slot fields (name, start time, end time)')
      return
    }

    setSavingEdit(true)
    try {
      await apiClient.updateCampaign(editingCampaignId, {
        name: editForm.name,
        description: editForm.description || null,
        status: editForm.status,
        metadata: {
          slots: editForm.slots,
        },
      })
      toast.success('Campaign updated successfully')
      setShowEditDialog(false)
      setEditingCampaignId(null)
      loadCampaigns()
    } catch (error: any) {
      console.error('Error updating campaign:', error)
      toast.error(error.response?.data?.detail || 'Failed to update campaign')
    } finally {
      setSavingEdit(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'completed':
        return 'bg-blue-100 text-blue-800'
      case 'archived':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading) {
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

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Hiring Campaigns</h1>
          <p className="text-sm text-slate-600 mt-1">
            Organize candidates by hiring drives with multiple jobs and interview slots
          </p>
        </div>
        <Link href="/dashboard/campaigns/create">
          <Button className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-2" />
            New Campaign
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={filter === 'active' ? 'default' : 'outline'}
          onClick={() => setFilter('active')}
          className={filter === 'active' ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
        >
          Active
        </Button>
        <Button
          variant={filter === 'completed' ? 'default' : 'outline'}
          onClick={() => setFilter('completed')}
          className={filter === 'completed' ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
        >
          Completed
        </Button>
        <Button
          variant={filter === 'archived' ? 'default' : 'outline'}
          onClick={() => setFilter('archived')}
          className={filter === 'archived' ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
        >
          Archived
        </Button>
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          onClick={() => setFilter('all')}
          className={filter === 'all' ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
        >
          All
        </Button>
      </div>

      {/* Campaign Cards */}
      {campaigns.length === 0 ? (
        <div className="text-center py-16">
          <Briefcase className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">No campaigns found</h3>
          <p className="text-slate-600 mb-6">
            {filter === 'active'
              ? 'Create your first campaign to start organizing candidates'
              : `No ${filter} campaigns yet`}
          </p>
          <Link href="/dashboard/campaigns/create">
            <Button className="bg-indigo-600 hover:bg-indigo-700">
              <Plus className="w-4 h-4 mr-2" />
              Create Campaign
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              onClick={() => router.push(`/dashboard/campaigns/${campaign.id}`)}
              className="bg-white border border-slate-200 rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer"
            >
                {/* Campaign Header */}
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-slate-900 mb-1">
                      {campaign.name}
                    </h3>
                    <span
                      className={`inline-block px-2 py-1 rounded-md text-xs font-medium ${getStatusColor(
                        campaign.status
                      )}`}
                    >
                      {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        openEditDialog(campaign)
                      }}
                      className="h-8 w-8"
                      aria-label="Edit campaign"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        openDeleteDialog(campaign.id)
                      }}
                      className="h-8 w-8 border-red-200 text-red-600 hover:bg-red-50"
                      aria-label="Delete campaign"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Description */}
                {campaign.description && (
                  <p className="text-sm text-slate-600 mb-4 line-clamp-2">
                    {campaign.description}
                  </p>
                )}

                {/* Statistics */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-400" />
                    <div>
                      <div className="text-2xl font-semibold text-slate-900">
                        {campaign.statistics?.total_candidates || 0}
                      </div>
                      <div className="text-xs text-slate-600">Candidates</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-slate-400" />
                    <div>
                      <div className="text-2xl font-semibold text-slate-900">
                        {campaign.statistics?.unique_jobs || 0}
                      </div>
                      <div className="text-xs text-slate-600">Job Roles</div>
                    </div>
                  </div>
                </div>

                {/* Slots */}
                {campaign.metadata?.slots && campaign.metadata.slots.length > 0 && (
                  <div className="border-t border-slate-200 pt-3">
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <Calendar className="w-3 h-3" />
                      <span>{campaign.metadata.slots.length} interview slot(s)</span>
                    </div>
                  </div>
                )}

                {/* Created Date */}
                <div className="text-xs text-slate-500 mt-3">
                  Created {new Date(campaign.created_at).toLocaleDateString()}
                </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={confirmDeleteCampaign}
        title="Delete Campaign"
        description="This will permanently remove the campaign and all associated data. This action cannot be undone."
        confirmText="Delete Campaign"
        cancelText="Cancel"
        variant="destructive"
      />

      {showEditDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold">Campaign Settings</h2>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-sm font-medium text-slate-900 mb-3">Basic Information</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Campaign Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-slate-300 rounded-md"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      placeholder="e.g., Summer 2024 Hiring"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Description
                    </label>
                    <textarea
                      className="w-full px-3 py-2 border border-slate-300 rounded-md"
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      rows={3}
                      placeholder="Brief description of this hiring campaign"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                    <select
                      className="w-full px-3 py-2 border border-slate-300 rounded-md"
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    >
                      <option value="active">Active</option>
                      <option value="completed">Completed</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-slate-900">Interview Slots</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEditAddSlot}
                    className="text-xs"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Slot
                  </Button>
                </div>

                {editForm.slots.length === 0 ? (
                  <div className="border border-slate-200 rounded-lg p-6 text-center text-slate-500 text-sm">
                    No interview slots configured. Click "Add Slot" to create one.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {editForm.slots.map((slot, index) => (
                      <div key={index} className="border border-slate-200 rounded-lg p-4 space-y-3">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">Slot Name</label>
                              <input
                                type="text"
                                className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                                value={slot.name}
                                onChange={(e) => handleEditUpdateSlot(index, 'name', e.target.value)}
                                placeholder="e.g., Morning Slot"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Start Time</label>
                                <TimePicker
                                  value={slot.time_start}
                                  onChange={(value) => handleEditUpdateSlot(index, 'time_start', value)}
                                  placeholder="Select start time"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">End Time</label>
                                <TimePicker
                                  value={slot.time_end}
                                  onChange={(value) => handleEditUpdateSlot(index, 'time_end', value)}
                                  placeholder="Select end time"
                                />
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => handleEditRemoveSlot(index)}
                            className="ml-3 p-1.5 text-red-600 hover:bg-red-50 rounded"
                            title="Remove slot"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowEditDialog(false)}
                disabled={savingEdit}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
