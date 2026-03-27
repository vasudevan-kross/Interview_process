'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { TimePicker } from '@/components/ui/time-picker'
import {
  ArrowLeft,
  Upload,
  Users,
  Briefcase,
  Calendar,
  Settings,
  Plus,
  Trash2,
  ChevronRight,
  Download,
  FileText,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  MoreVertical,
} from 'lucide-react'
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
  }
  created_at: string
  statistics?: {
    total_candidates?: number
    unique_jobs?: number
    by_stage?: Record<string, number>
    by_recommendation?: Record<string, number>
  }
}

interface Candidate {
  id: string
  candidate_name: string
  candidate_email: string
  candidate_phone: string | null
  job_id: string
  current_stage: string
  resume_match_score: number | null
  coding_score: number | null
  recommendation: string
  final_decision: string
  interview_slot: {
    slot_name?: string
  } | null
  created_at: string
}

interface PipelineBoard {
  resume_screening: Candidate[]
  technical_assessment: Candidate[]
  voice_screening: Candidate[]
  completed: Candidate[]
}

export default function CampaignDetailPage() {
  const params = useParams()
  const router = useRouter()
  const campaignId = params.id as string

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [pipelineBoard, setPipelineBoard] = useState<PipelineBoard>({
    resume_screening: [],
    technical_assessment: [],
    voice_screening: [],
    completed: [],
  })
  const [loading, setLoading] = useState(true)
  const [selectedJobFilter, setSelectedJobFilter] = useState<string>('all') // 'all' or job_id
  const [selectedSlotFilter, setSelectedSlotFilter] = useState<string>('all') // 'all' or slot name
  const [jobCandidateCounts, setJobCandidateCounts] = useState<Record<string, number>>({}) // Store counts per job
  const [slotCandidateCounts, setSlotCandidateCounts] = useState<Record<string, number>>({}) // Store counts per slot

  // Import dialog
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<any>(null)
  const [importing, setImporting] = useState(false)

  // Add candidate dialog
  const [showAddCandidateDialog, setShowAddCandidateDialog] = useState(false)
  const [addCandidateForm, setAddCandidateForm] = useState({
    name: '',
    email: '',
    phone: '',
    job_id: '',
    slot: '',
  })
  const [jobs, setJobs] = useState<any[]>([])

  // Settings dialog
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const [settingsForm, setSettingsForm] = useState({
    name: '',
    description: '',
    status: 'active',
    slots: [] as Array<{ name: string; time_start: string; time_end: string }>,
  })
  const [savingSettings, setSavingSettings] = useState(false)

  // Confirm dialogs
  const [showDeleteCampaignDialog, setShowDeleteCampaignDialog] = useState(false)
  const [showDeleteCandidateDialog, setShowDeleteCandidateDialog] = useState(false)
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null)

  // Candidate actions
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set())
  const [showDecisionDialog, setShowDecisionDialog] = useState(false)
  const [decisionCandidate, setDecisionCandidate] = useState<Candidate | null>(null)
  const [decisionForm, setDecisionForm] = useState({ decision: 'pending', notes: '' })
  const [showFilters, setShowFilters] = useState(false)

  const [candidateReport, setCandidateReport] = useState<any>(null)
  const [candidateReportLoading, setCandidateReportLoading] = useState(false)
  const [showCandidateReportDialog, setShowCandidateReportDialog] = useState(false)

  // Move dialog
  const [showAdvanceDialog, setShowAdvanceDialog] = useState(false)
  const [advanceForm, setAdvanceForm] = useState({
    target_stage: 'technical_assessment',
    interview_id: '',
    voice_campaign_id: '',
    decision: 'pending',
    decision_notes: '',
  })
  const [availableInterviews, setAvailableInterviews] = useState<any[]>([])
  const [availableVoiceCampaigns, setAvailableVoiceCampaigns] = useState<any[]>([])
  const [advancing, setAdvancing] = useState(false)

  useEffect(() => {
    loadCampaign()
    loadPipelineBoard()
    loadJobs()
  }, [campaignId])

  const loadCampaign = async () => {
    try {
      const data = await apiClient.getCampaign(campaignId)
      setCampaign(data)
    } catch (error) {
      console.error('Error loading campaign:', error)
    }
  }

  const loadPipelineBoard = async (jobFilter?: string) => {
    try {
      setLoading(true)
      const filterJobId = jobFilter !== undefined ? jobFilter : selectedJobFilter
      const jobIdParam = filterJobId === 'all' ? '' : filterJobId
      const board = await apiClient.getCampaignPipelineBoard(campaignId, jobIdParam)
      setPipelineBoard(board)

      // Calculate and store job candidate counts when loading 'all'
      if (filterJobId === 'all' && selectedSlotFilter === 'all') {
        const jobCounts: Record<string, number> = {}
        const slotCounts: Record<string, number> = {}

        Object.values(board).flat().forEach((candidate) => {
          jobCounts[candidate.job_id] = (jobCounts[candidate.job_id] || 0) + 1

          const slotName = candidate.interview_slot?.slot_name
          if (slotName) {
            slotCounts[slotName] = (slotCounts[slotName] || 0) + 1
          }
        })

        setJobCandidateCounts(jobCounts)
        setSlotCandidateCounts(slotCounts)
      }
    } catch (error) {
      console.error('Error loading pipeline board:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadJobs = async () => {
    try {
      const response = await apiClient.listJobDescriptions()
      setJobs(response.jobs || [])
    } catch (error) {
      console.error('Error loading jobs:', error)
    }
  }

  const handleJobFilterChange = (jobId: string) => {
    setSelectedJobFilter(jobId)
    loadPipelineBoard(jobId)
  }

  const handleSlotFilterChange = (slotName: string) => {
    setSelectedSlotFilter(slotName)
  }

  // Client-side filtering for slots
  const getFilteredBoard = (): PipelineBoard => {
    if (selectedSlotFilter === 'all') {
      return pipelineBoard
    }

    const filtered: PipelineBoard = {
      resume_screening: [],
      technical_assessment: [],
      voice_screening: [],
      completed: [],
    }

    Object.entries(pipelineBoard).forEach(([stage, candidates]) => {
      filtered[stage as keyof PipelineBoard] = candidates.filter((c) =>
        selectedSlotFilter === 'no_slot'
          ? !c.interview_slot?.slot_name
          : c.interview_slot?.slot_name === selectedSlotFilter
      )
    })

    return filtered
  }

  const filteredBoard = getFilteredBoard()

  const openSettingsDialog = () => {
    if (campaign) {
      setSettingsForm({
        name: campaign.name,
        description: campaign.description || '',
        status: campaign.status,
        slots: campaign.metadata?.slots || [],
      })
      setShowSettingsDialog(true)
    }
  }

  const handleAddSlot = () => {
    setSettingsForm({
      ...settingsForm,
      slots: [
        ...settingsForm.slots,
        { name: '', time_start: '09:00', time_end: '12:00' },
      ],
    })
  }

  const handleRemoveSlot = (index: number) => {
    setSettingsForm({
      ...settingsForm,
      slots: settingsForm.slots.filter((_, i) => i !== index),
    })
  }

  const handleUpdateSlot = (index: number, field: string, value: string) => {
    const newSlots = [...settingsForm.slots]
    newSlots[index] = { ...newSlots[index], [field]: value }
    setSettingsForm({ ...settingsForm, slots: newSlots })
  }

  const handleSaveSettings = async () => {
    if (!settingsForm.name.trim()) {
      toast.error('Campaign name is required')
      return
    }

    setSavingSettings(true)
    try {
      await apiClient.updateCampaign(campaignId, {
        name: settingsForm.name,
        description: settingsForm.description || null,
        status: settingsForm.status,
        metadata: {
          slots: settingsForm.slots,
        },
      })
      setShowSettingsDialog(false)
      loadCampaign()
      toast.success('Settings saved successfully')
    } catch (error: any) {
      console.error('Error saving settings:', error)
      toast.error(error.response?.data?.detail || 'Failed to save settings')
    } finally {
      setSavingSettings(false)
    }
  }

  const handleDeleteCampaign = async () => {
    try {
      await apiClient.deleteCampaign(campaignId)
      toast.success('Campaign deleted successfully')
      router.push('/dashboard/campaigns')
    } catch (error: any) {
      console.error('Error deleting campaign:', error)
      toast.error(error.response?.data?.detail || 'Failed to delete campaign')
    }
  }

  const handleAddCandidate = async () => {
    if (!addCandidateForm.name || !addCandidateForm.email || !addCandidateForm.job_id) {
      toast.error('Please fill in name, email, and job role')
      return
    }

    try {
      const payload: any = {
        job_id: addCandidateForm.job_id,
        candidate_name: addCandidateForm.name,
        candidate_email: addCandidateForm.email,
      }

      if (addCandidateForm.phone) {
        payload.candidate_phone = addCandidateForm.phone
      }

      if (addCandidateForm.slot) {
        payload.interview_slot = { slot_name: addCandidateForm.slot }
      }

      await apiClient.addCandidateToCampaign(campaignId, payload)
      setShowAddCandidateDialog(false)
      setAddCandidateForm({ name: '', email: '', phone: '', job_id: '', slot: '' })
      loadCampaign()
      loadPipelineBoard()
    } catch (error: any) {
      console.error('Error adding candidate:', error)
      toast.error(error.response?.data?.detail || 'Failed to add candidate')
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setSelectedFile(file)

    try {
      const preview = await apiClient.previewCandidateImport(campaignId, file)
      setImportPreview(preview)
      setShowImportDialog(true)
    } catch (error: any) {
      console.error('Error previewing import:', error)
      toast.error(error.response?.data?.detail || 'Failed to preview file')
    }
  }

  const handleConfirmImport = async () => {
    if (!importPreview) return

    setImporting(true)
    try {
      const result = await apiClient.importCandidates(campaignId, {
        candidates: importPreview.candidates,
        job_mappings: importPreview.job_mappings,
        slot_mappings: importPreview.slot_mappings,
      })

      toast.success(`Successfully imported ${result.imported_count} candidates`)
      setShowImportDialog(false)
      setImportPreview(null)
      setSelectedFile(null)
      loadCampaign()
      loadPipelineBoard()
    } catch (error: any) {
      console.error('Error importing candidates:', error)
      toast.error(error.response?.data?.detail || 'Failed to import candidates')
    } finally {
      setImporting(false)
    }
  }

  const openAdvanceDialog = async () => {
    try {
      // Load available interviews and voice campaigns
      const [interviews, voiceCampaigns] = await Promise.all([
        apiClient.getAvailableInterviews(),
        apiClient.getAvailableVoiceCampaigns(),
      ])
      setAvailableInterviews(interviews || [])
      setAvailableVoiceCampaigns(voiceCampaigns || [])
      setAdvanceForm({
        target_stage: moveTargetOptions[0] || 'technical_assessment',
        interview_id: '',
        voice_campaign_id: '',
        decision: 'pending',
        decision_notes: '',
      })
      setShowAdvanceDialog(true)
    } catch (error) {
      console.error('Error loading advance options:', error)
      toast.error('Failed to load move options')
    }
  }

  const handleAdvanceStage = async () => {
    if (!advanceForm.target_stage) {
      toast.error('Please select a destination stage')
      return
    }

    // Validate required selections
    if (advanceForm.target_stage === 'technical_assessment' && !advanceForm.interview_id) {
      toast.error('Please select a technical assessment to link candidates')
      return
    }

    if (advanceForm.target_stage === 'voice_screening' && !advanceForm.voice_campaign_id) {
      toast.error('Please select a voice campaign to link candidates')
      return
    }

    setAdvancing(true)
    try {
      // First advance the candidates
      await apiClient.advanceCampaignCandidates(campaignId, {
        candidate_ids: Array.from(selectedCandidates),
        target_stage: advanceForm.target_stage,
        interview_id: advanceForm.interview_id || undefined,
        voice_campaign_id: advanceForm.voice_campaign_id || undefined,
      })

      // If moving to completed, set decision for each candidate
      if (advanceForm.target_stage === 'completed' && advanceForm.decision !== 'pending') {
        const decisionPromises = Array.from(selectedCandidates).map((candidateId) =>
          apiClient.setCandidateDecision(campaignId, candidateId, {
            decision: advanceForm.decision,
            notes: advanceForm.decision_notes || undefined,
          })
        )
        await Promise.all(decisionPromises)
      }
      setShowAdvanceDialog(false)
      setSelectedCandidates(new Set())
      setAdvanceForm({
        target_stage: 'technical_assessment',
        interview_id: '',
        voice_campaign_id: '',
        decision: 'pending',
        decision_notes: '',
      })
      loadPipelineBoard()
    } catch (error: any) {
      console.error('Error advancing candidates:', error)
      toast.error(error.response?.data?.detail || 'Failed to move candidates')
    } finally {
      setAdvancing(false)
    }
  }

  const handleSetDecision = async () => {
    if (!decisionCandidate) return

    try {
      console.log('Setting decision:', { campaignId, candidateId: decisionCandidate.id, decision: decisionForm.decision })
      const result = await apiClient.setCandidateDecision(campaignId, decisionCandidate.id, {
        decision: decisionForm.decision,
        notes: decisionForm.notes,
      })
      console.log('Decision set result:', result)
      setShowDecisionDialog(false)
      setDecisionCandidate(null)
      setDecisionForm({ decision: 'pending', notes: '' })
      loadPipelineBoard()
    } catch (error: any) {
      console.error('Error setting decision:', error)
      toast.error(error.response?.data?.detail || 'Failed to set decision')
    }
  }

  const handleDeleteCandidate = async (candidateId: string) => {
    try {
      await apiClient.deleteCampaignCandidate(campaignId, candidateId)
      loadPipelineBoard()
    } catch (error: any) {
      console.error('Error deleting candidate:', error)
      toast.error(error.response?.data?.detail || 'Failed to delete candidate')
    }
  }

  const toggleCandidateSelection = (candidateId: string) => {
    const newSelection = new Set(selectedCandidates)
    if (newSelection.has(candidateId)) {
      newSelection.delete(candidateId)
    } else {
      newSelection.add(candidateId)
    }
    setSelectedCandidates(newSelection)
  }

  const handleSelectAllInStage = (stage: keyof PipelineBoard, checked: boolean) => {
    const newSelection = new Set(selectedCandidates)
    const stageCandidates = filteredBoard[stage]

    if (checked) {
      // Add all candidates in this stage
      stageCandidates.forEach((c) => newSelection.add(c.id))
    } else {
      // Remove all candidates in this stage
      stageCandidates.forEach((c) => newSelection.delete(c.id))
    }

    setSelectedCandidates(newSelection)
  }

  const isStageFullySelected = (stage: keyof PipelineBoard): boolean => {
    const stageCandidates = filteredBoard[stage]
    if (stageCandidates.length === 0) return false
    return stageCandidates.every((c) => selectedCandidates.has(c.id))
  }

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'resume_screening':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'technical_assessment':
        return 'bg-purple-100 text-purple-800 border-purple-200'
      case 'voice_screening':
        return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getRecommendationBadge = (recommendation: string) => {
    switch (recommendation) {
      case 'highly_recommended':
        return <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-green-100 text-green-800">Highly Recommended</span>
      case 'recommended':
        return <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-800">Recommended</span>
      case 'not_recommended':
        return <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-red-100 text-red-800">Not Recommended</span>
      default:
        return <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-800">Pending</span>
    }
  }


  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.URL.revokeObjectURL(url)
  }


  const openCandidateReport = async (candidate: Candidate) => {
    try {
      setCandidateReportLoading(true)
      setShowCandidateReportDialog(true)
      const report = await apiClient.getCandidateReport(campaignId, candidate.id)
      setCandidateReport(report)
    } catch (error: any) {
      console.error('Error loading candidate report:', error)
      toast.error('Failed to load candidate report')
      setShowCandidateReportDialog(false)
    } finally {
      setCandidateReportLoading(false)
    }
  }

  const handleDownloadCandidateCsv = async () => {
    if (!candidateReport?.candidate?.id) return
    try {
      const blob = await apiClient.downloadCandidateReportCsv(
        campaignId,
        candidateReport.candidate.id
      )
      downloadBlob(blob, `candidate_${candidateReport.candidate.id}.csv`)
    } catch (error: any) {
      console.error('Error downloading candidate CSV:', error)
      toast.error('Failed to download CSV')
    }
  }

  const handleDownloadCandidatePdf = async () => {
    if (!candidateReport?.candidate?.id) return
    try {
      const blob = await apiClient.downloadCandidateReportPdf(
        campaignId,
        candidateReport.candidate.id
      )
      downloadBlob(blob, `candidate_${candidateReport.candidate.id}.pdf`)
    } catch (error: any) {
      console.error('Error downloading candidate PDF:', error)
      toast.error('Failed to download PDF')
    }
  }

  const openDeleteCampaignDialog = () => {
    setShowDeleteCampaignDialog(true)
  }

  const openDeleteCandidateDialog = (candidateId: string) => {
    setDeleteCandidateId(candidateId)
    setShowDeleteCandidateDialog(true)
  }

  const confirmDeleteCampaign = async () => {
    setShowDeleteCampaignDialog(false)
    await handleDeleteCampaign()
  }

  const confirmDeleteCandidate = async () => {
    if (!deleteCandidateId) return
    setShowDeleteCandidateDialog(false)
    const candidateId = deleteCandidateId
    setDeleteCandidateId(null)
    await handleDeleteCandidate(candidateId)
  }

  const getDecisionBadge = (decision: string) => {
    switch (decision) {
      case 'selected':
        return <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-green-100 text-green-800">Selected</span>
      case 'rejected':
        return <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-red-100 text-red-800">Rejected</span>
      case 'hold':
        return <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-yellow-100 text-yellow-800">Hold</span>
      default:
        return <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-800">Pending</span>
    }
  }

  const getDecisionIcon = (decision: string) => {
    switch (decision) {
      case 'selected':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />
      case 'rejected':
        return <XCircle className="w-4 h-4 text-red-600" />
      case 'hold':
        return <Clock className="w-4 h-4 text-yellow-600" />
      default:
        return null
    }
  }

  const stageTitles: Record<keyof PipelineBoard, string> = {
    resume_screening: 'Resume Screening',
    technical_assessment: 'Technical Assessment',
    voice_screening: 'Voice Screening',
    completed: 'Completed',
  }

  const stageOrder: Array<keyof PipelineBoard> = [
    'resume_screening',
    'technical_assessment',
    'voice_screening',
    'completed',
  ]

  const candidateStageMap = new Map<string, keyof PipelineBoard>()
  stageOrder.forEach((stage) => {
    filteredBoard[stage].forEach((candidate) => {
      candidateStageMap.set(candidate.id, stage)
    })
  })
  const selectedStages = new Set<keyof PipelineBoard>()
  selectedCandidates.forEach((candidateId) => {
    const stage = candidateStageMap.get(candidateId)
    if (stage) selectedStages.add(stage)
  })
  const selectedStage = selectedStages.size === 1 ? Array.from(selectedStages)[0] : null
  const hasCompletedSelection = selectedStages.has('completed')
  const hasMixedSelection = selectedStages.size > 1
  const canMoveSelected = selectedCandidates.size > 0 && !hasCompletedSelection && !hasMixedSelection
  const moveTargetOptions = (selectedStage
    ? (['technical_assessment', 'voice_screening', 'completed'] as const).filter(
        (stage) => stage !== selectedStage
      )
    : (['technical_assessment', 'voice_screening', 'completed'] as const))

  if (!campaign) {
    return (
      <div className="p-8">
        <div className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-80" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={`stat-skel-${idx}`} className="bg-white border border-slate-200 rounded-lg p-4">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-4 w-28 mt-3" />
              </div>
            ))}
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <Skeleton className="h-4 w-24" />
            <div className="mt-3 flex flex-wrap gap-2">
              {Array.from({ length: 6 }).map((_, idx) => (
                <Skeleton key={`filter-skel-${idx}`} className="h-8 w-24 rounded-md" />
              ))}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              {stageOrder.map((stage) => (
                <div key={`board-skel-${stage}`} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-16 mt-2" />
                    </div>
                    <Skeleton className="h-6 w-8 rounded-md" />
                  </div>
                  <div className="space-y-3">
                    {Array.from({ length: 2 }).map((_, idx) => (
                      <div key={`card-skel-${stage}-${idx}`} className="bg-white border border-slate-200 rounded-lg p-3">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-40 mt-2" />
                        <Skeleton className="h-3 w-28 mt-2" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const totalCandidates = Object.values(filteredBoard).reduce((sum, stage) => sum + stage.length, 0)

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/dashboard/campaigns"
          className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Batches
        </Link>

        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{campaign.name}</h1>
            {campaign.description && (
              <p className="text-slate-600 mt-1">{campaign.description}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Link href={`/dashboard/campaigns/${campaignId}/report`}>
              <Button variant="outline" size="sm">
                <FileText className="w-4 h-4 mr-2" />
                Report
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={openSettingsDialog}>
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-indigo-600" />
            <div>
              <div className="text-2xl font-semibold text-slate-900 tabular-nums">
                {totalCandidates}
              </div>
              <div className="text-sm text-slate-600">Total Candidates</div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Briefcase className="w-8 h-8 text-blue-600" />
            <div>
              <div className="text-2xl font-semibold text-slate-900 tabular-nums">
                {campaign.statistics?.unique_jobs || 0}
              </div>
              <div className="text-sm text-slate-600">Job Roles</div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Calendar className="w-8 h-8 text-purple-600" />
            <div>
              <div className="text-2xl font-semibold text-slate-900 tabular-nums">
                {campaign.metadata?.slots?.length || 0}
              </div>
              <div className="text-sm text-slate-600">Interview Slots</div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div>
            <div className="text-sm text-slate-600 mb-2">By Stage</div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>Resume:</span>
                <span className="font-medium">{filteredBoard.resume_screening.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Technical:</span>
                <span className="font-medium">{filteredBoard.technical_assessment.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Voice:</span>
                <span className="font-medium">{filteredBoard.voice_screening.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Completed:</span>
                <span className="font-medium">{filteredBoard.completed.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      {(jobs.length > 0 || (campaign?.metadata?.slots && campaign.metadata.slots.length > 0)) && (
        <div className="mb-6">
          <div
            className={`transition-all duration-200 ease-out ${
              showFilters
                ? 'max-h-[520px] opacity-100'
                : 'max-h-0 opacity-0 pointer-events-none'
            } overflow-hidden`}
          >
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-700">Filters</div>
                  <div className="text-xs text-slate-500">Refine the board by role or slot</div>
                </div>
                <div className="text-xs text-slate-500">
                  {selectedJobFilter === 'all' ? 'All roles' : 'Single role'} ·{' '}
                  {selectedSlotFilter === 'all' ? 'All slots' : selectedSlotFilter === 'no_slot' ? 'No slot' : 'Single slot'}
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {jobs.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Job Roles</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        onClick={() => handleJobFilterChange('all')}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors border ${
                          selectedJobFilter === 'all'
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        All Jobs ({totalCandidates})
                      </button>
                      {jobs.map((job) => {
                        const jobCandidateCount = jobCandidateCounts[job.id] || 0

                        if (jobCandidateCount === 0) return null

                        return (
                          <button
                            key={job.id}
                            onClick={() => handleJobFilterChange(job.id)}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors border ${
                              selectedJobFilter === job.id
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {job.title} ({jobCandidateCount})
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {campaign?.metadata?.slots && campaign.metadata.slots.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Interview Slots</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        onClick={() => handleSlotFilterChange('all')}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors border ${
                          selectedSlotFilter === 'all'
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        All Slots
                      </button>
                      {campaign.metadata.slots.map((slot: any, idx: number) => {
                        const slotCount = slotCandidateCounts[slot.name] || 0
                        if (slotCount === 0) return null

                        return (
                          <button
                            key={idx}
                            onClick={() => handleSlotFilterChange(slot.name)}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors border ${
                              selectedSlotFilter === slot.name
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {slot.name} ({slotCount})
                          </button>
                        )
                      })}
                      <button
                        onClick={() => handleSlotFilterChange('no_slot')}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors border ${
                          selectedSlotFilter === 'no_slot'
                            ? 'bg-amber-600 border-amber-600 text-white'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        No Slot Assigned
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mb-2">
        <div className="flex items-center gap-2">
          <label htmlFor="file-upload">
            <Button className="bg-indigo-600 hover:bg-indigo-700" asChild>
              <span>
                <Upload className="w-4 h-4 mr-2" />
                Import Excel
              </span>
            </Button>
          </label>
          <a
            href="/samples/campaigns/sample_campaign_candidates.csv"
            download
            className="text-xs text-indigo-600 hover:text-indigo-700 hover:underline"
          >
            Download Sample CSV
          </a>
        </div>
        <input
          id="file-upload"
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleFileSelect}
        />

        <Button variant="outline" onClick={() => setShowAddCandidateDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Candidate
        </Button>

        {selectedCandidates.size > 0 && (
          <>
            <Button
              variant="outline"
              onClick={openAdvanceDialog}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              disabled={!canMoveSelected}
            >
              <ChevronRight className="w-4 h-4 mr-2" />
              Move ({selectedCandidates.size})
            </Button>
            <Button
              variant="outline"
              onClick={() => setSelectedCandidates(new Set())}
              className="text-slate-600"
            >
              Clear Selection
            </Button>
          </>
        )}

        <div className="ml-auto flex items-center">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            aria-label="Toggle filters"
          >
            <Filter className="w-4 h-4" />
          </Button>
        </div>
      </div>
      {!canMoveSelected && selectedCandidates.size > 0 && (
        <div className="mb-6 text-xs text-slate-500">
          {hasCompletedSelection
            ? 'Completed candidates are locked. Update decision instead.'
            : 'Select candidates from a single stage to move them.'}
        </div>
      )}

      {/* Kanban Pipeline Board */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {stageOrder.map((stage) => (
              <div key={`skel-${stage}`} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-16 mt-2" />
                  </div>
                  <Skeleton className="h-6 w-8 rounded-md" />
                </div>
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, idx) => (
                    <div key={`card-skel-${stage}-${idx}`} className="bg-white border border-slate-200 rounded-lg p-3">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-40 mt-2" />
                      <Skeleton className="h-3 w-28 mt-2" />
                      <div className="mt-3 flex gap-2">
                        <Skeleton className="h-6 w-full" />
                        <Skeleton className="h-6 w-6" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {selectedJobFilter !== 'all' && (
              <div className="mb-4 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
                <div className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-blue-900">
                    Showing candidates for{' '}
                    <span className="font-semibold">
                      {jobs.find((j) => j.id === selectedJobFilter)?.title || 'Selected Job'}
                    </span>
                  </span>
                </div>
                <button
                  onClick={() => handleJobFilterChange('all')}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Clear role filter
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              {stageOrder.map((stage) => (
                <div key={stage} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-slate-900 text-sm">{stageTitles[stage]}</h3>
                      <div className="text-xs text-slate-500">Stage queue</div>
                    </div>
                    <span className="px-2 py-1 rounded-md text-xs font-medium bg-slate-200 text-slate-700">
                      {filteredBoard[stage].length}
                    </span>
                  </div>
                  {filteredBoard[stage].length > 0 && stage !== 'completed' && (
                    <label className="mb-3 flex items-center gap-2 text-xs text-slate-600 cursor-pointer hover:text-slate-900">
                      <input
                        type="checkbox"
                        checked={isStageFullySelected(stage)}
                        onChange={(e) => handleSelectAllInStage(stage, e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Select All</span>
                    </label>
                  )}

                  <div className="space-y-3">
                    {filteredBoard[stage].length === 0 ? (
                      <div className="text-center py-8 text-sm text-slate-400">
                        No candidates in this stage
                      </div>
                    ) : (
                      filteredBoard[stage].map((candidate) => (
                        <div
                          key={candidate.id}
                          className={`bg-white border border-slate-200 rounded-lg p-3 shadow-sm transition-shadow hover:shadow ${
                            selectedCandidates.has(candidate.id) ? 'ring-2 ring-indigo-500' : ''
                          }`}
                        >
                          <div className="flex items-start gap-2 mb-2">
                            <input
                              type="checkbox"
                              checked={selectedCandidates.has(candidate.id)}
                              onChange={() => toggleCandidateSelection(candidate.id)}
                              onClick={(e) => e.stopPropagation()}
                              disabled={stage === 'completed'}
                              className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-slate-900 text-sm truncate">
                                {candidate.candidate_name}
                              </div>
                              <div className="text-xs text-slate-600 truncate">
                                {candidate.candidate_email}
                              </div>
                              <div className="text-xs text-slate-500 truncate mt-1">
                                {jobs.find((j) => j.id === candidate.job_id)?.title || 'No Job'}
                              </div>
                            </div>
                            <div className="shrink-0">
                              {getDecisionIcon(candidate.final_decision)}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            {getDecisionBadge(candidate.final_decision)}
                            {candidate.recommendation !== 'pending' &&
                              getRecommendationBadge(candidate.recommendation)}
                          </div>

                          <div className="space-y-1">
                            {candidate.resume_match_score && (
                              <div className="text-xs text-slate-600">
                                Resume: {candidate.resume_match_score.toFixed(0)}%
                              </div>
                            )}
                            {candidate.interview_slot?.slot_name && (
                              <div className="text-xs text-slate-600">
                                Slot: {candidate.interview_slot.slot_name}
                              </div>
                            )}
                          </div>

                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDecisionCandidate(candidate)
                            setDecisionForm({ decision: candidate.final_decision, notes: '' })
                            setShowDecisionDialog(true)
                          }}
                          className="flex-1 px-2 py-1.5 text-xs border border-slate-300 rounded-md hover:bg-slate-50"
                        >
                          Decision
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openCandidateReport(candidate)
                          }}
                          className="px-2 py-1.5 text-xs border border-slate-300 rounded-md hover:bg-slate-50"
                        >
                          Report
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openDeleteCandidateDialog(candidate.id)
                          }}
                          className="px-2 py-1.5 text-xs border border-red-300 text-red-700 rounded-md hover:bg-red-50"
                        >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Import Preview Dialog */}
      {showImportDialog && importPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold">Confirm Import</h2>
            </div>

            <div className="p-6">
              <div className="mb-6">
                <h3 className="font-medium mb-2">Import Summary</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-slate-600">Total Rows</div>
                    <div className="text-2xl font-semibold tabular-nums">{importPreview.total_rows}</div>
                  </div>
                  <div>
                    <div className="text-slate-600">Valid</div>
                    <div className="text-2xl font-semibold tabular-nums text-green-600">
                      {importPreview.valid_rows}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-600">Invalid</div>
                    <div className="text-2xl font-semibold tabular-nums text-red-600">
                      {importPreview.invalid_rows}
                    </div>
                  </div>
                </div>
              </div>

              {importPreview.errors.length > 0 && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <h4 className="font-medium text-red-900 mb-2">Errors:</h4>
                  <ul className="text-sm text-red-700 space-y-1">
                    {importPreview.errors.slice(0, 5).map((error: string, i: number) => (
                      <li key={i}>• {error}</li>
                    ))}
                    {importPreview.errors.length > 5 && (
                      <li>... and {importPreview.errors.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}

              <div className="mb-6">
                <h4 className="font-medium mb-2">Preview (first 10 rows)</h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Name</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Email</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Job Role</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Slot</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {importPreview.candidates.slice(0, 10).map((c: any, i: number) => (
                        <tr key={i}>
                          <td className="px-3 py-2">{c.name}</td>
                          <td className="px-3 py-2">{c.email}</td>
                          <td className="px-3 py-2">{c.job_role || '-'}</td>
                          <td className="px-3 py-2">{c.slot || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowImportDialog(false)
                  setImportPreview(null)
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmImport}
                disabled={importing || importPreview.valid_rows === 0}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {importing ? 'Importing...' : `Import ${importPreview.valid_rows} Candidates`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Candidate Dialog */}
      {showAddCandidateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold">Add Candidate</h2>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  value={addCandidateForm.name}
                  onChange={(e) =>
                    setAddCandidateForm({ ...addCandidateForm, name: e.target.value })
                  }
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  value={addCandidateForm.email}
                  onChange={(e) =>
                    setAddCandidateForm({ ...addCandidateForm, email: e.target.value })
                  }
                  placeholder="john@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                <input
                  type="tel"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  value={addCandidateForm.phone}
                  onChange={(e) =>
                    setAddCandidateForm({ ...addCandidateForm, phone: e.target.value })
                  }
                  placeholder="1234567890"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-slate-700">
                    Job Role <span className="text-red-500">*</span>
                  </label>
                  <Link
                    href="/dashboard/resume-matching"
                    className="text-xs text-indigo-600 hover:text-indigo-700"
                    target="_blank"
                  >
                    + Create Job
                  </Link>
                </div>
                <select
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  value={addCandidateForm.job_id}
                  onChange={(e) =>
                    setAddCandidateForm({ ...addCandidateForm, job_id: e.target.value })
                  }
                >
                  <option value="">Select job role</option>
                  {jobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.title}
                    </option>
                  ))}
                </select>
                {jobs.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    No jobs found. Click "+ Create Job" to add one.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Interview Slot
                </label>
                <select
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  value={addCandidateForm.slot}
                  onChange={(e) =>
                    setAddCandidateForm({ ...addCandidateForm, slot: e.target.value })
                  }
                >
                  <option value="">No slot assigned</option>
                  {campaign?.metadata?.slots?.map((slot: any, idx: number) => (
                    <option key={idx} value={slot.name}>
                      {slot.name} ({slot.time_start} - {slot.time_end})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddCandidateDialog(false)
                  setAddCandidateForm({ name: '', email: '', phone: '', job_id: '', slot: '' })
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleAddCandidate} className="bg-indigo-600 hover:bg-indigo-700">
                Add Candidate
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Decision Dialog */}
      {showDecisionDialog && decisionCandidate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold">Set Decision</h2>
              <p className="text-sm text-slate-600 mt-1">{decisionCandidate.candidate_name}</p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Decision</label>
                <div className="space-y-2">
                  {[
                    { value: 'selected', label: 'Selected', color: 'green' },
                    { value: 'rejected', label: 'Rejected', color: 'red' },
                    { value: 'hold', label: 'Hold', color: 'yellow' },
                    { value: 'pending', label: 'Pending', color: 'gray' },
                  ].map((option) => (
                    <label key={option.value} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="decision"
                        value={option.value}
                        checked={decisionForm.decision === option.value}
                        onChange={(e) =>
                          setDecisionForm({ ...decisionForm, decision: e.target.value })
                        }
                        className="text-indigo-600"
                      />
                      <span className="text-sm">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  value={decisionForm.notes}
                  onChange={(e) => setDecisionForm({ ...decisionForm, notes: e.target.value })}
                  rows={3}
                  placeholder="Add notes about this decision..."
                />
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDecisionDialog(false)
                  setDecisionCandidate(null)
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleSetDecision} className="bg-indigo-600 hover:bg-indigo-700">
                Save Decision
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Move Stage Dialog */}
      {showAdvanceDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-lg w-full">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold">Move Candidates</h2>
              <p className="text-sm text-slate-600 mt-1">
                {selectedCandidates.size} candidate(s) selected
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Destination Stage <span className="text-red-500">*</span>
                  </label>
                <select
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  value={advanceForm.target_stage}
                  onChange={(e) =>
                    setAdvanceForm({ ...advanceForm, target_stage: e.target.value })
                  }
                >
                  {moveTargetOptions.includes('technical_assessment') && (
                    <option value="technical_assessment">Technical Assessment</option>
                  )}
                  {moveTargetOptions.includes('voice_screening') && (
                    <option value="voice_screening">Voice Screening</option>
                  )}
                  {moveTargetOptions.includes('completed') && (
                    <option value="completed">Completed</option>
                  )}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  You can skip stages - e.g., go directly from Resume Screening to Voice Screening
                </p>
              </div>

              {advanceForm.target_stage === 'technical_assessment' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-slate-700">
                      Link to Technical Assessment <span className="text-red-500">*</span>
                    </label>
                    <Link
                      href="/dashboard/coding-interviews"
                      className="text-xs text-indigo-600 hover:text-indigo-700"
                      target="_blank"
                    >
                      + Create Assessment
                    </Link>
                  </div>
                  <select
                    className="w-full px-3 py-2 border border-slate-300 rounded-md"
                    value={advanceForm.interview_id}
                    onChange={(e) =>
                      setAdvanceForm({ ...advanceForm, interview_id: e.target.value })
                    }
                  >
                    <option value="">Select technical assessment...</option>
                    {availableInterviews.map((interview) => (
                      <option key={interview.id} value={interview.id}>
                        {interview.title} ({interview.programming_language || 'General'})
                        {interview.scheduled_start_time &&
                          ` - ${new Date(interview.scheduled_start_time).toLocaleDateString()}`}
                      </option>
                    ))}
                  </select>
                  {availableInterviews.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      No technical assessments available. Click "+ Create Assessment" to add one.
                    </p>
                  )}
                </div>
              )}

              {advanceForm.target_stage === 'voice_screening' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-slate-700">
                      Link to Voice Campaign <span className="text-red-500">*</span>
                    </label>
                    <Link
                      href="/dashboard/voice-screening/campaigns/new"
                      className="text-xs text-indigo-600 hover:text-indigo-700"
                      target="_blank"
                    >
                      + Create Campaign
                    </Link>
                  </div>
                  <select
                    className="w-full px-3 py-2 border border-slate-300 rounded-md"
                    value={advanceForm.voice_campaign_id}
                    onChange={(e) =>
                      setAdvanceForm({ ...advanceForm, voice_campaign_id: e.target.value })
                    }
                  >
                    <option value="">Select voice campaign...</option>
                    {availableVoiceCampaigns.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.name} - {campaign.job_role || 'General'}
                      </option>
                    ))}
                  </select>
                  {availableVoiceCampaigns.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      No voice campaigns available. Click "+ Create Campaign" to add one.
                    </p>
                  )}
                </div>
              )}

              {advanceForm.target_stage === 'completed' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Hiring Decision <span className="text-red-500">*</span>
                    </label>
                    <div className="space-y-2">
                      {[
                        { value: 'selected', label: 'Selected', color: 'green', description: 'Candidate is hired' },
                        { value: 'rejected', label: 'Rejected', color: 'red', description: 'Candidate is not suitable' },
                        { value: 'hold', label: 'Hold', color: 'yellow', description: 'Decision pending' },
                        { value: 'pending', label: 'Pending', color: 'gray', description: 'Will decide later' },
                      ].map((option) => (
                        <label
                          key={option.value}
                          className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                            advanceForm.decision === option.value
                              ? 'border-indigo-500 bg-indigo-50'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="decision"
                            value={option.value}
                            checked={advanceForm.decision === option.value}
                            onChange={(e) =>
                              setAdvanceForm({ ...advanceForm, decision: e.target.value })
                            }
                            className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                          />
                          <div className="flex-1">
                            <div className="font-medium text-sm">{option.label}</div>
                            <div className="text-xs text-slate-600">{option.description}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Decision Notes (Optional)
                    </label>
                    <textarea
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                      value={advanceForm.decision_notes}
                      onChange={(e) =>
                        setAdvanceForm({ ...advanceForm, decision_notes: e.target.value })
                      }
                      rows={3}
                      placeholder="Add notes about this decision (e.g., reasons, feedback)..."
                    />
                  </div>
                </>
              )}
            </div>

            <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAdvanceDialog(false)
                  setAdvanceForm({
                    target_stage: 'technical_assessment',
                    interview_id: '',
                    voice_campaign_id: '',
                    decision: 'pending',
                    decision_notes: '',
                  })
                }}
                disabled={advancing}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAdvanceStage}
                disabled={advancing}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                  {advancing ? 'Moving...' : `Move ${selectedCandidates.size} Candidates`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Dialog */}
      {showSettingsDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold">Batch Settings</h2>
            </div>

            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div>
                <h3 className="text-sm font-medium text-slate-900 mb-3">Basic Information</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Batch Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-slate-300 rounded-md"
                      value={settingsForm.name}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, name: e.target.value })
                      }
                      placeholder="e.g., Summer 2024 Hiring"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Description
                    </label>
                    <textarea
                      className="w-full px-3 py-2 border border-slate-300 rounded-md"
                      value={settingsForm.description}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, description: e.target.value })
                      }
                      rows={3}
                      placeholder="Brief description of this batch"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Status
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-slate-300 rounded-md"
                      value={settingsForm.status}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, status: e.target.value })
                      }
                    >
                      <option value="active">Active</option>
                      <option value="completed">Completed</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Interview Slots */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-slate-900">Interview Slots</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddSlot}
                    className="text-xs"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Slot
                  </Button>
                </div>

                {settingsForm.slots.length === 0 ? (
                  <div className="border border-slate-200 rounded-lg p-6 text-center text-slate-500 text-sm">
                    No interview slots configured. Click "Add Slot" to create one.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {settingsForm.slots.map((slot, index) => (
                      <div
                        key={index}
                        className="border border-slate-200 rounded-lg p-4 space-y-3"
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1 space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">
                                Slot Name
                              </label>
                              <input
                                type="text"
                                className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                                value={slot.name}
                                onChange={(e) =>
                                  handleUpdateSlot(index, 'name', e.target.value)
                                }
                                placeholder="e.g., Morning Slot"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">
                                  Start Time
                                </label>
                                <TimePicker
                                  value={slot.time_start}
                                  onChange={(value) =>
                                    handleUpdateSlot(index, 'time_start', value)
                                  }
                                  placeholder="Select start time"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">
                                  End Time
                                </label>
                                <TimePicker
                                  value={slot.time_end}
                                  onChange={(value) =>
                                    handleUpdateSlot(index, 'time_end', value)
                                  }
                                  placeholder="Select end time"
                                />
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => handleRemoveSlot(index)}
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

              {/* Danger Zone */}
              <div className="border-t border-slate-200 pt-6">
                <h3 className="text-sm font-medium text-red-900 mb-2">Danger Zone</h3>
                <p className="text-sm text-slate-600 mb-3">
                  Deleting this campaign will remove all associated data. This action cannot be
                  undone.
                </p>
                <Button
                  variant="outline"
                  onClick={openDeleteCampaignDialog}
                  className="border-red-300 text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Batch
                </Button>
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowSettingsDialog(false)}
                disabled={savingSettings}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {savingSettings ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showCandidateReportDialog && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-white/20">
            {/* Header section with gradient background */}
            <div className="p-6 md:p-8 bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 text-white shrink-0">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight mb-1">Candidate Profile</h2>
                  <div className="flex items-center gap-3 text-indigo-100">
                    <span className="text-lg font-medium">{candidateReport?.candidate?.name || 'Unknown Candidate'}</span>
                    {candidateReport?.candidate?.email && (
                      <span className="text-sm px-2.5 py-1 bg-white/10 rounded-full">{candidateReport.candidate.email}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" className="bg-white/10 text-white border-white/20 hover:bg-white/20 hover:text-white transition-colors" onClick={handleDownloadCandidateCsv} disabled={candidateReportLoading}>
                    <Download className="w-4 h-4 mr-2" />
                    CSV
                  </Button>
                  <Button className="bg-white text-indigo-700 hover:bg-indigo-50 transition-colors" onClick={handleDownloadCandidatePdf} disabled={candidateReportLoading}>
                    <FileText className="w-4 h-4 mr-2" />
                    PDF
                  </Button>
                </div>
              </div>
              
              {!candidateReportLoading && candidateReport && (
                <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/10">
                    <div className="text-indigo-200 text-xs font-medium uppercase tracking-wider mb-1">Final Decision</div>
                    <div className={`font-semibold text-lg capitalize ${
                       candidateReport.candidate?.final_decision === 'selected' ? 'text-emerald-300' 
                     : candidateReport.candidate?.final_decision === 'rejected' ? 'text-red-300' 
                     : candidateReport.candidate?.final_decision === 'hold' ? 'text-amber-300' 
                     : 'text-white'
                    }`}>
                      {candidateReport.candidate?.final_decision || 'Pending'}
                    </div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/10">
                    <div className="text-indigo-200 text-xs font-medium uppercase tracking-wider mb-1">AI Recommendation</div>
                    <div className="font-semibold text-white capitalize">
                      {candidateReport.candidate?.recommendation?.replace('_', ' ') || 'Pending'}
                    </div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/10">
                    <div className="text-indigo-200 text-xs font-medium uppercase tracking-wider mb-1">Resume Match</div>
                    <div className="flex items-center gap-2">
                       <span className="font-bold text-xl text-white">
                         {candidateReport.candidate?.resume_match_score ? `${Number(candidateReport.candidate.resume_match_score).toFixed(0)}%` : '-'}
                       </span>
                    </div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/10">
                    <div className="text-indigo-200 text-xs font-medium uppercase tracking-wider mb-1">Coding Score</div>
                    <div className="flex items-center gap-2">
                       <span className="font-bold text-xl text-white">
                         {candidateReport.candidate?.coding_score ? `${Number(candidateReport.candidate.coding_score).toFixed(1)}%` : '-'}
                       </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Content Body */}
            <div className="p-6 md:p-8 overflow-y-auto bg-slate-50 flex-1">
              {candidateReportLoading ? (
                <div className="space-y-6">
                  <Skeleton className="h-32 w-full rounded-xl" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <Skeleton className="h-40 w-full rounded-xl" />
                     <Skeleton className="h-40 w-full rounded-xl" />
                  </div>
                </div>
              ) : (
                candidateReport && (
                  <div className="space-y-6">
                    {candidateReport.resume && (
                      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition-all hover:shadow-md">
                        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100">
                           <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                             <FileText className="w-4 h-4" />
                           </div>
                           <h3 className="text-base font-semibold text-slate-800">Resume Summary</h3>
                        </div>
                        <p className="text-sm leading-relaxed text-slate-600 whitespace-pre-wrap">
                          {candidateReport.resume.summary || 'No summary available.'}
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {candidateReport.coding && (
                        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition-all hover:shadow-md">
                          <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
                             <div className="flex items-center gap-2">
                               <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                                 <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                               </div>
                               <h3 className="text-base font-semibold text-slate-800">Coding Assessment</h3>
                             </div>
                             <span className={`px-2.5 py-1 text-xs font-semibold rounded-full capitalize ${
                               candidateReport.coding.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'
                             }`}>
                               {candidateReport.coding.status || 'Pending'}
                             </span>
                          </div>
                          {candidateReport.coding.summary ? (
                            <p className="text-sm text-slate-600 leading-relaxed">
                              {candidateReport.coding.summary}
                            </p>
                          ) : (
                            <p className="text-sm text-slate-400 italic">No detailed summary available yet.</p>
                          )}
                        </div>
                      )}

                      {candidateReport.voice && (
                        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition-all hover:shadow-md flex flex-col">
                          <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
                             <div className="flex items-center gap-2">
                               <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                                 <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>
                               </div>
                               <h3 className="text-base font-semibold text-slate-800">Voice Screening</h3>
                             </div>
                             <span className={`px-2.5 py-1 text-xs font-semibold rounded-full capitalize ${
                               candidateReport.voice.status === 'completed' || candidateReport.voice.status === 'passed' ? 'bg-green-100 text-green-700' 
                               : candidateReport.voice.status === 'failed' ? 'bg-red-100 text-red-700' 
                               : 'bg-slate-100 text-slate-700'
                             }`}>
                               {candidateReport.voice.status?.replace('_', ' ') || 'Pending'}
                             </span>
                          </div>
                          {candidateReport.voice.summary ? (
                            <div className="text-sm text-slate-600 leading-relaxed flex-1 whitespace-pre-wrap">
                              {candidateReport.voice.summary}
                            </div>
                          ) : (
                            <p className="text-sm text-slate-400 italic flex-1">No detailed transcript or summary available yet.</p>
                          )}
                        </div>
                      )}
                    </div>

                    {candidateReport.candidate?.decision_notes && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                        <div className="flex items-center gap-2 mb-2">
                           <h3 className="text-sm font-semibold text-amber-900">Decision Notes</h3>
                        </div>
                        <p className="text-sm text-amber-800 whitespace-pre-wrap leading-relaxed">
                          {candidateReport.candidate.decision_notes}
                        </p>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>

            <div className="p-5 border-t border-slate-200 bg-white flex justify-end shrink-0">
              <Button variant="outline" onClick={() => setShowCandidateReportDialog(false)} className="px-6 hover:bg-slate-100 transition-colors">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showDeleteCampaignDialog}
        onOpenChange={setShowDeleteCampaignDialog}
        onConfirm={confirmDeleteCampaign}
        title="Delete Batch"
        description="This will permanently remove the batch and all associated data. This action cannot be undone."
        confirmText="Delete Batch"
        cancelText="Cancel"
        variant="destructive"
      />

      <ConfirmDialog
        open={showDeleteCandidateDialog}
        onOpenChange={setShowDeleteCandidateDialog}
        onConfirm={confirmDeleteCandidate}
        title="Remove Candidate"
        description="This will remove the candidate from the batch. You can re-add them later if needed."
        confirmText="Remove Candidate"
        cancelText="Cancel"
        variant="destructive"
      />
    </div>
  )
}
