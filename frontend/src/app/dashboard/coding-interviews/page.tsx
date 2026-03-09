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
  ExternalLink,
} from 'lucide-react'
import { listInterviews, deleteInterview, generateShareableLink, type Interview } from '@/lib/api/coding-interviews'
import { toast } from 'sonner'
import { format } from 'date-fns'

export default function CodingInterviewsPage() {
  const router = useRouter()
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  useEffect(() => {
    fetchInterviews()
  }, [statusFilter])

  const fetchInterviews = async () => {
    try {
      setLoading(true)
      const params: any = {
        limit: 50,
        offset: 0,
      }

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

  const handleDelete = async (interviewId: string) => {
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

  const handleShareWhatsApp = (accessToken: string, title: string) => {
    const link = generateShareableLink(accessToken)
    const message = `Interview: ${title}\n\nJoin link: ${link}`
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`
    window.open(whatsappUrl, '_blank')
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; className: string }> = {
      scheduled: { variant: 'default', className: 'bg-blue-600 text-white' },
      in_progress: { variant: 'default', className: 'bg-green-600 text-white' },
      completed: { variant: 'default', className: 'bg-gray-600 text-white' },
      expired: { variant: 'default', className: 'bg-red-600 text-white' },
    }

    const config = variants[status] || variants.scheduled

    return (
      <Badge className={config.className}>
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    )
  }

  const getInterviewTypeBadge = (type: string) => {
    const variants: Record<string, string> = {
      coding: 'bg-purple-100 text-purple-800',
      testing: 'bg-orange-100 text-orange-800',
      both: 'bg-indigo-100 text-indigo-800',
      devops: 'bg-amber-100 text-amber-800',
      sql: 'bg-green-100 text-green-800',
      system_design: 'bg-pink-100 text-pink-800',
      fullstack: 'bg-cyan-100 text-cyan-800',
      data_science: 'bg-teal-100 text-teal-800',
    }

    const labels: Record<string, string> = {
      coding: 'CODING',
      testing: 'TESTING',
      both: 'BOTH',
      devops: 'DEVOPS',
      sql: 'SQL',
      system_design: 'SYS DESIGN',
      fullstack: 'FULLSTACK',
      data_science: 'DATA SCI',
    }

    return (
      <Badge className={variants[type] || variants.coding}>
        {labels[type] || type.toUpperCase()}
      </Badge>
    )
  }

  // Compute effective status based on current time
  const computeEffectiveStatus = (interview: Interview): string => {
    const now = new Date()
    const endTime = new Date(interview.scheduled_end_time)
    const graceMs = (interview.grace_period_minutes || 0) * 60 * 1000
    const effectiveEnd = new Date(endTime.getTime() + graceMs)

    if (interview.status === 'scheduled' && now > effectiveEnd) {
      return 'expired'
    }
    if (interview.status === 'in_progress' && now > effectiveEnd) {
      return 'completed'
    }
    return interview.status
  }

  const filteredInterviews = interviews.filter((interview) =>
    interview.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6 p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Technical Assessments
          </h1>
          <p className="text-gray-600 mt-2">
            Create and manage time-bound technical assessments across all domains
          </p>
        </div>
        <Button
          onClick={() => router.push('/dashboard/coding-interviews/create')}
          className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Interview
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Interviews</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{interviews.length}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {interviews.filter((i) => computeEffectiveStatus(i) === 'in_progress').length}
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-gray-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {interviews.filter((i) => computeEffectiveStatus(i) === 'completed').length}
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Scheduled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {interviews.filter((i) => computeEffectiveStatus(i) === 'scheduled').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle>Interviews</CardTitle>
          <CardDescription>Manage your coding and testing interviews</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search interviews..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
              >
                <option value="all">All Status</option>
                <option value="scheduled">Scheduled</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="expired">Expired</option>
              </select>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : filteredInterviews.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Code className="h-12 w-12 text-gray-300 mb-4" />
              <p className="text-gray-500 text-center">
                {searchQuery ? 'No interviews found matching your search' : 'No interviews yet'}
              </p>
              {!searchQuery && (
                <Button
                  onClick={() => router.push('/dashboard/coding-interviews/create')}
                  className="mt-4"
                  variant="outline"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create your first interview
                </Button>
              )}
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Scheduled Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Language</TableHead>
                    <TableHead>Total Marks</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInterviews.map((interview) => (
                    <TableRow key={interview.id}>
                      <TableCell className="font-medium">{interview.title}</TableCell>
                      <TableCell>{getInterviewTypeBadge(interview.interview_type)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          {format(new Date(interview.scheduled_start_time), 'MMM dd, yyyy')}
                          <Clock className="h-4 w-4 text-gray-400 ml-2" />
                          {format(new Date(interview.scheduled_start_time), 'HH:mm')}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(computeEffectiveStatus(interview))}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {interview.programming_language === 'any' || (interview.allowed_languages && interview.allowed_languages.length === 0)
                            ? 'Any Language'
                            : interview.programming_language}
                        </Badge>
                      </TableCell>
                      <TableCell>{interview.total_marks}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleCopyLink(interview.access_token)}
                            title="Copy link"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleShareWhatsApp(interview.access_token, interview.title)}
                            title="Share on WhatsApp"
                          >
                            <Share2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => router.push(`/dashboard/coding-interviews/${interview.id}/candidates`)}
                            title="Candidate pipeline"
                          >
                            <Users className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => router.push(`/dashboard/coding-interviews/${interview.id}`)}
                            title="View details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(interview.id)}
                            title="Delete"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
    </div>
  )
}
