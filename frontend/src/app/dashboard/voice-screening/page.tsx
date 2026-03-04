'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
    Phone,
    Plus,
    Upload,
    Download,
    Copy,
    Eye,
    Edit,
    Trash2,
    Loader2,
    Search,
    PhoneCall,
    FileText,
    Play,
    X,
    Mic,
    MicOff,
    CheckCircle,
    AlertCircle,
    Clock,
    Briefcase,
    RefreshCw,
} from 'lucide-react'
import Link from 'next/link'
import { apiClient } from '@/lib/api/client'
import {
    getCandidateByToken,
    startCall,
    getCallHistory,
    listCandidates,
    deleteCandidate,
    updateCandidate,
    reEvaluateInterview,
    type VoiceCandidate,
    type VoiceCandidatePublic,
    type CallHistory,
} from '@/lib/api/voice-screening'
import { toast } from 'sonner'
import Vapi from '@vapi-ai/web'

const VAPI_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY || ''
const VAPI_ASSISTANT_ID = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID || ''
const FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000'

export default function VoiceScreeningPage() {
    const [candidates, setCandidates] = useState<VoiceCandidate[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')

    // Add candidate modal
    const [showAddModal, setShowAddModal] = useState(false)
    const [addForm, setAddForm] = useState({ name: '', email: '', phone: '' })
    const [addLoading, setAddLoading] = useState(false)

    // Delete confirmation dialog
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [candidateToDelete, setCandidateToDelete] = useState<string | null>(null)

    // Edit candidate modal
    const [showEditModal, setShowEditModal] = useState(false)
    const [editCandidate, setEditCandidate] = useState<VoiceCandidate | null>(null)
    const [editForm, setEditForm] = useState({ name: '', email: '', phone: '' })
    const [editLoading, setEditLoading] = useState(false)

    // Import modal
    const [showImportModal, setShowImportModal] = useState(false)
    const [importLoading, setImportLoading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Detail modal
    const [selectedCandidate, setSelectedCandidate] = useState<VoiceCandidate | null>(null)
    const [callHistory, setCallHistory] = useState<CallHistory[]>([])
    const [loadingHistory, setLoadingHistory] = useState(false)
    const [selectedCallIndex, setSelectedCallIndex] = useState(0)
    const [reEvaluating, setReEvaluating] = useState(false)

    // Test call state
    const [activeCallId, setActiveCallId] = useState<string | null>(null)
    const [callStatus, setCallStatus] = useState<string>('')
    const [currentCallId, setCurrentCallId] = useState<string | null>(null) // VAPI call ID
    const [currentToken, setCurrentToken] = useState<string | null>(null) // Interview token
    const [fetchingCallData, setFetchingCallData] = useState(false)
    const vapiRef = useRef<Vapi | null>(null)

    useEffect(() => {
        loadCandidates()
    }, [])

    const loadCandidates = async () => {
        try {
            setLoading(true)
            const result = await listCandidates()
            setCandidates(result || [])
        } catch (error: any) {
            toast.error('Failed to load candidates')
        } finally {
            setLoading(false)
        }
    }

    // Add single candidate (requires campaign_id - update this when adding campaign support)
    const handleAddCandidate = async () => {
        toast.error('Please create a campaign first, then add candidates to it')
        setShowAddModal(false)
    }

    // Import CSV/Excel (requires campaign_id)
    const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        toast.error('Please create a campaign first, then import candidates to it')
        setShowImportModal(false)
    }

    // Export Excel
    const handleExport = async () => {
        try {
            const { exportToExcel } = await import('@/lib/api/voice-screening')
            const blob = await exportToExcel()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'voice_screening_candidates.xlsx'
            a.click()
            URL.revokeObjectURL(url)
            toast.success('Excel exported!')
        } catch (error: any) {
            toast.error('Failed to export')
        }
    }

    // Copy shareable link
    const handleCopyLink = (token: string) => {
        const link = `${FRONTEND_URL}/voice-interview/${token}`
        navigator.clipboard.writeText(link)
        toast.success('Link copied to clipboard!')
    }

    // Delete candidate
    const handleDelete = (id: string) => {
        setCandidateToDelete(id)
        setDeleteDialogOpen(true)
    }

    const confirmDelete = async () => {
        if (!candidateToDelete) return
        try {
            await deleteCandidate(candidateToDelete)
            toast.success('Candidate deleted successfully')
            loadCandidates()
        } catch (error: any) {
            toast.error('Failed to delete candidate')
        } finally {
            setCandidateToDelete(null)
            setDeleteDialogOpen(false)
        }
    }

    // Edit candidate handlers
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

    // Fetch call history for a candidate
    const fetchCallHistory = async (candidateId: string) => {
        try {
            setLoadingHistory(true)
            const calls = await getCallHistory(candidateId)
            setCallHistory(calls || [])
            setSelectedCallIndex(0) // Reset to first call
        } catch (error: any) {
            console.error('Failed to fetch call history:', error)
            toast.error('Failed to load call history')
        } finally {
            setLoadingHistory(false)
        }
    }

    // Open detail modal and fetch call history
    const handleViewDetails = async (candidate: VoiceCandidate) => {
        setSelectedCandidate(candidate)
        await fetchCallHistory(candidate.id)
    }

    // Fetch call data from VAPI after call ends
    const fetchCallData = async (token: string, callId: string) => {
        try {
            setFetchingCallData(true)
            toast.info('Fetching transcript and recording from VAPI...')

            const response = await apiClient['client'].post(
                `/api/v1/voice-screening/candidates/token/${token}/fetch-call-data`,
                { call_id: callId }
            )

            if (response.data.status === 'success') {
                toast.success('Call data fetched successfully!')
                loadCandidates() // Refresh to show transcript and recording
            } else if (response.data.status === 'pending') {
                toast.info('Call is still processing. Please wait a moment and try again.')
            }
        } catch (error: any) {
            console.error('Failed to fetch call data:', error)
            toast.error('Failed to fetch call data. You can try refreshing later.')
        } finally {
            setFetchingCallData(false)
        }
    }

    //  Test Call via Vapi Web SDK
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
            let fullCandidate: VoiceCandidatePublic | VoiceCandidate = candidate;
            try {
                fullCandidate = await getCandidateByToken(candidate.interview_token)
            } catch (err) {
                console.error('Failed to fetch candidate config, using basic candidate data:', err)
            }

            // Initialize Vapi
            const vapi = new Vapi(VAPI_PUBLIC_KEY)
            vapiRef.current = vapi

            const candidateToken = candidate.interview_token;
            let capturedCallId: string | null = null;

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

            // THREE-TIER FALLBACK SYSTEM (same as voice-interview page):
            // 1️⃣ Use dynamic campaign config if available
            // 2️⃣ Use static assistant ID
            // 3️⃣ Use inline fallback config

            let callResponse;
            if (fullCandidate.vapi_config) {
                // NEW: Use campaign's dynamic configuration
                console.log('✅ Using dynamic campaign configuration for test call')
                // Strip deprecated 'knowledgeBase' property (removed from Vapi API)
                const { knowledgeBase, ...cleanConfig } = fullCandidate.vapi_config as any
                if (knowledgeBase) {
                    console.log('⚠️ Stripped deprecated knowledgeBase property from config')
                }
                callResponse = await vapi.start(cleanConfig)
            } else if (VAPI_ASSISTANT_ID) {
                // OLD: Use static assistant ID
                console.log('⚠️ Using static assistant ID (backward compatible)')
                callResponse = await vapi.start(VAPI_ASSISTANT_ID, {
                    variableValues: {
                        candidate_name: candidate.name,
                    },
                })
            } else {
                // FALLBACK: Use inline config
                console.log('⚠️ Using inline fallback configuration')
                callResponse = await vapi.start({
                    model: {
                        provider: 'openai',
                        model: 'gpt-4o-mini',
                        messages: [
                            {
                                role: 'system',
                                content: `You are an HR screening assistant. You are calling ${candidate.name}. Conduct a professional voice interview asking relevant questions about their background, skills, and experience. Be conversational, brief, and polite.`,
                            },
                        ],
                    },
                    voice: {
                        provider: '11labs',
                        voiceId: 'nPczCjzI2devNBz1zQrb', // 11Labs Brian (Male)
                    },
                    transcriber: {
                        provider: 'deepgram',
                        model: 'nova-2',
                        language: 'en',
                    },
                })
            }

            // Capture call_id immediately from return value
            if (callResponse?.id) {
                capturedCallId = callResponse.id;
                setCurrentCallId(capturedCallId)
                // Send call_id to backend immediately
                startCall(candidateToken, capturedCallId).catch(() => { })
                console.log(`📞 Call started with ID: ${capturedCallId}`)
            }

        } catch (error: any) {
            console.error('Test call error:', error)
            setActiveCallId(null)
            setCallStatus('')
            toast.error('Failed to start call: ' + (error?.message || 'Unknown error'))
        }
    }

    // End call
    const handleEndCall = () => {
        vapiRef.current?.stop()
        setActiveCallId(null)
        setCallStatus('')
    }

    // Filter candidates
    const filteredCandidates = candidates.filter(
        (c) =>
            c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.phone?.includes(searchQuery)
    )

    // Re-evaluate interview
    const handleReEvaluate = async (callHistoryId: string) => {
        try {
            setReEvaluating(true)
            toast.loading('Re-generating AI summary...', { id: 'reeval' })

            const updatedCall = await reEvaluateInterview(callHistoryId)

            // Update the call history in state
            setCallHistory(prev =>
                prev.map(call => call.id === callHistoryId ? updatedCall : call)
            )

            toast.success('AI summary regenerated successfully!', { id: 'reeval' })
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Failed to regenerate summary', { id: 'reeval' })
        } finally {
            setReEvaluating(false)
        }
    }

    // Status badge
    const getStatusBadge = (status: string) => {
        const map: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
            pending: { variant: 'outline', label: 'Pending' },
            in_progress: { variant: 'secondary', label: 'In Progress' },
            completed: { variant: 'default', label: 'Completed' },
            failed: { variant: 'destructive', label: 'Failed' },
        }
        const info = map[status] || { variant: 'outline' as const, label: status }
        return <Badge variant={info.variant}>{info.label}</Badge>
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-teal-600 to-green-600 bg-clip-text text-transparent">
                        Voice Screening
                    </h1>
                    <p className="text-gray-500 mt-1">AI-powered voice interviews via Vapi</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <Button onClick={() => setShowAddModal(true)} className="bg-gradient-to-r from-teal-500 to-green-500 hover:from-teal-600 hover:to-green-600">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Candidate
                    </Button>
                    <Button variant="outline" onClick={() => setShowImportModal(true)}>
                        <Upload className="h-4 w-4 mr-2" />
                        Import CSV/Excel
                    </Button>
                    <Button variant="outline" onClick={handleExport} disabled={candidates.length === 0}>
                        <Download className="h-4 w-4 mr-2" />
                        Export Excel
                    </Button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-2 border-b">
                <Link href="/dashboard/voice-screening/campaigns">
                    <button className="px-4 py-2 font-medium text-gray-500 hover:text-gray-700 border-b-2 border-transparent hover:border-gray-300">
                        <Briefcase className="h-4 w-4 inline-block mr-2" />
                        Campaigns
                    </button>
                </Link>
                <Link href="/dashboard/voice-screening">
                    <button className="px-4 py-2 font-medium text-teal-600 border-b-2 border-teal-600">
                        <Phone className="h-4 w-4 inline-block mr-2" />
                        Candidates
                    </button>
                </Link>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                    placeholder="Search candidates by name, email, or phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                />
            </div>

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

            {/* Candidates Table */}
            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
                        </div>
                    ) : filteredCandidates.length === 0 ? (
                        <div className="text-center py-20 text-gray-500">
                            <Phone className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                            <p className="text-lg font-medium">No candidates yet</p>
                            <p className="text-sm mt-1">Add candidates manually or import from CSV/Excel</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b bg-gray-50/50">
                                        <th className="text-left p-4 font-medium text-gray-600 text-sm">Name</th>
                                        <th className="text-left p-4 font-medium text-gray-600 text-sm">Email</th>
                                        <th className="text-left p-4 font-medium text-gray-600 text-sm">Phone</th>
                                        <th className="text-left p-4 font-medium text-gray-600 text-sm">Campaign</th>
                                        <th className="text-left p-4 font-medium text-gray-600 text-sm">Status</th>
                                        <th className="text-right p-4 font-medium text-gray-600 text-sm">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredCandidates.map((candidate) => (
                                        <tr key={candidate.id} className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
                                            <td className="p-4 font-medium">{candidate.name}</td>
                                            <td className="p-4 text-gray-600 text-sm">{candidate.email || '—'}</td>
                                            <td className="p-4 text-gray-600 text-sm">{candidate.phone || '—'}</td>
                                            <td className="p-4">
                                                {candidate.campaign_name ? (
                                                    <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200">
                                                        {candidate.campaign_name}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-gray-400 text-sm">—</span>
                                                )}
                                            </td>
                                            <td className="p-4">{getStatusBadge(candidate.status)}</td>
                                            <td className="p-4">
                                                <div className="flex items-center justify-end gap-1">
                                                    {/* Test Call */}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleTestCall(candidate)}
                                                        disabled={activeCallId !== null}
                                                        title="Test Call (speak in your browser)"
                                                    >
                                                        <PhoneCall className="h-4 w-4 text-green-600" />
                                                    </Button>

                                                    {/* Copy Link */}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleCopyLink(candidate.interview_token)}
                                                        title="Copy shareable link"
                                                    >
                                                        <Copy className="h-4 w-4 text-blue-600" />
                                                    </Button>

                                                    {/* View Details - Show if has latest_call_id */}
                                                    {candidate.latest_call_id && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleViewDetails(candidate)}
                                                            title="View call history, AI summary & assessment"
                                                        >
                                                            <Eye className="h-4 w-4 text-purple-600" />
                                                        </Button>
                                                    )}

                                                    {/* Edit */}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleEditCandidate(candidate)}
                                                        title="Edit candidate details"
                                                    >
                                                        <Edit className="h-4 w-4 text-orange-600" />
                                                    </Button>

                                                    {/* Delete */}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleDelete(candidate.id)}
                                                        title="Delete candidate"
                                                    >
                                                        <Trash2 className="h-4 w-4 text-red-500" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold text-teal-600">{candidates.length}</p>
                        <p className="text-sm text-gray-500">Total</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold text-yellow-600">{candidates.filter((c) => c.status === 'pending').length}</p>
                        <p className="text-sm text-gray-500">Pending</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold text-green-600">{candidates.filter((c) => c.status === 'completed').length}</p>
                        <p className="text-sm text-gray-500">Completed</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold text-red-600">{candidates.filter((c) => c.status === 'failed').length}</p>
                        <p className="text-sm text-gray-500">Failed</p>
                    </CardContent>
                </Card>
            </div>

            {/* ===== MODALS ===== */}

            {/* Add Candidate Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <Card className="w-full max-w-md">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Add Candidate</CardTitle>
                            <Button variant="ghost" size="sm" onClick={() => setShowAddModal(false)}>
                                <X className="h-4 w-4" />
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>Name *</Label>
                                <Input value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} placeholder="Candidate name" />
                            </div>
                            <div className="space-y-2">
                                <Label>Email</Label>
                                <Input value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} placeholder="candidate@email.com" />
                            </div>
                            <div className="space-y-2">
                                <Label>Phone</Label>
                                <Input value={addForm.phone} onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })} placeholder="+91 98765 43210" />
                            </div>
                            <Button onClick={handleAddCandidate} disabled={addLoading} className="w-full bg-gradient-to-r from-teal-500 to-green-500">
                                {addLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                                Add Candidate
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Import Modal */}
            {showImportModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <Card className="w-full max-w-md">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Import Candidates</CardTitle>
                            <Button variant="ghost" size="sm" onClick={() => setShowImportModal(false)}>
                                <X className="h-4 w-4" />
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-sm text-gray-600">
                                Upload a CSV or Excel file with columns: <strong>Name</strong>, <strong>Email</strong>, <strong>Phone</strong>
                            </p>
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-teal-400 transition-colors cursor-pointer"
                                onClick={() => fileInputRef.current?.click()}>
                                {importLoading ? (
                                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-teal-600" />
                                ) : (
                                    <>
                                        <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                                        <p className="text-sm text-gray-500">Click to select CSV or Excel file</p>
                                    </>
                                )}
                            </div>
                            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileImport} />
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Details Modal - New Call History Design */}
            {selectedCandidate && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedCandidate(null)}>
                    <Card className="w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <CardHeader className="flex flex-row items-center justify-between shrink-0 border-b">
                            <div>
                                <CardTitle>Interview History — {selectedCandidate.name}</CardTitle>
                                <p className="text-sm text-gray-500 mt-1">
                                    {callHistory.length > 0 ? (
                                        <span className="text-green-600 font-medium">
                                            {callHistory.length} {callHistory.length === 1 ? 'call' : 'calls'} recorded
                                        </span>
                                    ) : (
                                        <span>No calls recorded yet</span>
                                    )}
                                </p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedCandidate(null)}>
                                <X className="h-4 w-4" />
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-6 overflow-y-auto flex-1">
                            {loadingHistory ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
                                </div>
                            ) : callHistory.length === 0 ? (
                                <div className="text-center py-12 text-gray-500">
                                    <PhoneCall className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                                    <p className="text-lg font-medium">No interview calls yet</p>
                                    <p className="text-sm mt-1">Start a call to see interview data here</p>
                                </div>
                            ) : (
                                <>
                                    {/* Call Tabs */}
                                    {callHistory.length > 1 && (
                                        <div className="flex gap-2 border-b pb-2 overflow-x-auto">
                                            {callHistory.map((call, index) => (
                                                <button
                                                    key={call.id}
                                                    onClick={() => setSelectedCallIndex(index)}
                                                    className={`px-4 py-2 font-medium text-sm whitespace-nowrap rounded-t transition-colors ${selectedCallIndex === index
                                                        ? 'bg-teal-50 text-teal-700 border-b-2 border-teal-600'
                                                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                                        }`}
                                                >
                                                    {index === 0 ? 'Latest Interview' : `Call ${callHistory.length - index}`}
                                                    {call.interview_summary && (
                                                        <CheckCircle className="inline-block ml-1 h-3 w-3 text-green-600" />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* Selected Call Content */}
                                    {(() => {
                                        const call = callHistory[selectedCallIndex]
                                        if (!call) return null

                                        return (
                                            <div className="space-y-6">
                                                {/* Re-evaluate Button - Always show if transcript exists */}
                                                {call.transcript && (
                                                    <div className="flex justify-end">
                                                        <Button
                                                            onClick={() => handleReEvaluate(call.id)}
                                                            disabled={reEvaluating}
                                                            variant="outline"
                                                            size="sm"
                                                            className="gap-2"
                                                        >
                                                            {reEvaluating ? (
                                                                <>
                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                    Regenerating...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <RefreshCw className="h-4 w-4" />
                                                                    Re-evaluate Interview
                                                                </>
                                                            )}
                                                        </Button>
                                                    </div>
                                                )}

                                                {/* AI Interview Summary */}
                                                {call.interview_summary ? (
                                                    <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-5 border border-purple-200">
                                                        <h3 className="font-semibold mb-3 flex items-center gap-2 text-purple-700 text-lg">
                                                            <Briefcase className="h-5 w-5" /> AI Interview Summary
                                                        </h3>
                                                        <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                                                            {call.interview_summary}
                                                        </p>
                                                    </div>
                                                ) : call.transcript ? (
                                                    <div className="bg-purple-50 rounded-lg p-5 border border-purple-200 text-center">
                                                        <p className="text-gray-600 mb-3">Interview analysis unavailable.</p>
                                                        <p className="text-sm text-gray-500">Click "Re-evaluate Interview" above to generate AI summary.</p>
                                                    </div>
                                                ) : null}

                                                {/* Key Points */}
                                                {call.key_points && call.key_points.length > 0 && (
                                                    <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-lg p-5 border border-blue-200">
                                                        <h3 className="font-semibold mb-3 flex items-center gap-2 text-blue-700 text-lg">
                                                            <CheckCircle className="h-5 w-5" /> Key Points
                                                        </h3>
                                                        <ul className="space-y-2">
                                                            {call.key_points.map((point, idx) => (
                                                                <li key={idx} className="flex items-start gap-2 text-gray-700">
                                                                    <span className="text-blue-500 mt-1">✦</span>
                                                                    <span>{point}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}

                                                {/* Technical Assessment */}
                                                {call.technical_assessment && (
                                                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-5 border border-green-200">
                                                        <h3 className="font-semibold mb-4 flex items-center gap-2 text-green-700 text-lg">
                                                            <AlertCircle className="h-5 w-5" /> Technical Assessment
                                                        </h3>
                                                        <div className="space-y-4">
                                                            {/* Top Row: Experience & Match */}
                                                            <div className="grid grid-cols-2 gap-4">
                                                                {call.technical_assessment.experience_level && (
                                                                    <div className="bg-white rounded-lg p-3 border border-green-100">
                                                                        <p className="text-xs text-gray-500 mb-1">Experience Level</p>
                                                                        <p className="font-semibold text-green-800">
                                                                            {call.technical_assessment.experience_level}
                                                                        </p>
                                                                    </div>
                                                                )}
                                                                {call.technical_assessment.tech_stack_match_percentage !== null && (
                                                                    <div className="bg-white rounded-lg p-3 border border-green-100">
                                                                        <p className="text-xs text-gray-500 mb-1">Tech Stack Match</p>
                                                                        <p className="font-semibold text-green-800">
                                                                            {call.technical_assessment.tech_stack_match_percentage}%
                                                                        </p>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Skills Mentioned */}
                                                            {call.technical_assessment.skills_mentioned && call.technical_assessment.skills_mentioned.length > 0 && (
                                                                <div>
                                                                    <p className="text-sm font-medium text-gray-700 mb-2">Skills Mentioned</p>
                                                                    <div className="flex flex-wrap gap-2">
                                                                        {call.technical_assessment.skills_mentioned.map((skill, idx) => (
                                                                            <Badge key={idx} variant="secondary" className="bg-green-100 text-green-800">
                                                                                {skill}
                                                                            </Badge>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Strengths */}
                                                            {call.technical_assessment.strengths && call.technical_assessment.strengths.length > 0 && (
                                                                <div>
                                                                    <p className="text-sm font-medium text-gray-700 mb-2">✓ Strengths</p>
                                                                    <ul className="space-y-1">
                                                                        {call.technical_assessment.strengths.map((strength, idx) => (
                                                                            <li key={idx} className="text-sm text-gray-600 flex items-start gap-2">
                                                                                <span className="text-green-500">•</span>
                                                                                <span>{strength}</span>
                                                                            </li>
                                                                        ))}
                                                                    </ul>
                                                                </div>
                                                            )}

                                                            {/* Gaps */}
                                                            {call.technical_assessment.gaps && call.technical_assessment.gaps.length > 0 && (
                                                                <div>
                                                                    <p className="text-sm font-medium text-gray-700 mb-2">⚠ Gaps</p>
                                                                    <ul className="space-y-1">
                                                                        {call.technical_assessment.gaps.map((gap, idx) => (
                                                                            <li key={idx} className="text-sm text-gray-600 flex items-start gap-2">
                                                                                <span className="text-yellow-500">•</span>
                                                                                <span>{gap}</span>
                                                                            </li>
                                                                        ))}
                                                                    </ul>
                                                                </div>
                                                            )}

                                                            {/* Recommendation & Confidence */}
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-green-200">
                                                                {call.technical_assessment.recommendation && (
                                                                    <div>
                                                                        <p className="text-xs text-gray-500 mb-1">Recommendation</p>
                                                                        <p className="font-semibold text-gray-900">
                                                                            {call.technical_assessment.recommendation}
                                                                        </p>
                                                                    </div>
                                                                )}
                                                                {call.technical_assessment.hiring_decision_confidence && (
                                                                    <div>
                                                                        <p className="text-xs text-gray-500 mb-1">Confidence Level</p>
                                                                        <p className="font-semibold text-gray-900">
                                                                            {call.technical_assessment.hiring_decision_confidence}
                                                                        </p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Recording */}
                                                {call.recording_url && (
                                                    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4 border border-indigo-200">
                                                        <h3 className="font-semibold mb-3 flex items-center gap-2 text-indigo-700">
                                                            <Play className="h-5 w-5" /> Call Recording
                                                        </h3>
                                                        <audio controls className="w-full" src={call.recording_url}>
                                                            Your browser does not support the audio element.
                                                        </audio>
                                                    </div>
                                                )}

                                                {/* Transcript */}
                                                {call.transcript && (
                                                    <div className="bg-gradient-to-r from-gray-50 to-slate-50 rounded-lg p-4 border border-gray-200">
                                                        <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-700">
                                                            <FileText className="h-5 w-5" /> Full Transcript
                                                        </h3>
                                                        <div className="bg-white rounded-lg p-4 max-h-60 overflow-y-auto text-sm whitespace-pre-wrap border border-gray-100 shadow-inner">
                                                            {call.transcript}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Structured Data (Dynamic) - VAPI Template Style */}
                                                {call.structured_data && Object.keys(call.structured_data).length > 0 && (
                                                    <div className="bg-gradient-to-r from-teal-50 to-emerald-50 rounded-lg p-5 border border-teal-200">
                                                        <h3 className="font-semibold mb-4 flex items-center gap-2 text-teal-700 text-lg">
                                                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                            </svg>
                                                            Structured Data Extraction
                                                        </h3>
                                                        <div className="bg-white rounded-lg p-4">
                                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                                                                {Object.entries(call.structured_data).map(([key, value]) => {
                                                                    const displayValue = typeof value === 'object'
                                                                        ? JSON.stringify(value, null, 2)
                                                                        : String(value || '—')

                                                                    const isEmpty = !value || value === '' || value === '—'

                                                                    return (
                                                                        <div
                                                                            key={key}
                                                                            className={`p-3 rounded-lg border transition-all ${
                                                                                isEmpty
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
                                                                            <p className={`font-medium break-words ${
                                                                                isEmpty
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

                                                {/* Call Metadata */}
                                                <div className="flex items-center justify-between text-xs text-gray-500 pt-4 border-t">
                                                    <div className="flex items-center gap-4">
                                                        <span className="flex items-center gap-1">
                                                            <Clock className="h-3 w-3" />
                                                            {call.started_at && new Date(call.started_at).toLocaleString()}
                                                        </span>
                                                        {call.duration_seconds && (
                                                            <span>Duration: {Math.floor(call.duration_seconds / 60)}m {call.duration_seconds % 60}s</span>
                                                        )}
                                                    </div>
                                                    {call.call_id && (
                                                        <span className="text-gray-400">Call ID: {call.call_id.substring(0, 8)}...</span>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })()}
                                </>
                            )}

                            {/* Close button at bottom */}
                            <div className="pt-4 border-t flex justify-end">
                                <Button variant="outline" onClick={() => setSelectedCandidate(null)}>
                                    <X className="h-4 w-4 mr-2" />
                                    Close
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

            {/* Delete Confirmation Dialog */}
            <ConfirmDialog
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
                onConfirm={confirmDelete}
                title="Delete Candidate"
                description="Are you sure you want to delete this candidate? This action cannot be undone and will remove all interview data."
                confirmText="Delete"
                variant="destructive"
            />
        </div>
    )
}
