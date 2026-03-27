'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Eye,
  Search,
  Loader2,
  AlertTriangle,
  Clock,
  Award,
  Users,
  ChevronLeft,
  Zap,
  Download,
  Trash2,
  Laptop,
  Smartphone,
  Tablet,
  BarChart3,
  FileText,
} from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PageHeader } from '@/components/ui/page-header'
import { SkeletonPageHeader, SkeletonTable } from '@/components/ui/skeleton'
import {
  getInterview,
  listSubmissions,
  evaluateAllSubmissions,
  exportSubmissions,
  exportSubmissionsCsv,
  deleteSubmission,
  deleteMultipleSubmissions,
  type Interview,
  type Submission
} from '@/lib/api/coding-interviews'
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { apiClient } from '@/lib/api/client'
import Link from 'next/link'

export default function SubmissionsPage() {
  const params = useParams()
  const router = useRouter()
  const interviewId = params.id as string

  const [interview, setInterview] = useState<Interview | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [evaluating, setEvaluating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportingCsv, setExportingCsv] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    submissionId: string
    candidateName: string
  }>({ open: false, submissionId: '', candidateName: '' })
  
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false)

  useEffect(() => {
    fetchData()
  }, [interviewId])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [interviewData, submissionsData] = await Promise.all([
        getInterview(interviewId),
        listSubmissions(interviewId),
      ])

      setInterview(interviewData)
      setSubmissions(submissionsData.submissions)
    } catch (error: any) {
      toast.error(error.message || 'Failed to load submissions')
    } finally {
      setLoading(false)
    }
  }

  const handleEvaluateAll = async () => {
    try {
      setEvaluating(true)
      toast.loading('Starting evaluation...', { id: 'bulk-eval' })

      const result = await evaluateAllSubmissions(interviewId)

      if (result.status === 'processing') {
        toast.info(
          `Evaluation started for ${result.total} submissions. Viewing progress...`,
          { id: 'bulk-eval', duration: 4000 }
        )

        // Start polling for 2 minutes or until all done
        let attempts = 0
        const maxAttempts = 12 // 12 * 10s = 2 minutes

        const pollInterval = setInterval(async () => {
          attempts++
          try {
            const submissionsData = await listSubmissions(interviewId)
            const subs = submissionsData.submissions
            setSubmissions(subs)

            const stillEvaluating = subs.some(s => s.status === 'submitted' || s.status === 'auto_submitted')

            if (!stillEvaluating || attempts >= maxAttempts) {
              clearInterval(pollInterval)
              setEvaluating(false)
              if (!stillEvaluating) {
                toast.success('Evaluation complete', { id: 'bulk-eval' })
              } else {
                toast.info('Evaluation is taking longer than expected. Please refresh later.', { id: 'bulk-eval' })
              }
            }
          } catch (e) {
            console.error('Polling failed:', e)
            clearInterval(pollInterval)
            setEvaluating(false)
          }
        }, 10000)
      } else {
        toast.success(
          result.total === 0 ? 'No submissions to evaluate' : `Evaluated ${result.evaluated} submission(s)`,
          { id: 'bulk-eval' }
        )
        await fetchData()
        setEvaluating(false)
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to evaluate submissions', { id: 'bulk-eval' })
      setEvaluating(false)
    }
  }

  const handleExport = async () => {
    try {
      setExporting(true)
      await exportSubmissions(interviewId, interview?.title || 'Assessment')
      toast.success('ZIP downloaded')
    } catch (error: any) {
      toast.error(error.message || 'Failed to export submissions ZIP')
    } finally {
      setExporting(false)
    }
  }

  const handleExportCsv = async () => {
    try {
      setExportingCsv(true)
      await exportSubmissionsCsv(interviewId, interview?.title || 'Assessment')
      toast.success('CSV downloaded')
    } catch (error: any) {
      toast.error(error.message || 'Failed to export submissions CSV')
    } finally {
      setExportingCsv(false)
    }
  }

  const handleDownloadReport = async (submissionId: string, candidateName: string) => {
    try {
      const blob = await apiClient.downloadSubmissionReport(submissionId)
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${candidateName.replace(/\s+/g, '_')}_assessment_report.pdf`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(url)
      toast.success('Report downloaded successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to download report')
    }
  }

  const openDeleteDialog = (submission: Submission) => {
    setDeleteDialog({ open: true, submissionId: submission.id, candidateName: submission.candidate_name })
  }

  const confirmDelete = async () => {
    try {
      await deleteSubmission(deleteDialog.submissionId)
      setSubmissions((prev) => prev.filter((s) => s.id !== deleteDialog.submissionId))
      setSelectedSubmissionIds((prev) => {
        const next = new Set(prev)
        next.delete(deleteDialog.submissionId)
        return next
      })
      toast.success('Submission deleted')
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete submission')
    } finally {
      setDeleteDialog((d) => ({ ...d, open: false }))
    }
  }

  const confirmBulkDelete = async () => {
    if (selectedSubmissionIds.size === 0) return

    try {
      setBulkDeleting(true)
      const idsToDelete = Array.from(selectedSubmissionIds)
      await deleteMultipleSubmissions(idsToDelete)
      setSubmissions((prev) => prev.filter((s) => !selectedSubmissionIds.has(s.id)))
      setSelectedSubmissionIds(new Set())
      toast.success(`Successfully deleted ${idsToDelete.length} submissions`)
    } catch (error: any) {
      toast.error(error.message || 'Failed to bulk delete submissions')
    } finally {
      setBulkDeleting(false)
      setBulkDeleteDialogOpen(false)
    }
  }

  const getStatusBadge = (status: string, submission?: Submission) => {
    const variants: Record<string, string> = {
      in_progress: 'bg-blue-50 text-blue-700 border border-blue-200 rounded-md',
      submitted: 'bg-amber-50 text-amber-700 border border-amber-200 rounded-md',
      auto_submitted: 'bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-md',
      evaluated: 'bg-green-50 text-green-700 border border-green-200 rounded-md',
      abandoned: 'bg-red-50 text-red-700 border border-red-200 rounded-md',
    }

    const label: Record<string, string> = {
      submitted: evaluating ? 'EVALUATING...' : 'SUBMITTED',
      auto_submitted: evaluating ? 'EVALUATING...' : 'AUTO-SUBMITTED',
    }

    // Check metadata for trigger if status is just 'submitted'
    const isAuto = status === 'auto_submitted' || (submission?.metadata as any)?.trigger === 'timer';
    const displayLabel = isAuto ? (evaluating ? 'EVALUATING...' : 'AUTO-SUBMITTED') : (label[status] || status.replace('_', ' ').toUpperCase());
    const badgeClass = isAuto ? 'bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-md' : (variants[status] || variants.submitted);

    return (
      <Badge className={badgeClass}>
        {displayLabel}
      </Badge>
    )
  }

  const filteredSubmissions = submissions.filter(
    (submission) =>
      submission.candidate_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      submission.candidate_email.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const averageScore =
    submissions.length > 0
      ? submissions.reduce((sum, s) => sum + (s.percentage || 0), 0) / submissions.length
      : 0

  const completedCount = submissions.filter((s) => s.status === 'submitted' || s.status === 'auto_submitted' || s.status === 'evaluated').length
  const pendingEvaluationCount = submissions.filter((s) => s.status === 'submitted' || s.status === 'auto_submitted').length
  const suspiciousCount = submissions.filter((s) => s.suspicious_activity).length

  const scoreDistribution = useMemo(() => {
    const evaluated = submissions.filter((s) => s.percentage != null)
    if (evaluated.length === 0) return null
    const buckets = [
      { range: '0–20%', count: 0, fill: '#ef4444' },
      { range: '20–40%', count: 0, fill: '#f97316' },
      { range: '40–60%', count: 0, fill: '#eab308' },
      { range: '60–80%', count: 0, fill: '#22c55e' },
      { range: '80–100%', count: 0, fill: '#6366f1' },
    ]
    evaluated.forEach((s) => {
      const p = s.percentage ?? 0
      if (p < 20) buckets[0].count++
      else if (p < 40) buckets[1].count++
      else if (p < 60) buckets[2].count++
      else if (p < 80) buckets[3].count++
      else buckets[4].count++
    })
    return buckets
  }, [submissions])

  return (
    <div className="space-y-6 p-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
      </div>
      <PageHeader
        title="Submissions"
        description={interview ? `${interview.title} — ${format(new Date(interview.scheduled_start_time), 'MMM dd, yyyy')}` : 'Review candidate submissions and evaluations'}
      />

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-slate-500">Total Submissions</CardTitle>
              <Users className="h-4 w-4 text-slate-300" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums text-slate-900">{submissions.length}</div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-slate-500">Completed</CardTitle>
              <Clock className="h-4 w-4 text-slate-300" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums text-slate-900">{completedCount}</div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-slate-500">Average Score</CardTitle>
              <Award className="h-4 w-4 text-slate-300" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums text-slate-900">{averageScore.toFixed(1)}%</div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-slate-500">Flagged</CardTitle>
              <AlertTriangle className="h-4 w-4 text-slate-300" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums text-slate-900">{suspiciousCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Score Distribution Chart */}
      {scoreDistribution && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Score Distribution</CardTitle>
            <CardDescription>How scores spread across evaluated submissions</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={scoreDistribution} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [`${v} candidate(s)`, 'Count']} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {scoreDistribution.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Submissions Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Submissions ({submissions.length})</CardTitle>
              <CardDescription>Review candidate submissions and evaluations</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {selectedSubmissionIds.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setBulkDeleteDialogOpen(true)}
                  disabled={bulkDeleting || loading}
                >
                  {bulkDeleting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Selected ({selectedSubmissionIds.size})
                    </>
                  )}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                disabled={exportingCsv || loading || submissions.length === 0}
              >
                {exportingCsv ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Export Marks CSV
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={exporting || loading || submissions.length === 0}
              >
                {exporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Export Resume and Answers ZIP
                  </>
                )}
              </Button>
              <Button
                size="sm"
                onClick={handleEvaluateAll}
                disabled={evaluating || loading || submissions.length === 0}
              >
                {evaluating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Evaluating...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Evaluate All
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {loading ? (
            <SkeletonTable rows={5} cols={7} />
          ) : filteredSubmissions.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm font-medium text-slate-900 mb-1">
                {searchQuery ? 'No submissions found' : 'No submissions yet'}
              </p>
              <p className="text-sm text-slate-400 mb-4">
                {searchQuery ? 'Try adjusting your search.' : 'Submissions will appear here once candidates complete the interview.'}
              </p>
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={filteredSubmissions.length > 0 && selectedSubmissionIds.size === filteredSubmissions.length}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedSubmissionIds(new Set(filteredSubmissions.map(s => s.id)))
                          } else {
                            setSelectedSubmissionIds(new Set())
                          }
                        }}
                        aria-label="Select all submissions"
                      />
                    </TableHead>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Submitted At</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Flags</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubmissions.map((submission) => (
                    <TableRow key={submission.id} className={selectedSubmissionIds.has(submission.id) ? "bg-slate-50" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={selectedSubmissionIds.has(submission.id)}
                          onCheckedChange={(checked) => {
                            const next = new Set(selectedSubmissionIds)
                            if (checked) next.add(submission.id)
                            else next.delete(submission.id)
                            setSelectedSubmissionIds(next)
                          }}
                          aria-label={`Select ${submission.candidate_name}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {submission.candidate_name}
                          {(submission.metadata as any)?.device_info?.device_type && (
                            <span 
                              className="text-slate-300"
                              title={`Device: ${(submission.metadata as any).device_info.device_type}\nOS: ${(submission.metadata as any).device_info.os_info || 'Unknown'}`}
                            >
                              {(submission.metadata as any).device_info.device_type === 'mobile' ? (
                                <Smartphone className="h-3 w-3" />
                              ) : (submission.metadata as any).device_info.device_type === 'tablet' ? (
                                <Tablet className="h-3 w-3" />
                              ) : (
                                <Laptop className="h-3 w-3" />
                              )}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{submission.candidate_email}</TableCell>
                      <TableCell>
                        {submission.submitted_at ? (
                          format(new Date(submission.submitted_at), 'MMM dd, HH:mm')
                        ) : (
                          <span className="text-gray-400">In Progress</span>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(submission.status, submission)}</TableCell>
                      <TableCell>
                        {submission.total_marks_obtained !== null && submission.total_marks_obtained !== undefined ? (
                          <div className="flex items-center gap-2">
                            <Award className="h-4 w-4 text-yellow-600" />
                            <span className="font-semibold">
                              {submission.total_marks_obtained.toFixed(1)}
                              {interview?.total_marks ? (
                                <span className="text-gray-400 text-xs font-normal"> / {interview.total_marks}</span>
                              ) : null}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400">Not evaluated</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {submission.late_submission && (
                            <Badge variant="outline" className="text-orange-700 border-orange-300">
                              Late
                            </Badge>
                          )}
                          {submission.suspicious_activity && (
                            <Badge variant="outline" className="text-red-700 border-red-300">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Flagged
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/dashboard/coding-interviews/submissions/${submission.id}/statistics`}>
                            <Button
                              size="sm"
                              variant="ghost"
                              title="View Full Report"
                            >
                              <BarChart3 className="h-4 w-4 text-indigo-600" />
                            </Button>
                          </Link>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDownloadReport(submission.id, submission.candidate_name)}
                            title="Download PDF Report"
                          >
                            <FileText className="h-4 w-4 text-slate-600" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              router.push(`/dashboard/coding-interviews/submissions/${submission.id}`)
                            }
                            title="Review Answers"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Review
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => openDeleteDialog(submission)}
                            title="Delete"
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
        open={deleteDialog.open}
        onOpenChange={(isOpen) => setDeleteDialog((d) => ({ ...d, open: isOpen }))}
        onConfirm={confirmDelete}
        title="Delete Submission"
        description={`Delete ${deleteDialog.candidateName}'s submission and all their answers? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
      />

      <ConfirmDialog
        open={bulkDeleteDialogOpen}
        onOpenChange={setBulkDeleteDialogOpen}
        onConfirm={confirmBulkDelete}
        title="Confirm Bulk Delete"
        description={`Are you sure you want to delete ${selectedSubmissionIds.size} selected submissions? This action cannot be undone.`}
        confirmText="Delete Selected"
        variant="destructive"
      />
    </div>
  )
}
