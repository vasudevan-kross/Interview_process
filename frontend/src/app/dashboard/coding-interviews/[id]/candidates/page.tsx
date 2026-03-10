'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  ArrowLeft,
  Upload,
  Copy,
  Zap,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  PauseCircle,
  Users,
  Pencil,
  Trash2,
  Save,
  X,
  Download,
  Search,
  Mail,
  Filter,
} from 'lucide-react'
import {
  getInterviewCandidates,
  bulkImportCandidates,
  setSubmissionDecision,
  evaluateAllSubmissions,
  exportSubmissions,
  generateShareableLink,
  updateCandidate,
  deleteCandidate,
  deleteSubmission,
  sendInterviewInvites,
  bulkSubmissionDecision,
  bulkDeleteCandidates,
  type CandidateListResponse,
  type InterviewCandidate,
} from '@/lib/api/coding-interviews'
import { toast } from 'sonner'

type Decision = 'advanced' | 'rejected' | 'hold' | 'pending'

interface EditState {
  candidateId: string
  name: string
  email: string
  phone: string
  saving: boolean
}

export default function CandidatesPage() {
  const router = useRouter()
  const params = useParams()
  const interviewId = params.id as string

  const [data, setData] = useState<CandidateListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [evaluating, setEvaluating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [sendingInvites, setSendingInvites] = useState(false)
  const [bulkActioning, setBulkActioning] = useState(false)

  // Search & filter
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Inline edit state
  const [editState, setEditState] = useState<EditState | null>(null)

  // Delete confirm dialog
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    candidateId: string      // interview_candidates.id (may be empty)
    submissionId: string     // coding_submissions.id (may be empty)
    candidateName: string
  }>({ open: false, candidateId: '', submissionId: '', candidateName: '' })

  // Decision confirm dialog
  const [decisionDialog, setDecisionDialog] = useState<{
    open: boolean
    submissionId: string
    candidateName: string
    decision: Decision
  }>({ open: false, submissionId: '', candidateName: '', decision: 'pending' })

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchCandidates()
  }, [interviewId])

  // Clear selection when filter changes
  useEffect(() => {
    setSelectedIds(new Set())
  }, [searchQuery, statusFilter])

  const fetchCandidates = async () => {
    try {
      setLoading(true)
      const result = await getInterviewCandidates(interviewId)
      setData(result)
    } catch (error: any) {
      toast.error(error.message || 'Failed to load candidates')
    } finally {
      setLoading(false)
    }
  }

  // ── Filtered candidates ────────────────────────────────────
  const filteredCandidates = useMemo(() => {
    if (!data?.candidates) return []
    return data.candidates.filter((c) => {
      const matchesSearch =
        !searchQuery ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.email || '').toLowerCase().includes(searchQuery.toLowerCase())

      const matchesStatus = (() => {
        switch (statusFilter) {
          case 'submitted': return c.submitted
          case 'not_started': return !c.submitted
          case 'advanced': return c.decision === 'advanced'
          case 'rejected': return c.decision === 'rejected'
          case 'hold': return c.decision === 'hold'
          case 'pending': return c.submitted && c.decision === 'pending'
          default: return true
        }
      })()

      return matchesSearch && matchesStatus
    })
  }, [data?.candidates, searchQuery, statusFilter])

  // ── Selection helpers ──────────────────────────────────────
  const allVisibleIds = filteredCandidates.map((c) => c.id)
  const allSelected =
    allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.has(id))
  const someSelected = allVisibleIds.some((id) => selectedIds.has(id)) && !allSelected

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        allVisibleIds.forEach((id) => next.delete(id))
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        allVisibleIds.forEach((id) => next.add(id))
        return next
      })
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedCandidates = filteredCandidates.filter((c) => selectedIds.has(c.id))
  const selectedSubmitted = selectedCandidates.filter((c) => c.submitted && !!c.submission_id)
  // Deletable = has a pre-registered record (candidate_id) AND has not submitted
  const selectedDeletable = selectedCandidates.filter((c) => !!c.candidate_id && !c.submitted)

  // ── Upload ─────────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      setUploading(true)
      const result = await bulkImportCandidates(interviewId, file)
      toast.success(
        `${result.imported} imported${result.duplicates > 0 ? `, ${result.duplicates} duplicates skipped` : ''}`
      )
      await fetchCandidates()
    } catch (error: any) {
      toast.error(error.message || 'Failed to import candidates')
    } finally {
      setUploading(false)
    }
  }

  const handleCopyLink = () => {
    if (!data?.access_token) return
    const link = generateShareableLink(data.access_token)
    navigator.clipboard.writeText(link)
    toast.success('Interview link copied!')
  }

  const handleSendInvites = async () => {
    setSendingInvites(true)
    try {
      const result = await sendInterviewInvites(interviewId)
      const parts = [`${result.sent} invite(s) sent`]
      if (result.skipped > 0) parts.push(`${result.skipped} skipped (already submitted)`)
      if (result.no_email > 0) parts.push(`${result.no_email} had no email`)
      toast.success(parts.join(', '))
    } catch (error: any) {
      toast.error(error.message || 'Failed to send invites')
    } finally {
      setSendingInvites(false)
    }
  }

  const handleEvaluateAll = async () => {
    try {
      setEvaluating(true)
      const result = await evaluateAllSubmissions(interviewId)
      toast.success(`Evaluated ${result.evaluated} of ${result.total} submissions`)
      await fetchCandidates()
    } catch (error: any) {
      toast.error(error.message || 'Failed to evaluate')
    } finally {
      setEvaluating(false)
    }
  }

  const handleExport = async () => {
    try {
      setExporting(true)
      await exportSubmissions(interviewId, data?.interview_title || 'Assessment')
      toast.success('ZIP downloaded')
    } catch (error: any) {
      toast.error(error.message || 'Failed to export submissions')
    } finally {
      setExporting(false)
    }
  }

  // ── Bulk actions ───────────────────────────────────────────
  const handleBulkDecision = async (decision: Decision) => {
    const submissionIds = selectedSubmitted.map((c) => c.submission_id!)
    if (submissionIds.length === 0) {
      toast.error('No submitted candidates selected')
      return
    }
    setBulkActioning(true)
    try {
      const result = await bulkSubmissionDecision(interviewId, submissionIds, decision)
      toast.success(`Marked ${result.updated} candidate(s) as ${decision}`)
      setSelectedIds(new Set())
      await fetchCandidates()
    } catch (error: any) {
      toast.error(error.message || 'Failed to update decisions')
    } finally {
      setBulkActioning(false)
    }
  }

  const handleBulkDelete = async () => {
    const candidateIds = selectedDeletable.map((c) => c.candidate_id!)
    if (candidateIds.length === 0) {
      toast.error('No deletable candidates selected')
      return
    }
    setBulkActioning(true)
    try {
      const result = await bulkDeleteCandidates(interviewId, candidateIds)
      toast.success(`Removed ${result.deleted} candidate(s)`)
      setSelectedIds(new Set())
      await fetchCandidates()
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete candidates')
    } finally {
      setBulkActioning(false)
    }
  }

  // ── Edit ──────────────────────────────────────────────────
  const startEdit = (candidate: InterviewCandidate) => {
    setEditState({
      candidateId: candidate.candidate_id!,
      name: candidate.name,
      email: candidate.email ?? '',
      phone: candidate.phone ?? '',
      saving: false,
    })
  }

  const cancelEdit = () => setEditState(null)

  const saveEdit = async () => {
    if (!editState) return
    if (!editState.name.trim()) {
      toast.error('Name is required')
      return
    }
    setEditState((s) => s && { ...s, saving: true })
    try {
      const updated = await updateCandidate(interviewId, editState.candidateId, {
        name: editState.name.trim(),
        email: editState.email.trim() || undefined,
        phone: editState.phone.trim() || undefined,
      })
      toast.success('Candidate updated')
      setData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          candidates: prev.candidates.map((c) =>
            c.candidate_id === editState.candidateId
              ? { ...c, name: updated.name, email: updated.email, phone: updated.phone }
              : c
          ),
        }
      })
      setEditState(null)
    } catch (error: any) {
      toast.error(error.message || 'Failed to update candidate')
      setEditState((s) => s && { ...s, saving: false })
    }
  }

  // ── Delete ────────────────────────────────────────────────
  const openDeleteDialog = (candidate: InterviewCandidate) => {
    setDeleteDialog({
      open: true,
      candidateId: candidate.candidate_id ?? '',
      submissionId: candidate.submission_id ?? '',
      candidateName: candidate.name,
    })
  }

  const confirmDelete = async () => {
    try {
      // Delete submission first (removes answers + activities)
      if (deleteDialog.submissionId) {
        await deleteSubmission(deleteDialog.submissionId)
      }
      // Also remove pre-registered record (if any), regardless of submission presence
      if (deleteDialog.candidateId) {
        await deleteCandidate(interviewId, deleteDialog.candidateId)
      }
      toast.success('Candidate removed')
      // Remove from local state
      setData((prev) => {
        if (!prev) return prev
        const candidates = prev.candidates.filter(
          (c) =>
            c.submission_id !== deleteDialog.submissionId &&
            c.candidate_id !== deleteDialog.candidateId
        )
        return { ...prev, candidates, total: candidates.length }
      })
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove candidate')
    } finally {
      setDeleteDialog((d) => ({ ...d, open: false }))
    }
  }

  // ── Decision ──────────────────────────────────────────────
  const openDecisionDialog = (candidate: InterviewCandidate, decision: Decision) => {
    if (!candidate.submission_id) return
    setDecisionDialog({
      open: true,
      submissionId: candidate.submission_id,
      candidateName: candidate.name,
      decision,
    })
  }

  const confirmDecision = async () => {
    const { submissionId, decision } = decisionDialog
    try {
      await setSubmissionDecision(submissionId, decision)
      toast.success('Decision saved')
      setData((prev) => {
        if (!prev) return prev
        const candidates = prev.candidates.map((c) =>
          c.submission_id === submissionId ? { ...c, decision } : c
        )
        return {
          ...prev,
          candidates,
          advanced: candidates.filter((c) => c.decision === 'advanced').length,
          rejected: candidates.filter((c) => c.decision === 'rejected').length,
          hold: candidates.filter((c) => c.decision === 'hold').length,
        }
      })
    } catch (error: any) {
      toast.error(error.message || 'Failed to save decision')
    } finally {
      setDecisionDialog((d) => ({ ...d, open: false }))
    }
  }

  // ── Helpers ───────────────────────────────────────────────
  const getDecisionBadge = (decision: Decision) => {
    switch (decision) {
      case 'advanced': return <Badge className="bg-green-100 text-green-800">Advanced</Badge>
      case 'rejected': return <Badge className="bg-red-100 text-red-800">Rejected</Badge>
      case 'hold': return <Badge className="bg-yellow-100 text-yellow-800">Hold</Badge>
      default: return <Badge className="bg-gray-100 text-gray-600">Pending</Badge>
    }
  }

  const getStatusBadge = (submitted: boolean) =>
    submitted ? (
      <span className="flex items-center gap-1 text-green-700 text-sm font-medium">
        <CheckCircle2 className="h-4 w-4" /> Submitted
      </span>
    ) : (
      <span className="flex items-center gap-1 text-gray-400 text-sm">
        <Clock className="h-4 w-4" /> Not Yet
      </span>
    )

  const notStarted = data ? data.total - data.submitted : 0

  return (
    <div className="space-y-6 p-8 pb-24">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/coding-interviews')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {data?.interview_title ?? 'Candidates'}
          </h1>
          <p className="text-gray-500 text-sm">Candidate pipeline for this assessment</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-6">
        {[
          { label: 'Total', value: data?.total ?? 0, color: 'border-l-blue-500' },
          { label: 'Submitted', value: data?.submitted ?? 0, color: 'border-l-indigo-500' },
          { label: 'Advanced', value: data?.advanced ?? 0, color: 'border-l-green-500' },
          { label: 'Rejected', value: data?.rejected ?? 0, color: 'border-l-red-500' },
          { label: 'Hold', value: data?.hold ?? 0, color: 'border-l-yellow-500' },
          { label: 'Not Started', value: notStarted, color: 'border-l-gray-400' },
        ].map(({ label, value, color }) => (
          <Card key={label} className={`border-l-4 ${color}`}>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs font-medium text-gray-500">{label}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="text-2xl font-bold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
        <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
          Upload Excel / CSV
        </Button>
        <Button variant="outline" onClick={handleCopyLink}>
          <Copy className="h-4 w-4 mr-2" />
          Copy Interview Link
        </Button>
        <Button variant="outline" onClick={handleSendInvites} disabled={sendingInvites}>
          {sendingInvites ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
          Send Invites
        </Button>
        <Button
          onClick={handleEvaluateAll}
          disabled={evaluating}
          className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
        >
          {evaluating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
          Evaluate All
        </Button>
        <Button variant="outline" onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
          Export ZIP
        </Button>
      </div>

      {/* Candidates table */}
      <Card>
        <CardContent className="pt-4">
          {/* Search + filter */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search by name or email..."
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
                <option value="all">All</option>
                <option value="submitted">Submitted</option>
                <option value="not_started">Not Started</option>
                <option value="advanced">Advanced</option>
                <option value="rejected">Rejected</option>
                <option value="hold">Hold</option>
                <option value="pending">Pending Review</option>
              </select>
            </div>
            {(searchQuery || statusFilter !== 'all') && (
              <span className="text-sm text-gray-500">
                {filteredCandidates.length} result{filteredCandidates.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : !data || filteredCandidates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <Users className="h-12 w-12 text-gray-300 mb-4" />
              <p>
                {data?.candidates.length === 0
                  ? 'No candidates yet. Upload an Excel/CSV file to get started.'
                  : 'No candidates match your search.'}
              </p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    {/* Select-all checkbox */}
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => { if (el) el.indeterminate = someSelected }}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Decision</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCandidates.map((candidate) => {
                    const isEditing = editState?.candidateId === candidate.candidate_id
                    const isRegistered = !!candidate.candidate_id
                    const isSelected = selectedIds.has(candidate.id)

                    return (
                      <TableRow
                        key={candidate.id}
                        className={
                          isSelected
                            ? 'bg-indigo-50'
                            : isEditing
                              ? 'bg-blue-50'
                              : candidate.decision === 'advanced'
                                ? 'bg-green-50'
                                : candidate.decision === 'rejected'
                                  ? 'bg-red-50'
                                  : candidate.decision === 'hold'
                                    ? 'bg-yellow-50'
                                    : ''
                        }
                      >
                        {/* Row checkbox */}
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(candidate.id)}
                            className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                          />
                        </TableCell>

                        {/* Name cell */}
                        <TableCell className="font-medium">
                          {isEditing ? (
                            <Input
                              value={editState!.name}
                              onChange={(e) => setEditState((s) => s && { ...s, name: e.target.value })}
                              className="h-8 text-sm"
                              autoFocus
                            />
                          ) : (
                            candidate.name
                          )}
                        </TableCell>

                        {/* Email cell */}
                        <TableCell className="text-gray-500 text-sm">
                          {isEditing ? (
                            <Input
                              value={editState!.email}
                              onChange={(e) => setEditState((s) => s && { ...s, email: e.target.value })}
                              placeholder="email"
                              className="h-8 text-sm"
                            />
                          ) : (
                            candidate.email ?? '—'
                          )}
                        </TableCell>

                        {/* Phone cell */}
                        <TableCell className="text-gray-500 text-sm">
                          {isEditing ? (
                            <Input
                              value={editState!.phone}
                              onChange={(e) => setEditState((s) => s && { ...s, phone: e.target.value })}
                              placeholder="phone"
                              className="h-8 text-sm"
                            />
                          ) : (
                            candidate.phone ?? '—'
                          )}
                        </TableCell>

                        <TableCell>{getStatusBadge(candidate.submitted)}</TableCell>

                        <TableCell>
                          {candidate.score != null ? (
                            <span className="font-semibold">
                              {Number.isInteger(candidate.score)
                                ? candidate.score
                                : candidate.score.toFixed(1)}
                              {data?.interview_total_marks != null && (
                                <span className="text-gray-400 text-xs font-normal"> / {data.interview_total_marks}</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </TableCell>

                        <TableCell>{getDecisionBadge(candidate.decision)}</TableCell>

                        {/* Actions cell */}
                        <TableCell className="text-right">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm" variant="ghost"
                                className="text-green-700 hover:bg-green-100 h-7 px-2"
                                onClick={saveEdit} disabled={editState!.saving}
                              >
                                {editState!.saving
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <Save className="h-3 w-3" />}
                              </Button>
                              <Button
                                size="sm" variant="ghost"
                                className="text-gray-500 hover:bg-gray-100 h-7 px-2"
                                onClick={cancelEdit} disabled={editState!.saving}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              {/* Decision buttons — only for submitted candidates */}
                              {candidate.submitted && candidate.submission_id && (
                                <>
                                  <Button
                                    size="sm" variant="ghost"
                                    className="text-green-700 hover:bg-green-100 h-7 px-2 text-xs"
                                    onClick={() => openDecisionDialog(candidate, 'advanced')}
                                    disabled={candidate.decision === 'advanced'}
                                  >
                                    <CheckCircle2 className="h-3 w-3 mr-1" />Advance
                                  </Button>
                                  <Button
                                    size="sm" variant="ghost"
                                    className="text-yellow-700 hover:bg-yellow-100 h-7 px-2 text-xs"
                                    onClick={() => openDecisionDialog(candidate, 'hold')}
                                    disabled={candidate.decision === 'hold'}
                                  >
                                    <PauseCircle className="h-3 w-3 mr-1" />Hold
                                  </Button>
                                  <Button
                                    size="sm" variant="ghost"
                                    className="text-red-700 hover:bg-red-100 h-7 px-2 text-xs"
                                    onClick={() => openDecisionDialog(candidate, 'rejected')}
                                    disabled={candidate.decision === 'rejected'}
                                  >
                                    <XCircle className="h-3 w-3 mr-1" />Reject
                                  </Button>
                                  <div className="w-px h-5 bg-gray-200 mx-1" />
                                </>
                              )}

                              {/* Edit — only for pre-registered candidates */}
                              {isRegistered && (
                                <Button
                                  size="sm" variant="ghost"
                                  className="text-blue-600 hover:bg-blue-50 h-7 px-2"
                                  onClick={() => startEdit(candidate)} title="Edit"
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              )}

                              {/* Delete — for pre-registered OR any candidate with a submission */}
                              {(isRegistered || !!candidate.submission_id) && (
                                <Button
                                  size="sm" variant="ghost"
                                  className="text-red-600 hover:bg-red-50 h-7 px-2"
                                  onClick={() => openDeleteDialog(candidate)} title="Delete"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}

                              {/* Walk-in with no pre-registration and no submission */}
                              {!isRegistered && !candidate.submitted && (
                                <span className="text-gray-400 text-xs">Waiting</span>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Floating bulk action bar ── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="pointer-events-auto bg-white border shadow-xl rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-gray-700 whitespace-nowrap">
              {selectedIds.size} selected
            </span>
            <div className="w-px h-5 bg-gray-200" />

            {/* Bulk decision — only if any submitted candidates selected */}
            {selectedSubmitted.length > 0 && (
              <>
                <Button
                  size="sm" variant="ghost"
                  className="text-green-700 hover:bg-green-100 text-xs"
                  onClick={() => handleBulkDecision('advanced')} disabled={bulkActioning}
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Advance ({selectedSubmitted.length})
                </Button>
                <Button
                  size="sm" variant="ghost"
                  className="text-yellow-700 hover:bg-yellow-100 text-xs"
                  onClick={() => handleBulkDecision('hold')} disabled={bulkActioning}
                >
                  <PauseCircle className="h-3 w-3 mr-1" />
                  Hold ({selectedSubmitted.length})
                </Button>
                <Button
                  size="sm" variant="ghost"
                  className="text-red-700 hover:bg-red-100 text-xs"
                  onClick={() => handleBulkDecision('rejected')} disabled={bulkActioning}
                >
                  <XCircle className="h-3 w-3 mr-1" />
                  Reject ({selectedSubmitted.length})
                </Button>
              </>
            )}

            {/* Bulk delete — only if any non-submitted pre-registered candidates selected */}
            {selectedDeletable.length > 0 && (
              <>
                {selectedSubmitted.length > 0 && <div className="w-px h-5 bg-gray-200" />}
                <Button
                  size="sm" variant="ghost"
                  className="text-red-600 hover:bg-red-50 text-xs"
                  onClick={handleBulkDelete} disabled={bulkActioning}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Delete ({selectedDeletable.length})
                </Button>
              </>
            )}

            {bulkActioning && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
            <div className="w-px h-5 bg-gray-200" />
            <Button
              size="sm" variant="ghost"
              className="text-gray-500 text-xs"
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="h-3 w-3 mr-1" /> Clear
            </Button>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog((d) => ({ ...d, open }))}
        onConfirm={confirmDelete}
        title="Delete Candidate"
        description={
          deleteDialog.submissionId
            ? `Delete ${deleteDialog.candidateName}'s submission and all their answers? This action cannot be undone.`
            : `Remove ${deleteDialog.candidateName} from the candidate list?`
        }
        confirmText="Delete"
        variant="destructive"
      />

      {/* Decision confirm */}
      <ConfirmDialog
        open={decisionDialog.open}
        onOpenChange={(open) => setDecisionDialog((d) => ({ ...d, open }))}
        onConfirm={confirmDecision}
        title={`Mark as ${decisionDialog.decision.charAt(0).toUpperCase() + decisionDialog.decision.slice(1)}`}
        description={`Mark ${decisionDialog.candidateName} as ${decisionDialog.decision}? You can change this later.`}
        confirmText="Confirm"
        variant={decisionDialog.decision === 'rejected' ? 'destructive' : 'default'}
      />
    </div>
  )
}
