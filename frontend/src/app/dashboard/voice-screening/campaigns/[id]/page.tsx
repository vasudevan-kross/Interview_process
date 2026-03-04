'use client'

import { useEffect, useState, use, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { getCampaign, regenerateCampaignPrompt, deleteCampaign, deleteCandidate, updateCandidate, getCallHistory, getCandidateByToken, startCall, Campaign, type VoiceCandidate, type VoiceCandidatePublic, type CallHistory } from '@/lib/api/voice-screening'
import { ArrowLeft, RefreshCw, Loader2, Copy, Check, Plus, Users, Eye, Download, Phone as PhoneIcon, Edit, Trash2, Mic, MicOff } from 'lucide-react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { apiClient } from '@/lib/api/client'
import { toast } from 'sonner'
import Vapi from '@vapi-ai/web'

const VAPI_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY || ''
const VAPI_ASSISTANT_ID = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID || ''
const FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000'

export default function CampaignDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Add candidate modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', email: '', phone: '' })
  const [addLoading, setAddLoading] = useState(false)

  // Candidates list
  const [candidates, setCandidates] = useState<VoiceCandidate[]>([])
  const [loadingCandidates, setLoadingCandidates] = useState(false)

  // Detail modal for viewing transcript/recording
  const [selectedCandidate, setSelectedCandidate] = useState<VoiceCandidate | null>(null)
  const [callHistory, setCallHistory] = useState<CallHistory[]>([])
  const [loadingCallHistory, setLoadingCallHistory] = useState(false)

  // Regenerate confirmation dialog
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false)

  // Delete confirmation dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Test call state
  const [activeCallId, setActiveCallId] = useState<string | null>(null)
  const [callStatus, setCallStatus] = useState<string>('')
  const [currentCallId, setCurrentCallId] = useState<string | null>(null)
  const [currentToken, setCurrentToken] = useState<string | null>(null)
  const vapiRef = useRef<Vapi | null>(null)

  // Delete candidate confirmation
  const [deleteCandidateDialogOpen, setDeleteCandidateDialogOpen] = useState(false)
  const [candidateToDelete, setCandidateToDelete] = useState<string | null>(null)

  // Edit candidate modal
  const [showEditModal, setShowEditModal] = useState(false)
  const [editCandidate, setEditCandidate] = useState<VoiceCandidate | null>(null)
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '' })
  const [editLoading, setEditLoading] = useState(false)

  useEffect(() => {
    loadCampaign()
    loadCandidates()
  }, [resolvedParams.id])

  const loadCampaign = async () => {
    try {
      setLoading(true)
      const data = await getCampaign(resolvedParams.id)
      setCampaign(data)
    } catch (err: any) {
      console.error('Failed to load campaign:', err)
      setError(err.response?.data?.detail || 'Failed to load campaign')
    } finally {
      setLoading(false)
    }
  }

  const loadCandidates = async () => {
    try {
      setLoadingCandidates(true)
      const response = await apiClient['client'].get('/api/v1/voice-screening/candidates', {
        params: { campaign_id: resolvedParams.id }
      })
      const allCandidates = response.data || []
      setCandidates(allCandidates)
    } catch (err: any) {
      console.error('Failed to load candidates:', err)
    } finally {
      setLoadingCandidates(false)
    }
  }

  const handleRegenerate = () => {
    setRegenerateDialogOpen(true)
  }

  const confirmRegenerate = async () => {
    try {
      setRegenerating(true)
      setRegenerateDialogOpen(false)
      const updated = await regenerateCampaignPrompt(resolvedParams.id)
      setCampaign(updated)
      toast.success('Prompt regenerated successfully!')
    } catch (err: any) {
      console.error('Failed to regenerate prompt:', err)
      toast.error(err.response?.data?.detail || 'Failed to regenerate prompt')
    } finally {
      setRegenerating(false)
    }
  }

  const handleCandidateClick = async (candidate: VoiceCandidate) => {
    setSelectedCandidate(candidate)
    if (candidate.status === 'completed') {
      try {
        setLoadingCallHistory(true)
        const history = await getCallHistory(candidate.id)
        setCallHistory(history)
      } catch (err: any) {
        console.error('Failed to load call history:', err)
        toast.error('Failed to load call history')
      } finally {
        setLoadingCallHistory(false)
      }
    }
  }

  const copyPrompt = () => {
    if (campaign) {
      navigator.clipboard.writeText(campaign.generated_system_prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleDelete = () => {
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    try {
      setDeleting(true)
      setDeleteDialogOpen(false)
      await deleteCampaign(resolvedParams.id)
      toast.success('Campaign deleted successfully!')
      router.push('/dashboard/voice-screening/campaigns')
    } catch (err: any) {
      console.error('Failed to delete campaign:', err)
      toast.error(err.response?.data?.detail || 'Failed to delete campaign')
      setDeleting(false)
    }
  }

  const handleAddCandidate = async () => {
    if (!addForm.name.trim()) {
      toast.error('Name is required')
      return
    }

    try {
      setAddLoading(true)
      await apiClient['client'].post('/api/v1/voice-screening/candidates', {
        name: addForm.name,
        email: addForm.email || null,
        phone: addForm.phone || null,
        is_fresher: campaign?.candidate_type === 'fresher',
        campaign_id: resolvedParams.id, // Link to this campaign
      })
      toast.success(`${addForm.name} added to campaign!`)
      setShowAddModal(false)
      setAddForm({ name: '', email: '', phone: '' })
      loadCandidates() // Reload candidates list
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to add candidate')
    } finally {
      setAddLoading(false)
    }
  }

  // Fetch call data from VAPI after call ends
  const fetchCallData = async (token: string, callId: string) => {
    try {
      toast.info('Fetching transcript and recording from VAPI...')

      const response = await apiClient['client'].post(
        `/api/v1/voice-screening/candidates/token/${token}/fetch-call-data`,
        { call_id: callId }
      )

      if (response.data.status === 'success') {
        toast.success('Call data fetched successfully!')
        loadCandidates()
      } else if (response.data.status === 'pending') {
        toast.info('Call is still processing. Please wait a moment and try again.')
      }
    } catch (error: any) {
      console.error('Failed to fetch call data:', error)
      toast.error('Failed to fetch call data. You can try refreshing later.')
    }
  }

  // Test Call Handler
  const handleTestCall = async (candidate: VoiceCandidate) => {
    try {
      if (!VAPI_PUBLIC_KEY) {
        toast.error('Vapi public key not configured')
        return
      }

      setActiveCallId(candidate.id)
      setCurrentToken(candidate.interview_token)
      setCallStatus('connecting')

      // Fetch full candidate data with campaign vapi_config
      let fullCandidate: VoiceCandidatePublic | VoiceCandidate = candidate
      try {
        fullCandidate = await getCandidateByToken(candidate.interview_token)
      } catch (err) {
        console.error('Failed to fetch candidate config:', err)
      }

      const vapi = new Vapi(VAPI_PUBLIC_KEY)
      vapiRef.current = vapi

      const candidateToken = candidate.interview_token
      let capturedCallId: string | null = null

      vapi.on('call-start', () => {
        setCallStatus('active')
        toast.success('Call started!')
      })

      vapi.on('call-end', async () => {
        setCallStatus('ended')
        toast.info('Call ended. Fetching transcript and recording...')

        // Wait 10 seconds for VAPI to process the call (transcript generation takes time)
        await new Promise(resolve => setTimeout(resolve, 10000))

        // Fetch call data from VAPI using captured values
        if (capturedCallId) {
          await fetchCallData(candidateToken, capturedCallId)
        } else {
          toast.error('Could not fetch call data: Call ID not available')
        }

        setActiveCallId(null)
        setCurrentCallId(null)
        setCurrentToken(null)
        vapiRef.current = null
      })

      vapi.on('error', (error: any) => {
        console.error('Vapi error:', error)
        setCallStatus('error')
        setActiveCallId(null)
        toast.error('Call failed: ' + (error?.message || 'Unknown error'))
        vapiRef.current = null
      })

      // Start call with three-tier fallback
      let callResponse
      if (fullCandidate.vapi_config) {
        console.log('✅ Using dynamic campaign configuration')
        callResponse = await vapi.start(fullCandidate.vapi_config)
      } else if (VAPI_ASSISTANT_ID) {
        console.log('⚠️ Using static assistant ID')
        callResponse = await vapi.start(VAPI_ASSISTANT_ID, {
          variableValues: { candidate_name: candidate.name },
        })
      } else {
        console.log('⚠️ Using inline fallback')
        callResponse = await vapi.start({
          model: {
            provider: 'openai',
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `You are an HR screening assistant interviewing ${candidate.name}.`,
              },
            ],
          },
          voice: { provider: '11labs', voiceId: 'z0gdR3nhVl1Ig2kiEigL' },
          transcriber: { provider: 'deepgram', model: 'nova-2', language: 'en' },
        })
      }

      if (callResponse?.id) {
        capturedCallId = callResponse.id
        setCurrentCallId(capturedCallId)
        startCall(candidateToken, capturedCallId).catch(() => { })
      }
    } catch (error: any) {
      console.error('Test call error:', error)
      setActiveCallId(null)
      setCallStatus('')
      toast.error('Failed to start call')
    }
  }

  // End Call Handler
  const handleEndCall = () => {
    vapiRef.current?.stop()
    setActiveCallId(null)
    setCallStatus('')
  }

  // Copy Link Handler
  const handleCopyLink = (token: string) => {
    const link = `${FRONTEND_URL}/voice-interview/${token}`
    navigator.clipboard.writeText(link)
    toast.success('Interview link copied to clipboard!')
  }

  // Edit Candidate Handler
  const handleEditCandidate = (candidate: VoiceCandidate) => {
    setEditCandidate(candidate)
    setEditForm({
      name: candidate.name,
      email: candidate.email || '',
      phone: candidate.phone || ''
    })
    setShowEditModal(true)
  }

  const handleUpdateCandidate = async () => {
    if (!editCandidate || !editForm.name.trim()) {
      toast.error('Name is required')
      return
    }

    setEditLoading(true)
    try {
      await updateCandidate(editCandidate.id, {
        name: editForm.name.trim(),
        email: editForm.email.trim() || undefined,
        phone: editForm.phone.trim() || undefined
      })
      toast.success('Candidate updated successfully!')
      setShowEditModal(false)
      setEditCandidate(null)
      setEditForm({ name: '', email: '', phone: '' })
      loadCandidates()
    } catch (err: any) {
      console.error('Failed to update candidate:', err)
      toast.error(err.response?.data?.detail || 'Failed to update candidate')
    } finally {
      setEditLoading(false)
    }
  }

  // Delete Candidate Handler
  const handleDeleteCandidate = (candidateId: string) => {
    setCandidateToDelete(candidateId)
    setDeleteCandidateDialogOpen(true)
  }

  const confirmDeleteCandidate = async () => {
    if (!candidateToDelete) return
    try {
      await deleteCandidate(candidateToDelete)
      toast.success('Candidate deleted successfully!')
      setDeleteCandidateDialogOpen(false)
      setCandidateToDelete(null)
      loadCandidates()
    } catch (err: any) {
      console.error('Failed to delete candidate:', err)
      toast.error('Failed to delete candidate')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !campaign) {
    return (
      <div className="container mx-auto py-8">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-800">{error || 'Campaign not found'}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 max-w-5xl">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/dashboard/voice-screening/campaigns">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{campaign.name}</h1>
          <p className="text-muted-foreground">{campaign.job_role}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard/voice-screening/campaigns/${resolvedParams.id}/edit`}>
            <Button variant="outline">
              <Edit className="mr-2 h-4 w-4" />
              Edit Campaign
            </Button>
          </Link>
          <Button onClick={handleDelete} disabled={deleting} variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50">
            {deleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </>
            )}
          </Button>
          <Button onClick={() => setShowAddModal(true)} className="bg-gradient-to-r from-teal-500 to-green-500">
            <Plus className="mr-2 h-4 w-4" />
            Add Candidate
          </Button>
          <Button onClick={handleRegenerate} disabled={regenerating} variant="outline">
            {regenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Regenerating...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Regenerate Prompt
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Campaign Details */}
        <Card>
          <CardHeader>
            <CardTitle>Campaign Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {campaign.description && (
              <div>
                <h4 className="text-sm font-medium mb-2">Description</h4>
                <p className="text-sm text-muted-foreground">{campaign.description}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium mb-2">Interview Persona</h4>
                <Badge>{campaign.interview_persona}</Badge>
              </div>
              <div>
                <h4 className="text-sm font-medium mb-2">Candidate Type</h4>
                <Badge>{campaign.candidate_type}</Badge>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-2">Status</h4>
              {campaign.is_active ? (
                <Badge className="bg-green-500">Active</Badge>
              ) : (
                <Badge variant="secondary">Inactive</Badge>
              )}
            </div>

            <div className="text-xs text-muted-foreground">
              Created {formatDistanceToNow(new Date(campaign.created_at), { addSuffix: true })}
              {campaign.generation_model && ` • Generated with ${campaign.generation_model}`}
            </div>
          </CardContent>
        </Card>

        {/* Generated System Prompt */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>AI-Generated System Prompt</CardTitle>
                <CardDescription>This prompt guides the voice agent's behavior</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={copyPrompt}>
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap bg-muted p-4 rounded-md text-sm">
              {campaign.generated_system_prompt}
            </pre>
          </CardContent>
        </Card>

        {/* Custom Questions */}
        {campaign.custom_questions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Custom Questions ({campaign.custom_questions.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal list-inside space-y-2">
                {campaign.custom_questions.map((question, index) => (
                  <li key={index} className="text-sm">{question}</li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}

        {/* Expected Questions */}
        {campaign.generation_metadata?.expected_questions && campaign.generation_metadata.expected_questions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Expected Questions</CardTitle>
              <CardDescription>Questions the AI will likely ask during the interview</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal list-inside space-y-2">
                {campaign.generation_metadata.expected_questions.map((question, index) => (
                  <li key={index} className="text-sm">{question}</li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}

        {/* Structured Data Extraction Schema */}
        {campaign.generated_schema && Object.keys(campaign.generated_schema).length > 0 ? (
          <Card className="border-teal-200 bg-teal-50/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <svg className="h-5 w-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Structured Data Extraction ({Object.keys(campaign.generated_schema).length} fields)
              </CardTitle>
              <CardDescription>
                VAPI AI will automatically extract these fields from the interview conversation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-white rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Object.entries(campaign.generated_schema).map(([fieldName, fieldDef]: [string, any]) => (
                    <div key={fieldName} className="p-3 bg-teal-50 border border-teal-200 rounded-lg hover:shadow-sm transition-all">
                      <div className="flex items-start justify-between mb-1">
                        <p className="text-xs font-semibold text-teal-900 uppercase tracking-wide">
                          {fieldName.replace(/_/g, ' ')}
                        </p>
                        <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 border-teal-300 text-teal-700">
                          {fieldDef.type || 'string'}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        {fieldDef.description || 'No description'}
                      </p>
                      {fieldDef.example && (
                        <p className="text-xs text-gray-500 italic mt-1">
                          e.g., {fieldDef.example}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-4 p-3 bg-teal-100 rounded-lg border border-teal-200">
                  <p className="text-xs text-teal-800">
                    <strong>How it works:</strong> During the interview, VAPI's AI analyzes the conversation in real-time and automatically
                    extracts these fields. After the call ends, you'll see all extracted data in the candidate details view, similar to the
                    templates shown in the VAPI dashboard.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Required Information ({campaign.required_fields.length} fields)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {campaign.required_fields.map((field) => (
                  <Badge key={field} variant="outline">
                    {field.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Conversation Flow */}
        {campaign.generation_metadata?.conversation_flow && (
          <Card>
            <CardHeader>
              <CardTitle>Conversation Flow</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {campaign.generation_metadata.conversation_flow}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Knowledge Base Files */}
        {campaign.knowledge_base_file_ids && campaign.knowledge_base_file_ids.length > 0 && (
          <Card className="border-blue-200 bg-blue-50/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Knowledge Base ({campaign.knowledge_base_file_ids.length} files)
              </CardTitle>
              <CardDescription>
                These documents are available to VAPI AI during interviews (RAG-powered context)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-white rounded-lg p-4 space-y-2">
                {campaign.knowledge_base_file_ids.map((fileId, index) => (
                  <div key={fileId} className="flex items-center gap-2 text-sm p-2 bg-blue-50 rounded border border-blue-100">
                    <svg className="h-4 w-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <span className="flex-1 font-medium text-blue-900">Knowledge Base File {index + 1}</span>
                    <span className="text-xs text-blue-600">ID: {fileId.substring(0, 8)}...</span>
                  </div>
                ))}
                <div className="mt-4 p-3 bg-blue-100 rounded-lg border border-blue-200">
                  <p className="text-xs text-blue-800">
                    <strong>How it works:</strong> During the interview, when the candidate mentions topics related to your uploaded documents,
                    VAPI AI can reference the content to ask more relevant, context-aware questions.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* How to Initiate Interviews */}
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PhoneIcon className="h-5 w-5 text-green-600" />
              How to Start Interviews
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="bg-white rounded-lg p-4 border border-green-200">
                <h4 className="font-semibold text-green-800 mb-2 flex items-center gap-2">
                  <span className="bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">1</span>
                  Test Call (Browser)
                </h4>
                <p className="text-sm text-gray-700 ml-8">
                  Go to <strong>Candidates</strong> tab → Click the <PhoneIcon className="inline h-3 w-3" /> phone icon next to a candidate.
                  The call will start in your browser using your microphone. Great for testing!
                </p>
              </div>

              <div className="bg-white rounded-lg p-4 border border-green-200">
                <h4 className="font-semibold text-green-800 mb-2 flex items-center gap-2">
                  <span className="bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">2</span>
                  Real Phone Interview
                </h4>
                <p className="text-sm text-gray-700 ml-8">
                  Go to <strong>Candidates</strong> tab → Click the <Copy className="inline h-3 w-3" /> copy icon next to a candidate →
                  Share the link with them via email/SMS. When they open it and click "Start Interview", VAPI will call their actual phone number.
                </p>
              </div>

              <div className="bg-white rounded-lg p-4 border border-green-200">
                <h4 className="font-semibold text-green-800 mb-2 flex items-center gap-2">
                  <span className="bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">3</span>
                  View Results
                </h4>
                <p className="text-sm text-gray-700 ml-8">
                  After the call ends, go to <strong>Candidates</strong> tab → Click the <Eye className="inline h-3 w-3" /> eye icon to view:
                  AI summary, key points, technical assessment, recording, transcript, and extracted data.
                </p>
              </div>

              <div className="mt-4 p-3 bg-green-100 rounded-lg border border-green-300">
                <p className="text-xs text-green-900">
                  <strong>💡 Pro Tip:</strong> The AI will use your uploaded knowledge base files to ask context-aware questions.
                  For example, if you uploaded a PDF about your tech stack and the candidate mentions "React",
                  VAPI can reference your document to ask specific questions about your React requirements.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Active Call Banner */}
        {activeCallId && (
          <Card className="border-green-300 bg-green-50">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                {callStatus === 'connecting' ? (
                  <Loader2 className="h-5 w-5 animate-spin text-green-600" />
                ) : (
                  <Mic className="h-5 w-5 text-green-600 animate-pulse" />
                )}
                <span className="font-medium text-green-800">
                  {callStatus === 'connecting' ? 'Connecting call...' : 'Call in progress — speak into your microphone'}
                </span>
              </div>
              <Button variant="destructive" size="sm" onClick={handleEndCall}>
                <MicOff className="h-4 w-4 mr-2" />
                End Call
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Candidates Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Candidates ({candidates.length})
                </CardTitle>
                <CardDescription>
                  Candidates using this campaign's interview configuration
                </CardDescription>
              </div>
              <Button onClick={() => setShowAddModal(true)} size="sm" className="bg-gradient-to-r from-teal-500 to-green-500">
                <Plus className="mr-2 h-4 w-4" />
                Add Candidate
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingCandidates ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : candidates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No candidates added yet</p>
                <p className="text-sm mt-1">Add candidates to start using this campaign</p>
              </div>
            ) : (
              <div className="space-y-3">
                {candidates.map((candidate) => (
                  <div
                    key={candidate.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{candidate.name}</h4>
                        <Badge
                          className={
                            candidate.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : candidate.status === 'in_progress'
                                ? 'bg-blue-100 text-blue-800'
                                : candidate.status === 'failed'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-gray-100 text-gray-800'
                          }
                        >
                          {candidate.status}
                        </Badge>
                      </div>
                      <div className="flex gap-4 mt-1 text-sm text-muted-foreground">
                        {candidate.email && <span>{candidate.email}</span>}
                        {candidate.phone && <span>{candidate.phone}</span>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {/* Test Call */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTestCall(candidate)}
                        disabled={activeCallId !== null}
                        title="Test Call (speak in your browser)"
                      >
                        <PhoneIcon className="h-4 w-4 text-green-600" />
                      </Button>

                      {/* Copy Shareable Link */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyLink(candidate.interview_token)}
                        title="Copy shareable interview link"
                      >
                        <Copy className="h-4 w-4 text-blue-600" />
                      </Button>

                      {/* View Details - Only show for completed interviews */}
                      {candidate.status === 'completed' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCandidateClick(candidate)}
                          title="View call history, AI summary & assessment"
                        >
                          <Eye className="h-4 w-4 text-purple-600" />
                        </Button>
                      )}

                      {/* Edit Candidate */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditCandidate(candidate)}
                        title="Edit candidate details"
                      >
                        <Edit className="h-4 w-4 text-orange-600" />
                      </Button>

                      {/* Delete Candidate */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteCandidate(candidate.id)}
                        title="Delete candidate"
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Candidate Details Modal */}
      {selectedCandidate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedCandidate(null)}>
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <PhoneIcon className="h-5 w-5" />
                    {selectedCandidate.name}
                  </CardTitle>
                  <CardDescription>
                    {selectedCandidate.email && <span>{selectedCandidate.email}</span>}
                    {selectedCandidate.phone && <span className="ml-4">{selectedCandidate.phone}</span>}
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedCandidate(null)}>
                  ✕
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {loadingCallHistory ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : callHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No call history available for this candidate.
                </div>
              ) : (
                <>
                  {callHistory.map((call) => (
                    <div key={call.id} className="space-y-4 border-b pb-6 last:border-b-0">
                      {/* Recording Player */}
                      {call.recording_url && (
                        <div>
                          <h4 className="font-medium mb-3 flex items-center gap-2">
                            <PhoneIcon className="h-4 w-4" />
                            Interview Recording
                          </h4>
                          <audio controls className="w-full" src={call.recording_url}>
                            Your browser does not support the audio element.
                          </audio>
                          <div className="mt-2 flex gap-2">
                            <a href={call.recording_url} download>
                              <Button variant="outline" size="sm">
                                <Download className="h-4 w-4 mr-2" />
                                Download Recording
                              </Button>
                            </a>
                          </div>
                        </div>
                      )}

                      {/* AI Summary */}
                      {call.interview_summary && (
                        <div>
                          <h4 className="font-medium mb-3">AI Interview Summary</h4>
                          <div className="bg-muted p-4 rounded-md">
                            <p className="text-sm whitespace-pre-wrap">{call.interview_summary}</p>
                          </div>
                        </div>
                      )}

                      {/* Key Points */}
                      {call.key_points && call.key_points.length > 0 && (
                        <div>
                          <h4 className="font-medium mb-3">Key Points</h4>
                          <ul className="list-disc list-inside space-y-1">
                            {call.key_points.map((point, idx) => (
                              <li key={idx} className="text-sm">{point}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Technical Assessment */}
                      {call.technical_assessment && Object.keys(call.technical_assessment).length > 0 && (
                        <div>
                          <h4 className="font-medium mb-3">Technical Assessment</h4>
                          <div className="grid grid-cols-2 gap-4">
                            {Object.entries(call.technical_assessment).map(([key, value]) => {
                              if (!value) return null
                              return (
                                <div key={key} className="p-3 border rounded-lg">
                                  <p className="text-xs text-muted-foreground uppercase mb-1">
                                    {key.replace(/_/g, ' ')}
                                  </p>
                                  <p className="text-sm font-medium">
                                    {Array.isArray(value) ? value.join(', ') : String(value)}
                                  </p>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Transcript */}
                      {call.transcript && (
                        <div>
                          <h4 className="font-medium mb-3">Interview Transcript</h4>
                          <div className="bg-muted p-4 rounded-md max-h-96 overflow-y-auto">
                            <pre className="whitespace-pre-wrap text-sm font-mono">
                              {call.transcript}
                            </pre>
                          </div>
                        </div>
                      )}

                      {/* Structured Data Extraction - VAPI Template Style */}
                      {call.structured_data && Object.keys(call.structured_data).length > 0 && (
                        <div className="bg-gradient-to-r from-teal-50 to-emerald-50 rounded-lg p-5 border border-teal-200">
                          <h4 className="font-semibold mb-4 flex items-center gap-2 text-teal-700 text-lg">
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Structured Data Extraction
                          </h4>
                          <div className="bg-white rounded-lg p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {Object.entries(call.structured_data).map(([key, value]) => {
                                const displayValue = typeof value === 'object'
                                  ? JSON.stringify(value, null, 2)
                                  : String(value || '—')

                                const isEmpty = !value || value === '' || value === '—'

                                return (
                                  <div
                                    key={key}
                                    className={`p-3 rounded-lg border transition-all ${isEmpty
                                      ? 'bg-gray-50 border-gray-200 opacity-60'
                                      : 'bg-teal-50 border-teal-200 hover:shadow-sm'
                                      }`}
                                  >
                                    <div className="flex items-start justify-between mb-1">
                                      <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                                        {key.replace(/_/g, ' ')}
                                      </p>
                                      {!isEmpty && (
                                        <svg className="h-3 w-3 text-teal-600" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                      )}
                                    </div>
                                    <p className={`text-sm font-medium break-words ${isEmpty
                                      ? 'text-gray-400 italic'
                                      : 'text-gray-900'
                                      }`}>
                                      {typeof value === 'object' ? (
                                        <pre className="text-xs whitespace-pre-wrap font-mono bg-gray-50 p-2 rounded mt-1">
                                          {displayValue}
                                        </pre>
                                      ) : (
                                        displayValue
                                      )}
                                    </p>
                                  </div>
                                )
                              })}
                            </div>

                            {/* Summary Stats */}
                            <div className="mt-4 pt-4 border-t border-teal-100 flex items-center justify-between text-xs text-gray-600">
                              <div className="flex items-center gap-4">
                                <span className="flex items-center gap-1">
                                  <svg className="h-4 w-4 text-teal-600" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                  </svg>
                                  {Object.values(call.structured_data).filter(v => v && v !== '').length} fields captured
                                </span>
                                <span className="text-gray-400">•</span>
                                <span className="text-gray-500">
                                  {Object.keys(call.structured_data).length} total fields
                                </span>
                              </div>
                              <span className="px-2 py-1 bg-teal-100 text-teal-700 rounded-full font-medium">
                                AI Extracted
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add Candidate Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>Add Candidate to Campaign</CardTitle>
              <CardDescription>
                This candidate will use the AI-generated interview configuration for "{campaign?.name}"
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  placeholder="John Doe"
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={addForm.email}
                  onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                  placeholder="john@example.com"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={addForm.phone}
                  onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                  placeholder="+1234567890"
                />
              </div>
              <div className="flex gap-2 pt-4">
                <Button
                  onClick={handleAddCandidate}
                  disabled={addLoading}
                  className="flex-1 bg-gradient-to-r from-teal-500 to-green-500"
                >
                  {addLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Candidate
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowAddModal(false)}
                  disabled={addLoading}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Candidate Modal */}
      {showEditModal && editCandidate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowEditModal(false)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>Edit Candidate Details</CardTitle>
              <CardDescription>
                Update candidate information for "{editCandidate.name}"
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Name *</Label>
                <Input
                  id="edit-name"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="John Doe"
                />
              </div>
              <div>
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  placeholder="john@example.com"
                />
              </div>
              <div>
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  placeholder="+1234567890"
                />
              </div>
              <div className="flex gap-2 pt-4">
                <Button
                  onClick={handleUpdateCandidate}
                  disabled={editLoading}
                  className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500"
                >
                  {editLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Edit className="mr-2 h-4 w-4" />
                      Update Candidate
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowEditModal(false)
                    setEditCandidate(null)
                    setEditForm({ name: '', email: '', phone: '' })
                  }}
                  disabled={editLoading}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Regenerate Confirmation Dialog */}
      <ConfirmDialog
        open={regenerateDialogOpen}
        onOpenChange={setRegenerateDialogOpen}
        onConfirm={confirmRegenerate}
        title="Regenerate AI Prompt"
        description="This will generate a new AI prompt and update the interview flow. Any customizations to the current prompt will be lost. Are you sure you want to continue?"
        confirmText="Regenerate"
        variant="destructive"
      />

      {/* Delete Campaign Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title="Delete Campaign"
        description="This will permanently delete the campaign and all associated candidates, interviews, and call history. This action cannot be undone. Are you sure?"
        confirmText="Delete Campaign"
        variant="destructive"
      />

      {/* Delete Candidate Confirmation Dialog */}
      <ConfirmDialog
        open={deleteCandidateDialogOpen}
        onOpenChange={setDeleteCandidateDialogOpen}
        onConfirm={confirmDeleteCandidate}
        title="Delete Candidate"
        description="This will permanently delete the candidate and their interview history. This action cannot be undone. Are you sure?"
        confirmText="Delete Candidate"
        variant="destructive"
      />
    </div>
  )
}
