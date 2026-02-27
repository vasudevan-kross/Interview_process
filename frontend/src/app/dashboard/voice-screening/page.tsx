'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
    Phone,
    Plus,
    Upload,
    Download,
    Copy,
    Eye,
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
} from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { getCandidateByToken, startCall, type VoiceCandidate } from '@/lib/api/voice-screening'
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
    const [addForm, setAddForm] = useState({ name: '', email: '', phone: '', is_fresher: false })
    const [addLoading, setAddLoading] = useState(false)

    // Import modal
    const [showImportModal, setShowImportModal] = useState(false)
    const [importLoading, setImportLoading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Detail modal
    const [selectedCandidate, setSelectedCandidate] = useState<VoiceCandidate | null>(null)

    // Test call state
    const [activeCallId, setActiveCallId] = useState<string | null>(null)
    const [callStatus, setCallStatus] = useState<string>('')
    const vapiRef = useRef<Vapi | null>(null)

    useEffect(() => {
        loadCandidates()
    }, [])

    const loadCandidates = async () => {
        try {
            setLoading(true)
            const result = await apiClient.listVoiceCandidates()
            setCandidates(result.candidates || [])
        } catch (error: any) {
            toast.error('Failed to load candidates')
        } finally {
            setLoading(false)
        }
    }

    // Add single candidate
    const handleAddCandidate = async () => {
        if (!addForm.name.trim()) {
            toast.error('Name is required')
            return
        }
        try {
            setAddLoading(true)
            await apiClient.createVoiceCandidate(addForm)
            toast.success('Candidate added!')
            setShowAddModal(false)
            setAddForm({ name: '', email: '', phone: '', is_fresher: false })
            loadCandidates()
        } catch (error: any) {
            toast.error('Failed to add candidate')
        } finally {
            setAddLoading(false)
        }
    }

    // Import CSV/Excel
    const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        try {
            setImportLoading(true)
            const formData = new FormData()
            formData.append('file', file)
            const result = await apiClient.uploadVoiceCandidatesFile(formData)
            toast.success(`Imported ${result.created} candidates from ${result.filename}`)
            setShowImportModal(false)
            loadCandidates()
        } catch (error: any) {
            toast.error('Failed to import file')
        } finally {
            setImportLoading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    // Export Excel
    const handleExport = async () => {
        try {
            const blob = await apiClient.exportVoiceScreeningExcel()
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
    const handleDelete = async (id: string) => {
        if (!confirm('Delete this candidate?')) return
        try {
            await apiClient.deleteVoiceCandidate(id)
            toast.success('Candidate deleted')
            loadCandidates()
        } catch (error: any) {
            toast.error('Failed to delete')
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
            setCallStatus('connecting')

            // Initialize Vapi
            const vapi = new Vapi(VAPI_PUBLIC_KEY)
            vapiRef.current = vapi

            let callIdSent = false;
            vapi.on('message', (message: any) => {
                if (message.type === 'call-update' && message.call?.id && !callIdSent) {
                    callIdSent = true;
                    // Send actual Call ID to backend so webhook can match it!
                    startCall(candidate.interview_token, message.call.id).catch(() => { })
                }
            })

            vapi.on('call-start', () => {
                setCallStatus('active')
                toast.success('Call started!')
                // Update backend status to in_progress (callId is sent in message event above)
                startCall(candidate.interview_token, '').catch(() => { })
            })

            vapi.on('call-end', () => {
                setCallStatus('ended')
                setActiveCallId(null)
                toast.info('Call ended')
                vapiRef.current = null
                // Refresh to see updated data
                setTimeout(() => loadCandidates(), 2000)
            })

            vapi.on('error', (error: any) => {
                console.error('Vapi error:', error)
                setCallStatus('error')
                setActiveCallId(null)
                toast.error('Call failed: ' + (error?.message || 'Unknown error'))
                vapiRef.current = null
            })

            // Start call with assistant configuration
            if (VAPI_ASSISTANT_ID) {
                await vapi.start(VAPI_ASSISTANT_ID, {
                    variableValues: {
                        candidate_name: candidate.name,
                        is_fresher: String(candidate.is_fresher),
                    },
                })
            } else {
                await vapi.start({
                    model: {
                        provider: 'openai',
                        model: 'gpt-4o-mini',
                        messages: [
                            {
                                role: 'system',
                                content: `You are an HR screening assistant. You are calling ${candidate.name}.
${candidate.is_fresher
                                        ? 'This candidate is a fresher. Only ask for: Name, Gender, Email, Current Location, and Native location.'
                                        : 'This candidate has experience. Ask all screening questions: Name, Gender, Email, Phone, Current Work Location, Native, Current Employer, Work Type, Full Time/Part Time, Current Role, Expertise, Total Experience, Certifications, Projects Handled, Current CTC, Expected CTC, Notice Period, Serving Notice Period, Tentative Joining Date, Existing Offers, Available Interview Time, Team Size, Shift Timing, Why Leaving Current Job.'
                                    }
Be conversational, brief, and polite.`,
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
                                        <th className="text-left p-4 font-medium text-gray-600 text-sm">Type</th>
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
                                                <Badge variant={candidate.is_fresher ? 'secondary' : 'outline'}>
                                                    {candidate.is_fresher ? 'Fresher' : 'Experienced'}
                                                </Badge>
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

                                                    {/* View Details */}
                                                    {candidate.status === 'completed' && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => setSelectedCandidate(candidate)}
                                                            title="View extracted details"
                                                        >
                                                            <Eye className="h-4 w-4 text-purple-600" />
                                                        </Button>
                                                    )}

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
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="is_fresher"
                                    checked={addForm.is_fresher}
                                    onChange={(e) => setAddForm({ ...addForm, is_fresher: e.target.checked })}
                                    className="rounded"
                                />
                                <Label htmlFor="is_fresher">Fresher (only basic questions)</Label>
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
                                Upload a CSV or Excel file with columns: <strong>Name</strong>, <strong>Email</strong>, <strong>Phone</strong>, <strong>Is Fresher</strong> (true/false)
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

            {/* Details Modal */}
            {selectedCandidate && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
                    <Card className="w-full max-w-2xl my-8">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Candidate Details — {selectedCandidate.name}</CardTitle>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedCandidate(null)}>
                                <X className="h-4 w-4" />
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                {[
                                    ['Name', selectedCandidate.name],
                                    ['Gender', selectedCandidate.gender],
                                    ['Email', selectedCandidate.email],
                                    ['Phone', selectedCandidate.phone],
                                    ['Current Work Location', selectedCandidate.current_work_location],
                                    ['Native', selectedCandidate.native_location],
                                    ['Current Employer', selectedCandidate.current_employer],
                                    ['Work Type', selectedCandidate.work_type],
                                    ['Full Time/Part Time', selectedCandidate.employment_type],
                                    ['Current Role', selectedCandidate.current_role],
                                    ['Expertise In', selectedCandidate.expertise_in],
                                    ['Total Experience', selectedCandidate.total_experience],
                                    ['Certifications', selectedCandidate.certifications],
                                    ['Projects Handled', selectedCandidate.projects_handled],
                                    ['Current CTC (LPA)', selectedCandidate.current_ctc],
                                    ['Expected CTC (LPA)', selectedCandidate.expected_ctc],
                                    ['Notice Period', selectedCandidate.notice_period],
                                    ['Serving Notice Period?', selectedCandidate.serving_notice_period],
                                    ['Tentative Joining Date', selectedCandidate.tentative_joining_date],
                                    ['Existing Offers?', selectedCandidate.existing_offers],
                                    ['Available Interview Time', selectedCandidate.available_interview_time],
                                    ['Team Members Size', selectedCandidate.current_team_size],
                                    ['Shift Timing', selectedCandidate.current_shift_timing],
                                    ['Reason for Leaving', selectedCandidate.reason_for_leaving],
                                ].map(([label, value]) => (
                                    <div key={label as string} className="p-2 bg-gray-50 rounded">
                                        <p className="text-xs text-gray-500">{label}</p>
                                        <p className="font-medium">{value || '—'}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Transcript */}
                            {selectedCandidate.transcript && (
                                <div>
                                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                                        <FileText className="h-4 w-4" /> Transcript
                                    </h3>
                                    <div className="bg-gray-50 rounded-lg p-4 max-h-60 overflow-y-auto text-sm whitespace-pre-wrap">
                                        {selectedCandidate.transcript}
                                    </div>
                                </div>
                            )}

                            {/* Recording */}
                            {selectedCandidate.recording_url && (
                                <div>
                                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                                        <Play className="h-4 w-4" /> Recording
                                    </h3>
                                    <audio controls className="w-full" src={selectedCandidate.recording_url}>
                                        Your browser does not support the audio element.
                                    </audio>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    )
}
