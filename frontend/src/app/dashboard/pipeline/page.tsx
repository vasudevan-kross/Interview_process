'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { PageHeader } from '@/components/ui/page-header'
import { SkeletonPageHeader, SkeletonStatCards, SkeletonTable } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  Users, ArrowRight, CheckCircle2, Code, Phone, FileText,
  Settings2, ThumbsUp, ThumbsDown, Minus, MoreHorizontal, Trash2,
  ChevronRight, Search, Sliders,
} from 'lucide-react'
import {
  getPipelineBoard, getPipelineStats, getPipelineSettings, updatePipelineSettings,
  advanceCandidates, setPipelineDecision, deletePipelineCandidate,
  getAvailableInterviews, getAvailableCampaigns,
  type PipelineCandidate, type PipelineBoard, type PipelineStats, type PipelineSettings,
  type AvailableInterview, type AvailableCampaign,
} from '@/lib/api/pipeline'
import { createClient } from '@/lib/supabase/client'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

type Stage = 'resume_screening' | 'technical_assessment' | 'voice_screening' | 'completed'

const STAGE_CONFIG: Record<Stage, { label: string; icon: typeof FileText; color: string }> = {
  resume_screening: { label: 'Resume Screening', icon: FileText, color: 'bg-blue-500' },
  technical_assessment: { label: 'Technical Assessment', icon: Code, color: 'bg-amber-500' },
  voice_screening: { label: 'Voice Screening', icon: Phone, color: 'bg-violet-500' },
  completed: { label: 'Completed', icon: CheckCircle2, color: 'bg-green-500' },
}

const STAGES: Stage[] = ['resume_screening', 'technical_assessment', 'voice_screening', 'completed']

export default function PipelinePage() {
  const router = useRouter()

  // Job selection
  const [jobs, setJobs] = useState<any[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string>('')
  const [loadingJobs, setLoadingJobs] = useState(true)

  // Pipeline data
  const [board, setBoard] = useState<PipelineBoard | null>(null)
  const [stats, setStats] = useState<PipelineStats | null>(null)
  const [settings, setSettings] = useState<PipelineSettings | null>(null)
  const [loading, setLoading] = useState(false)

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Threshold panel
  const [showThresholds, setShowThresholds] = useState(false)
  const [highThreshold, setHighThreshold] = useState(85)
  const [recThreshold, setRecThreshold] = useState(65)
  const [savingThresholds, setSavingThresholds] = useState(false)

  // Advance dialog
  const [advanceDialog, setAdvanceDialog] = useState<{
    open: boolean
    targetStage: Stage
    candidateIds: string[]
  }>({ open: false, targetStage: 'technical_assessment', candidateIds: [] })
  const [interviews, setInterviews] = useState<AvailableInterview[]>([])
  const [campaigns, setCampaigns] = useState<AvailableCampaign[]>([])
  const [selectedTargetId, setSelectedTargetId] = useState('')
  const [advancing, setAdvancing] = useState(false)

  // Decision dialog
  const [decisionDialog, setDecisionDialog] = useState<{
    open: boolean; candidateId: string; candidateName: string
  }>({ open: false, candidateId: '', candidateName: '' })
  const [decisionValue, setDecisionValue] = useState('pending')
  const [decisionNotes, setDecisionNotes] = useState('')

  // No-target dialog
  const [noTargetDialog, setNoTargetDialog] = useState<{
    open: boolean; targetStage: Stage; candidateIds: string[]
  }>({ open: false, targetStage: 'technical_assessment', candidateIds: [] })

  // Search
  const [searchTerm, setSearchTerm] = useState('')

  // Load jobs list
  useEffect(() => {
    loadJobs()
  }, [])

  const loadJobs = async () => {
    setLoadingJobs(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: userRecord } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      const userIds = [user.id]
      if (userRecord && userRecord.id !== user.id) userIds.push(userRecord.id)

      const { data: jobsData, error } = await supabase
        .from('job_descriptions')
        .select('id, title, department, created_at')
        .in('created_by', userIds)
        .order('created_at', { ascending: false })

      if (error) {
        toast.error('Failed to load jobs')
        return
      }

      const jobList = jobsData || []
      setJobs(jobList)
      if (jobList.length > 0 && !selectedJobId) {
        setSelectedJobId(jobList[0].id)
      }
    } catch {
      toast.error('Failed to load jobs')
    } finally {
      setLoadingJobs(false)
    }
  }

  // Load pipeline data when job is selected
  const loadPipeline = useCallback(async () => {
    if (!selectedJobId) return
    setLoading(true)
    try {
      const [boardData, statsData, settingsData] = await Promise.all([
        getPipelineBoard(selectedJobId),
        getPipelineStats(selectedJobId),
        getPipelineSettings(selectedJobId),
      ])
      setBoard(boardData)
      setStats(statsData)
      setSettings(settingsData)
      setHighThreshold(settingsData.highly_recommended_threshold)
      setRecThreshold(settingsData.recommended_threshold)
    } catch (error: any) {
      toast.error(error.message || 'Failed to load pipeline')
    } finally {
      setLoading(false)
    }
  }, [selectedJobId])

  useEffect(() => {
    if (selectedJobId) {
      loadPipeline()
      setSelected(new Set())
    }
  }, [selectedJobId, loadPipeline])

  // ── Threshold save ─────────────────────────────────────────────────────

  const saveThresholds = async () => {
    if (!selectedJobId) return
    setSavingThresholds(true)
    try {
      await updatePipelineSettings(selectedJobId, {
        highly_recommended_threshold: highThreshold,
        recommended_threshold: recThreshold,
      })
      toast.success('Thresholds updated')
      setShowThresholds(false)
      loadPipeline()
    } catch {
      toast.error('Failed to save thresholds')
    } finally {
      setSavingThresholds(false)
    }
  }

  // ── Selection ──────────────────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const selectAllInStage = (stage: Stage) => {
    if (!board) return
    const ids = board[stage].map(c => c.id)
    const allSelected = ids.every(id => selected.has(id))
    const next = new Set(selected)
    if (allSelected) {
      ids.forEach(id => next.delete(id))
    } else {
      ids.forEach(id => next.add(id))
    }
    setSelected(next)
  }

  // ── Advance ────────────────────────────────────────────────────────────

  const openAdvanceDialog = async (targetStage: Stage, candidateIds: string[]) => {
    if (candidateIds.length === 0) {
      toast.error('No candidates selected')
      return
    }

    if (targetStage === 'completed') {
      // No target needed, just advance
      setAdvancing(true)
      try {
        const result = await advanceCandidates(selectedJobId, candidateIds, 'completed')
        toast.success(`${result.advanced} candidate(s) marked as completed`)
        setSelected(new Set())
        loadPipeline()
      } catch (e: any) {
        toast.error(e.message)
      } finally {
        setAdvancing(false)
      }
      return
    }

    // Load available targets
    try {
      if (targetStage === 'technical_assessment') {
        const data = await getAvailableInterviews(selectedJobId || undefined)
        setInterviews(data)
        if (data.length === 0) {
          setNoTargetDialog({ open: true, targetStage, candidateIds })
          return
        }
      } else if (targetStage === 'voice_screening') {
        const data = await getAvailableCampaigns(selectedJobId || undefined)
        setCampaigns(data)
        if (data.length === 0) {
          setNoTargetDialog({ open: true, targetStage, candidateIds })
          return
        }
      }
    } catch {
      toast.error('Failed to load available targets')
      return
    }

    setSelectedTargetId('')
    setAdvanceDialog({ open: true, targetStage, candidateIds })
  }

  const executeAdvance = async () => {
    setAdvancing(true)
    try {
      const result = await advanceCandidates(
        selectedJobId,
        advanceDialog.candidateIds,
        advanceDialog.targetStage,
        advanceDialog.targetStage === 'technical_assessment' ? selectedTargetId : undefined,
        advanceDialog.targetStage === 'voice_screening' ? selectedTargetId : undefined,
      )
      toast.success(`${result.advanced} candidate(s) advanced`)
      setAdvanceDialog({ open: false, targetStage: 'technical_assessment', candidateIds: [] })
      setSelected(new Set())
      loadPipeline()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setAdvancing(false)
    }
  }

  // ── Decision ───────────────────────────────────────────────────────────

  const openDecisionDialog = (candidate: PipelineCandidate) => {
    setDecisionValue(candidate.final_decision || 'pending')
    setDecisionNotes(candidate.decision_notes || '')
    setDecisionDialog({ open: true, candidateId: candidate.id, candidateName: candidate.candidate_name })
  }

  const saveDecision = async () => {
    try {
      await setPipelineDecision(decisionDialog.candidateId, decisionValue, decisionNotes || undefined)
      toast.success('Decision saved')
      setDecisionDialog({ open: false, candidateId: '', candidateName: '' })
      loadPipeline()
    } catch {
      toast.error('Failed to save decision')
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────

  const handleDelete = async (candidateId: string) => {
    try {
      await deletePipelineCandidate(candidateId)
      toast.success('Removed from pipeline')
      loadPipeline()
    } catch {
      toast.error('Failed to remove')
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  const getRecommendationBadge = (rec: string) => {
    switch (rec) {
      case 'highly_recommended':
        return <Badge className="bg-green-50 text-green-700 border border-green-200 rounded-md text-xs"><ThumbsUp className="h-3 w-3 mr-1" />Highly Rec.</Badge>
      case 'recommended':
        return <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-xs"><ThumbsUp className="h-3 w-3 mr-1" />Recommended</Badge>
      case 'not_recommended':
        return <Badge className="bg-red-50 text-red-700 border border-red-200 rounded-md text-xs"><ThumbsDown className="h-3 w-3 mr-1" />Not Rec.</Badge>
      default:
        return <Badge className="bg-slate-100 text-slate-500 border border-slate-200 rounded-md text-xs"><Minus className="h-3 w-3 mr-1" />Pending</Badge>
    }
  }

  const getDecisionBadge = (dec: string) => {
    switch (dec) {
      case 'selected': return <Badge className="bg-green-50 text-green-700 border border-green-200 rounded-md text-xs">Selected</Badge>
      case 'rejected': return <Badge className="bg-red-50 text-red-700 border border-red-200 rounded-md text-xs">Rejected</Badge>
      case 'hold': return <Badge className="bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-xs">On Hold</Badge>
      default: return <Badge className="bg-slate-100 text-slate-500 border border-slate-200 rounded-md text-xs">Pending</Badge>
    }
  }

  const getNextStages = (current: Stage): Stage[] => {
    const idx = STAGES.indexOf(current)
    return STAGES.slice(idx + 1)
  }

  const filterCandidates = (candidates: PipelineCandidate[]) => {
    if (!searchTerm) return candidates
    const term = searchTerm.toLowerCase()
    return candidates.filter(c =>
      c.candidate_name.toLowerCase().includes(term) ||
      c.candidate_email.toLowerCase().includes(term)
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (loadingJobs) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <SkeletonPageHeader />
        <SkeletonStatCards />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Interview Pipeline"
        description="Track candidates across Resume, Technical, and Voice screening stages."
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowThresholds(!showThresholds)}>
              <Sliders className="h-4 w-4 mr-2" />
              Thresholds
            </Button>
          </div>
        }
      />

      {/* Job Selector */}
      <Card className="border border-slate-200 bg-white">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-slate-700 whitespace-nowrap">Select Job:</label>
            <Select value={selectedJobId} onValueChange={setSelectedJobId}>
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder="Choose a job description..." />
              </SelectTrigger>
              <SelectContent>
                {jobs.map((job) => (
                  <SelectItem key={job.id} value={job.id}>
                    {job.title || 'Untitled Job'} {job.department ? `(${job.department})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {jobs.length === 0 && (
              <p className="text-sm text-slate-400">No jobs found. Upload a job description in Resume Matching first.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Threshold Settings Panel */}
      {showThresholds && selectedJobId && (
        <Card className="border border-indigo-200 bg-indigo-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Recommendation Thresholds
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-6">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">Highly Recommended (&ge;)</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0} max={100}
                    value={highThreshold}
                    onChange={(e) => setHighThreshold(Number(e.target.value))}
                    className="w-20 h-8 text-sm"
                  />
                  <span className="text-sm text-slate-500">%</span>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">Recommended (&ge;)</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0} max={100}
                    value={recThreshold}
                    onChange={(e) => setRecThreshold(Number(e.target.value))}
                    className="w-20 h-8 text-sm"
                  />
                  <span className="text-sm text-slate-500">%</span>
                </div>
              </div>
              <p className="text-xs text-slate-400 self-center">Below {recThreshold}% = Not Recommended</p>
              <Button size="sm" onClick={saveThresholds} disabled={savingThresholds}>
                {savingThresholds ? 'Saving...' : 'Apply'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {stats && selectedJobId && !loading && (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          <Card className="border border-slate-200 bg-white">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-500">Total</CardTitle>
                <Users className="h-4 w-4 text-slate-300" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-slate-900">{stats.total}</div>
            </CardContent>
          </Card>
          {STAGES.map((stage) => {
            const config = STAGE_CONFIG[stage]
            const Icon = config.icon
            return (
              <Card key={stage} className="border border-slate-200 bg-white">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium text-slate-500">{config.label}</CardTitle>
                    <Icon className="h-4 w-4 text-slate-300" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold tabular-nums text-slate-900">{stats.stages[stage] || 0}</div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Search */}
      {selectedJobId && board && (
        <Card className="border border-slate-200 bg-white">
          <CardContent className="pt-4 pb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search candidates by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 border-slate-200"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Kanban Board */}
      {loading && selectedJobId && (
        <SkeletonTable rows={6} cols={4} />
      )}

      {!loading && board && selectedJobId && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {STAGES.map((stage) => {
            const config = STAGE_CONFIG[stage]
            const Icon = config.icon
            const candidates = filterCandidates(board[stage] || [])
            const stageSelected = candidates.filter(c => selected.has(c.id))
            const allSelected = candidates.length > 0 && candidates.every(c => selected.has(c.id))

            return (
              <div key={stage} className="space-y-3">
                {/* Column header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${config.color}`} />
                    <h3 className="text-sm font-semibold text-slate-700">{config.label}</h3>
                    <span className="text-xs text-slate-400 tabular-nums">({candidates.length})</span>
                  </div>
                  {candidates.length > 0 && (
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={() => selectAllInStage(stage)}
                      className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                    />
                  )}
                </div>

                {/* Bulk action for this column */}
                {stageSelected.length > 0 && stage !== 'completed' && (
                  <div className="flex gap-1">
                    {getNextStages(stage).map(nextStage => (
                      <Button
                        key={nextStage}
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 flex-1"
                        onClick={() => openAdvanceDialog(nextStage, stageSelected.map(c => c.id))}
                        disabled={advancing}
                      >
                        <ArrowRight className="h-3 w-3 mr-1" />
                        {STAGE_CONFIG[nextStage].label.split(' ')[0]}
                      </Button>
                    ))}
                  </div>
                )}

                {/* Cards */}
                <div className="space-y-2 min-h-[100px]">
                  {candidates.length === 0 && (
                    <div className="py-8 text-center border border-dashed border-slate-200 rounded-lg">
                      <p className="text-xs text-slate-400">No candidates</p>
                    </div>
                  )}
                  {candidates.map((candidate) => (
                    <Card
                      key={candidate.id}
                      className={`border bg-white hover:shadow-sm transition-shadow cursor-default ${
                        selected.has(candidate.id) ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-slate-200'
                      }`}
                    >
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0">
                            <Checkbox
                              checked={selected.has(candidate.id)}
                              onCheckedChange={() => toggleSelect(candidate.id)}
                              className="mt-0.5 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-900 truncate">{candidate.candidate_name}</p>
                              <p className="text-xs text-slate-400 truncate">{candidate.candidate_email}</p>
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {stage !== 'completed' && getNextStages(stage).map(nextStage => (
                                <DropdownMenuItem
                                  key={nextStage}
                                  onClick={() => openAdvanceDialog(nextStage, [candidate.id])}
                                >
                                  <ArrowRight className="h-4 w-4 mr-2" />
                                  Move to {STAGE_CONFIG[nextStage].label}
                                </DropdownMenuItem>
                              ))}
                              {stage !== 'completed' && <DropdownMenuSeparator />}
                              <DropdownMenuItem onClick={() => openDecisionDialog(candidate)}>
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Set Decision
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => handleDelete(candidate.id)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {/* Scores */}
                        <div className="flex flex-wrap gap-1">
                          {candidate.resume_match_score != null && (
                            <span className="px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200 tabular-nums">
                              Resume: {candidate.resume_match_score.toFixed(0)}%
                            </span>
                          )}
                          {candidate.coding_percentage != null && (
                            <span className="px-1.5 py-0.5 rounded text-xs bg-amber-50 text-amber-700 border border-amber-200 tabular-nums">
                              Code: {candidate.coding_percentage.toFixed(0)}%
                            </span>
                          )}
                          {candidate.voice_status && (
                            <span className={`px-1.5 py-0.5 rounded text-xs border ${
                              candidate.voice_status === 'completed'
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : 'bg-slate-50 text-slate-600 border-slate-200'
                            }`}>
                              Voice: {candidate.voice_status}
                            </span>
                          )}
                        </div>

                        {/* Badges */}
                        <div className="flex items-center gap-1.5">
                          {getRecommendationBadge(candidate.recommendation)}
                          {candidate.final_decision !== 'pending' && getDecisionBadge(candidate.final_decision)}
                        </div>

                        {/* Skipped stages indicator */}
                        {candidate.skipped_stages && candidate.skipped_stages.length > 0 && (
                          <p className="text-xs text-slate-400">
                            Skipped: {candidate.skipped_stages.map(s =>
                              STAGE_CONFIG[s as Stage]?.label || s
                            ).join(', ')}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Empty state when no job selected */}
      {!selectedJobId && !loadingJobs && (
        <Card className="border border-slate-200 bg-white">
          <CardContent className="py-16 text-center">
            <p className="text-sm font-medium text-slate-900 mb-1">Select a job to view the pipeline</p>
            <p className="text-sm text-slate-400 mb-4">
              Choose a job description above, or upload one in Resume Matching first.
            </p>
            <Button variant="outline" onClick={() => router.push('/dashboard/resume-matching')}>
              Go to Resume Matching
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Empty pipeline state */}
      {!loading && board && selectedJobId && stats?.total === 0 && (
        <Card className="border border-slate-200 bg-white">
          <CardContent className="py-16 text-center">
            <p className="text-sm font-medium text-slate-900 mb-1">Pipeline is empty</p>
            <p className="text-sm text-slate-400 mb-4">
              Go to Resume Matching, select candidates, and click "Add to Pipeline" to get started.
            </p>
            <Button variant="outline" onClick={() => router.push(`/dashboard/resume-matching/${selectedJobId}/candidates`)}>
              View Candidates
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Advance Dialog ────────────────────────────────────────────── */}
      <Dialog open={advanceDialog.open} onOpenChange={(o) => !o && setAdvanceDialog({ ...advanceDialog, open: false })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Move to {STAGE_CONFIG[advanceDialog.targetStage]?.label}
            </DialogTitle>
            <DialogDescription>
              Select a target {advanceDialog.targetStage === 'technical_assessment' ? 'coding interview' : 'voice campaign'} for {advanceDialog.candidateIds.length} candidate(s).
            </DialogDescription>
          </DialogHeader>

          <Select value={selectedTargetId} onValueChange={setSelectedTargetId}>
            <SelectTrigger>
              <SelectValue placeholder={
                advanceDialog.targetStage === 'technical_assessment'
                  ? 'Select a coding interview...'
                  : 'Select a voice campaign...'
              } />
            </SelectTrigger>
            <SelectContent>
              {advanceDialog.targetStage === 'technical_assessment' && interviews.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.title} ({i.programming_language}) - {i.status}
                </SelectItem>
              ))}
              {advanceDialog.targetStage === 'voice_screening' && campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} ({c.job_role}) - {c.interview_style}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAdvanceDialog({ ...advanceDialog, open: false })}>Cancel</Button>
            <Button onClick={executeAdvance} disabled={!selectedTargetId || advancing}>
              {advancing ? 'Moving...' : 'Move Candidates'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── No Target Dialog ──────────────────────────────────────────── */}
      <Dialog open={noTargetDialog.open} onOpenChange={(o) => !o && setNoTargetDialog({ ...noTargetDialog, open: false })}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              No {noTargetDialog.targetStage === 'technical_assessment' ? 'Technical Assessment' : 'Voice Campaign'} Found
            </DialogTitle>
            <DialogDescription>
              There's no {noTargetDialog.targetStage === 'technical_assessment' ? 'coding interview' : 'voice screening campaign'} available yet. What would you like to do?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row sm:flex-wrap sm:justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setNoTargetDialog({ ...noTargetDialog, open: false })
                const jobParam = selectedJobId ? `?job_id=${selectedJobId}` : ''
                router.push(
                  noTargetDialog.targetStage === 'technical_assessment'
                    ? `/dashboard/coding-interviews/create${jobParam}`
                    : `/dashboard/voice-screening/campaigns/new${jobParam}`
                )
              }}
            >
              Create New {noTargetDialog.targetStage === 'technical_assessment' ? 'Assessment' : 'Campaign'}
            </Button>
            {noTargetDialog.targetStage === 'technical_assessment' && (
              <Button
                variant="outline"
                onClick={() => {
                  setNoTargetDialog({ ...noTargetDialog, open: false })
                  openAdvanceDialog('voice_screening', noTargetDialog.candidateIds)
                }}
              >
                Skip to Voice
              </Button>
            )}
            <Button
              variant="outline"
              onClick={async () => {
                setNoTargetDialog({ ...noTargetDialog, open: false })
                try {
                  const result = await advanceCandidates(selectedJobId, noTargetDialog.candidateIds, 'completed')
                  toast.success(`${result.advanced} candidate(s) marked as completed`)
                  setSelected(new Set())
                  loadPipeline()
                } catch (e: any) {
                  toast.error(e.message)
                }
              }}
            >
              Mark as Completed
            </Button>
            <Button variant="ghost" onClick={() => setNoTargetDialog({ ...noTargetDialog, open: false })}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Decision Dialog ───────────────────────────────────────────── */}
      <Dialog open={decisionDialog.open} onOpenChange={(o) => !o && setDecisionDialog({ ...decisionDialog, open: false })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Decision: {decisionDialog.candidateName}</DialogTitle>
            <DialogDescription>Record the final hiring decision for this candidate.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={decisionValue} onValueChange={setDecisionValue}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="selected">Selected</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="hold">On Hold</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Notes (optional)..."
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionDialog({ ...decisionDialog, open: false })}>Cancel</Button>
            <Button onClick={saveDecision}>Save Decision</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
