'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Code,
  Calendar,
  Clock,
  Users,
  Search,
  Plus,
  Eye,
  Trash2,
  Loader2,
  Filter,
  Copy,
  Share2,
  GitFork,
  Pencil,
  FileText,
  Bot,
} from 'lucide-react'
import { VoiceCreateModal } from '@/components/coding-interviews/VoiceCreateModal'
import { listInterviews, deleteInterview, generateShareableLink, cloneInterview, type Interview } from '@/lib/api/coding-interviews'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { PageHeader } from '@/components/ui/page-header'
import { SkeletonTable } from '@/components/ui/skeleton'
import { useOrg } from '@/contexts/OrganizationContext'

export default function CodingInterviewsPage() {
  const router = useRouter()
  const { can } = useOrg()
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [cloningId, setCloningId] = useState<string | null>(null)
  const [voiceModalOpen, setVoiceModalOpen] = useState(false)

  useEffect(() => {
    fetchInterviews()
  }, [statusFilter])

  const fetchInterviews = async () => {
    try {
      setLoading(true)
      const params: any = { limit: 50, offset: 0 }
      if (statusFilter !== 'all') {
        params.status_filter = statusFilter
      }
      const response = await listInterviews(params)
      setInterviews(response.interviews)
    } catch (error: any) {
      toast.error(error.message || 'Failed to load interviews')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = (interviewId: string) => {
    setPendingDeleteId(interviewId)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!pendingDeleteId) return
    try {
      await deleteInterview(pendingDeleteId)
      toast.success('Interview deleted successfully')
      fetchInterviews()
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete interview')
    } finally {
      setDeleteDialogOpen(false)
      setPendingDeleteId(null)
    }
  }

  const handleCopyLink = (accessToken: string) => {
    const link = generateShareableLink(accessToken)
    navigator.clipboard.writeText(link)
    toast.success('Interview link copied to clipboard!')
  }

  const handleClone = async (interviewId: string) => {
    setCloningId(interviewId)
    try {
      const result = await cloneInterview(interviewId)
      toast.success(`Cloned as "${result.title}"`)
      fetchInterviews()
    } catch (error: any) {
      toast.error(error.message || 'Failed to clone interview')
    } finally {
      setCloningId(null)
    }
  }

  const handleShareWhatsApp = (accessToken: string, title: string) => {
    const link = generateShareableLink(accessToken)
    const message = `Interview: ${title}\n\nJoin link: ${link}`
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`
    window.open(whatsappUrl, '_blank')
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      scheduled: 'border-blue-200 bg-blue-50 text-blue-700',
      in_progress: 'border-green-200 bg-green-50 text-green-700',
      completed: 'border-slate-200 bg-slate-50 text-slate-600',
      expired: 'border-red-200 bg-red-50 text-red-700',
    }

    return (
      <Badge className={styles[status] || styles.scheduled}>
        {status.replace('_', ' ')}
      </Badge>
    )
  }

  const getInterviewTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      coding: 'border-indigo-200 bg-indigo-50 text-indigo-700',
      testing: 'border-amber-200 bg-amber-50 text-amber-700',
      both: 'border-purple-200 bg-purple-50 text-purple-700',
      devops: 'border-orange-200 bg-orange-50 text-orange-700',
      sql: 'border-green-200 bg-green-50 text-green-700',
      system_design: 'border-pink-200 bg-pink-50 text-pink-700',
      fullstack: 'border-cyan-200 bg-cyan-50 text-cyan-700',
      data_science: 'border-teal-200 bg-teal-50 text-teal-700',
    }

    const labels: Record<string, string> = {
      coding: 'Coding',
      testing: 'Testing',
      both: 'Both',
      devops: 'DevOps',
      sql: 'SQL',
      system_design: 'Sys Design',
      fullstack: 'Fullstack',
      data_science: 'Data Sci',
    }

    return (
      <Badge className={styles[type] || styles.coding}>
        {labels[type] || type}
      </Badge>
    )
  }

  const computeEffectiveStatus = (interview: Interview): string => {
    const now = new Date()
    const endTime = new Date(interview.scheduled_end_time)
    const graceMs = (interview.grace_period_minutes || 0) * 60 * 1000
    const effectiveEnd = new Date(endTime.getTime() + graceMs)

    if (interview.status === 'scheduled' && now > effectiveEnd) return 'expired'
    if (interview.status === 'in_progress' && now > effectiveEnd) return 'completed'
    return interview.status
  }

  const filteredInterviews = interviews.filter((interview) =>
    interview.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const counts = {
    total: interviews.length,
    inProgress: interviews.filter((i) => computeEffectiveStatus(i) === 'in_progress').length,
    completed: interviews.filter((i) => computeEffectiveStatus(i) === 'completed').length,
    scheduled: interviews.filter((i) => computeEffectiveStatus(i) === 'scheduled').length,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Technical Assessments"
        description="Create and manage time-bound technical assessments across all domains."
        action={can('interview:create') ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setVoiceModalOpen(true)}>
              <Bot className="mr-2 h-4 w-4" />
              AI Assistant
            </Button>
            <Button onClick={() => router.push('/dashboard/coding-interviews/create')}>
              <Plus className="mr-2 h-4 w-4" />
              Create Interview
            </Button>
          </div>
        ) : undefined}
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Total', value: counts.total },
          { label: 'In Progress', value: counts.inProgress },
          { label: 'Completed', value: counts.completed },
          { label: 'Scheduled', value: counts.scheduled },
        ].map((s) => (
          <Card key={s.label} className="border border-slate-200 bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-slate-900">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table Card */}
      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Interviews</CardTitle>
          <CardDescription>Manage your coding and testing interviews</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search interviews..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700"
              >
                <option value="all">All Status</option>
                <option value="scheduled">Scheduled</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="expired">Expired</option>
              </select>
            </div>
          </div>

          {loading ? (
            <SkeletonTable rows={5} cols={7} />
          ) : filteredInterviews.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm font-medium text-slate-900 mb-1">
                {searchQuery ? 'No interviews match your search' : 'No interviews yet'}
              </p>
              <p className="text-sm text-slate-400 mb-4">
                {searchQuery ? 'Try a different search term.' : 'Create your first technical assessment.'}
              </p>
              {!searchQuery && can('interview:create') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push('/dashboard/coding-interviews/create')}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Interview
                </Button>
              )}
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Language</TableHead>
                    <TableHead>Marks</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInterviews.map((interview) => (
                    <TableRow key={interview.id}>
                      <TableCell className="font-medium text-slate-900">{interview.title}</TableCell>
                      <TableCell>{getInterviewTypeBadge(interview.interview_type)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-sm text-slate-600">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          {format(new Date(interview.scheduled_start_time), 'MMM dd, yyyy')}
                          <Clock className="h-3.5 w-3.5 text-slate-400 ml-1" />
                          {format(new Date(interview.scheduled_start_time), 'HH:mm')}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(computeEffectiveStatus(interview))}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {interview.programming_language === 'any' || (interview.allowed_languages && interview.allowed_languages.length === 0)
                            ? 'Any'
                            : interview.programming_language}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-600">{interview.total_marks}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => router.push(`/dashboard/coding-interviews/${interview.id}`)} title="View details">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleCopyLink(interview.access_token)} title="Copy link">
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => router.push(`/dashboard/coding-interviews/${interview.id}/submissions`)} title="View Submissions">
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => router.push(`/dashboard/coding-interviews/${interview.id}/candidates`)} title="Candidate pipeline">
                            <Users className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => router.push(`/dashboard/coding-interviews/${interview.id}/edit`)} title="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleClone(interview.id)} title="Clone" disabled={cloningId === interview.id}>
                            {cloningId === interview.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <GitFork className="h-4 w-4" />
                            )}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleShareWhatsApp(interview.access_token, interview.title)} title="Share on WhatsApp">
                            <Share2 className="h-4 w-4" />
                          </Button>
                          {can('interview:create') && (
                            <Button size="sm" variant="ghost" onClick={() => handleDelete(interview.id)} title="Delete" className="text-red-500 hover:text-red-600 hover:bg-red-50">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title="Delete Interview"
        description="Are you sure you want to delete this interview? This action cannot be undone and will remove all associated questions and submissions."
        confirmText="Delete"
        variant="destructive"
      />

      <VoiceCreateModal
        open={voiceModalOpen}
        onClose={() => setVoiceModalOpen(false)}
        onCreated={() => {
          fetchInterviews()
          setVoiceModalOpen(false)
        }}
      />
    </div>
  )
}
