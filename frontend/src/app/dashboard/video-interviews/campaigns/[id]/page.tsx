'use client'

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { SkeletonPageHeader, SkeletonTable } from '@/components/ui/skeleton'
import { createVideoCandidate, deleteVideoCandidate, updateVideoCandidate, getVideoCampaign, listVideoCandidates, listVideoSessions, importVideoCandidates, type VideoInterviewCampaign, type VideoInterviewCandidate, type VideoInterviewSession } from '@/lib/api/video-interviews'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import Link from 'next/link'
import { ChevronLeft, Trash2, Pencil, Copy, ArrowRight, UserPlus, UploadCloud, Users } from 'lucide-react'
import * as XLSX from 'xlsx'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

const FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000'

export default function VideoCampaignDetailPage() {
  const params = useParams()
  const router = useRouter()
  const campaignId = params?.id as string
  const [campaign, setCampaign] = useState<VideoInterviewCampaign | null>(null)
  const [candidates, setCandidates] = useState<VideoInterviewCandidate[]>([])
  const [sessions, setSessions] = useState<VideoInterviewSession[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importPreview, setImportPreview] = useState<Array<{ name: string; email?: string; phone?: string }>>([])
  const [importTotal, setImportTotal] = useState(0)
  const [importFileName, setImportFileName] = useState<string | null>(null)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '' })
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingCandidate, setEditingCandidate] = useState<VideoInterviewCandidate | null>(null)
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '' })
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => {
    if (campaignId) fetchData()
  }, [campaignId])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [campaignData, candidateData, sessionData] = await Promise.all([
        getVideoCampaign(campaignId),
        listVideoCandidates({ campaign_id: campaignId }),
        listVideoSessions({ campaign_id: campaignId }),
      ])
      setCampaign(campaignData)
      setCandidates(candidateData)
      setSessions(sessionData)
    } catch {
      toast.error('Failed to load campaign')
    } finally {
      setLoading(false)
    }
  }

  const buildInviteLink = (token: string) => `${FRONTEND_URL}/video-interview/${token}`

  const handleCreateCandidate = async () => {
    if (!campaignId) {
      toast.error('Campaign is missing')
      return
    }
    const name = form.name.trim()
    const email = form.email.trim()
    const phone = form.phone.trim()
    if (!name) {
      toast.error('Candidate name is required')
      return
    }
    try {
      setSaving(true)
      const candidate = await createVideoCandidate({
        campaign_id: campaignId,
        name,
        email: email ? email : undefined,
        phone: phone ? phone : undefined,
        resumeFile: resumeFile ?? undefined,
      })
      setCandidates([candidate, ...candidates])
      setForm({ name: '', email: '', phone: '' })
      setResumeFile(null)
      toast.success('Candidate added')
    } catch {
      toast.error('Failed to add candidate')
    } finally {
      setSaving(false)
    }
  }

  const handleCopyLink = async (token: string) => {
    const link = buildInviteLink(token)
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Invite link copied')
    } catch {
      toast.error('Failed to copy link')
    }
  }

  const requestEditCandidate = (candidate: VideoInterviewCandidate) => {
    setEditingCandidate(candidate)
    setEditForm({ name: candidate.name, email: candidate.email || '', phone: candidate.phone || '' })
    setEditDialogOpen(true)
  }

  const handleEditCandidate = async () => {
    if (!editingCandidate) return
    const name = editForm.name.trim()
    if (!name) { toast.error('Candidate name is required'); return }
    try {
      setEditSaving(true)
      const updated = await updateVideoCandidate(editingCandidate.id, {
        name,
        email: editForm.email.trim() || undefined,
        phone: editForm.phone.trim() || undefined,
      })
      setCandidates(candidates.map((c) => c.id === updated.id ? updated : c))
      toast.success('Candidate updated')
      setEditDialogOpen(false)
      setEditingCandidate(null)
    } catch {
      toast.error('Failed to update candidate')
    } finally {
      setEditSaving(false)
    }
  }

  const requestDeleteCandidate = (candidateId: string) => {
    setPendingDeleteId(candidateId)
    setDeleteDialogOpen(true)
  }

  const confirmDeleteCandidate = async () => {
    if (!pendingDeleteId) return
    try {
      await deleteVideoCandidate(pendingDeleteId)
      setCandidates(candidates.filter((candidate) => candidate.id !== pendingDeleteId))
      toast.success('Candidate deleted')
    } catch {
      toast.error('Failed to delete candidate')
    } finally {
      setDeleteDialogOpen(false)
      setPendingDeleteId(null)
    }
  }

  const normalizeRow = (row: Record<string, any>) => {
    const name = row.name || row.full_name || row.candidate_name || ''
    const email = row.email || row.candidate_email || ''
    const phone = row.phone || row.candidate_phone || ''
    return { name: String(name).trim(), email: String(email).trim() || undefined, phone: String(phone).trim() || undefined }
  }

  const buildPreview = (rows: Array<Record<string, any>>) => {
    const normalized = rows.map(normalizeRow).filter((row) => row.name)
    setImportTotal(normalized.length)
    setImportPreview(normalized.slice(0, 5))
  }

  const handleFileSelect = async (file: File) => {
    const ext = file.name.toLowerCase()
    if (!ext.endsWith('.csv') && !ext.endsWith('.xlsx') && !ext.endsWith('.xls')) {
      toast.error('Upload CSV or Excel file')
      return
    }
    setImportFileName(file.name)
    setImportFile(file)
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Array<Record<string, any>>
    if (!rows.length) {
      toast.error('No rows found in file')
      return
    }
    buildPreview(rows)
  }

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !campaignId) return
    await handleFileSelect(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const file = event.dataTransfer.files?.[0]
    if (file) await handleFileSelect(file)
  }

  const confirmImport = async () => {
    if (!campaignId || !importFile || importTotal === 0) return
    try {
      setImporting(true)
      const result = await importVideoCandidates(campaignId, importFile)
      setCandidates([...result.candidates, ...candidates])
      toast.success(`Imported ${result.imported} candidates`)
      setImportPreview([])
      setImportTotal(0)
      setImportFileName(null)
      setImportFile(null)
    } catch {
      toast.error('Failed to import candidates')
    } finally {
      setImporting(false)
    }
  }

  const latestSessionByCandidate = sessions.reduce<Record<string, VideoInterviewSession>>((acc, session) => {
    if (!acc[session.candidate_id]) {
      acc[session.candidate_id] = session
      return acc
    }
    const current = acc[session.candidate_id]
    if (new Date(session.started_at).getTime() > new Date(current.started_at).getTime()) {
      acc[session.candidate_id] = session
    }
    return acc
  }, {})

  if (loading) {
    return (
      <div className="space-y-6 max-w-[1400px] mx-auto pb-12">
        <SkeletonPageHeader />
        <SkeletonTable />
      </div>
    )
  }

  if (!campaign) {
    return <div className="py-16 text-center text-sm text-slate-500">Campaign not found.</div>
  }

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/dashboard/video-interviews">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-full">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{campaign.name}</h1>
            <p className="mt-1 text-sm text-slate-500">{campaign.description || 'Manage your campaign and candidates.'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${campaign.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${campaign.is_active ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
            {campaign.is_active ? 'Active' : 'Draft'}
          </span>
          <div className="w-px h-4 bg-slate-200" />
          <span className="text-sm font-medium text-slate-600">{campaign.interview_duration_minutes} min</span>
          <Button onClick={() => setAddDialogOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 ml-2">
            Add candidates
          </Button>
        </div>
      </div>

      {/* Candidates List Header */}
      <div className="flex items-center justify-between mt-8 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
             <Users className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Registered Candidates</h2>
            <p className="text-xs text-slate-500">Track and review candidate progress in this campaign.</p>
          </div>
        </div>
      </div>

      {/* Candidate Cards Grid */}
      {candidates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-300">
          <Users className="h-10 w-10 text-slate-300 mb-4" />
          <h3 className="text-sm font-semibold text-slate-900">No candidates added</h3>
          <p className="mt-1 text-sm text-slate-500 max-w-sm">Add a candidate manually or import a CSV file to generate their unique video interview links.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {candidates.map((candidate) => {
            const session = latestSessionByCandidate[candidate.id]
            const inviteurl = buildInviteLink(candidate.interview_token)
            const isCompleted = session?.status === 'completed'

            return (
              <div
                key={candidate.id}
                className={`group flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:shadow-md hover:border-indigo-200 hover:-translate-y-0.5 ${session ? 'cursor-pointer' : ''}`}
                onClick={() => {
                  if (session) router.push(`/dashboard/video-interviews/sessions/${session.id}`)
                }}
              >
                {/* Header */}
                <div className="flex items-start justify-between p-6 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-bold shadow-sm ${isCompleted ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                      {candidate.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 line-clamp-1 tracking-tight" title={candidate.name}>{candidate.name}</h3>
                      <p className="text-xs font-medium text-slate-500 line-clamp-1">{candidate.email || 'No email provided'}</p>
                    </div>
                  </div>
                  
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all -mr-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        requestEditCandidate(candidate)
                      }}
                      className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 p-2 rounded-lg transition-all"
                      aria-label="Edit candidate"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        requestDeleteCandidate(candidate.id)
                      }}
                      className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-all"
                      aria-label="Delete candidate"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Status Section */}
                <div className="flex flex-col gap-3 p-6 flex-1 bg-slate-50/30">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</p>
                    <div className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider shadow-sm border ${
                      isCompleted ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                      candidate.status === 'invited' ? 'bg-white text-slate-600 border-slate-200' : 
                      'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {candidate.status}
                    </div>
                  </div>
                  
                  {session ? (
                    <div className="mt-2 flex items-center justify-between rounded-xl bg-indigo-50/80 p-4 border border-indigo-100 shadow-sm transition-colors group-hover:bg-indigo-100/50">
                      <div>
                        <p className="text-sm font-bold text-indigo-900">Submission ready</p>
                        <p className="text-[11px] font-medium text-indigo-600/80">Click to view session details</p>
                      </div>
                      <div className="h-8 w-8 rounded-full bg-white flex items-center justify-center shadow-sm">
                        <ArrowRight className="h-4 w-4 text-indigo-600" />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center justify-center rounded-xl bg-slate-50 border border-dashed border-slate-300 py-6">
                      <div className="flex flex-col items-center">
                         <div className="h-2 w-2 rounded-full bg-slate-300 animate-pulse mb-2"></div>
                         <p className="text-xs text-slate-500 font-medium">Awaiting Submission</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Link Section */}
                <div className="p-4 bg-white rounded-b-2xl border-t border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 pl-1">Invite link</p>
                  <div className="flex items-center gap-2 p-1 pl-3 rounded-xl bg-slate-50 border border-slate-200 transition-colors group-hover:border-slate-300 group-hover:bg-white">
                    <div className="flex-1 overflow-hidden">
                      <p className="truncate text-xs text-slate-500 font-mono" title={inviteurl}>
                        {inviteurl}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCopyLink(candidate.interview_token)
                      }}
                      className="flex shrink-0 items-center justify-center rounded-lg bg-indigo-600 px-3 py-1.5 text-white text-xs font-semibold transition-colors hover:bg-indigo-700 active:scale-95 gap-1.5"
                      title="Copy invite link"
                    >
                      <Copy className="h-3 w-3" /> Copy
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDeleteCandidate}
        title="Delete candidate"
        description="This will remove the candidate and all of their sessions."
        confirmText="Delete"
        variant="destructive"
      />

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit candidate</DialogTitle>
            <DialogDescription>Update the candidate's details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Full name</label>
              <input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm transition-colors focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="e.g. Priya Kapoor"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Email (optional)</label>
              <input
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm transition-colors focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="priya@example.com"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phone (optional)</label>
              <input
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm transition-colors focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="+91 99999 00000"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditDialogOpen(false)} disabled={editSaving}>
                Cancel
              </Button>
              <Button onClick={handleEditCandidate} disabled={editSaving} className="flex-1 bg-indigo-600 hover:bg-indigo-700 font-semibold">
                {editSaving ? 'Saving...' : 'Save changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Add candidates</DialogTitle>
            <DialogDescription>Invite candidates individually or import a CSV/Excel file.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="bg-slate-50/50 border-b border-slate-100 px-5 py-3 flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-indigo-500" />
                <h3 className="text-sm font-semibold text-slate-900">Add a candidate</h3>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Full name</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm transition-colors focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                    placeholder="e.g. Priya Kapoor"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Email (optional)</label>
                  <input
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm transition-colors focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                    placeholder="priya@example.com"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phone (optional)</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm transition-colors focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                    placeholder="+91 99999 00000"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Resume (optional, PDF or DOCX)</label>
                  <label className="flex items-center gap-3 w-full rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-500 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors">
                    <UploadCloud className="h-4 w-4 shrink-0" />
                    <span className="truncate">{resumeFile ? resumeFile.name : 'Click to upload resume'}</span>
                    <input
                      type="file"
                      accept=".pdf,.docx"
                      className="hidden"
                      onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
                <Button onClick={handleCreateCandidate} disabled={saving} className="w-full bg-indigo-600 hover:bg-indigo-700 font-semibold shadow-sm">
                  {saving ? 'Adding...' : 'Add Candidate'}
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="bg-slate-50/50 border-b border-slate-100 px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UploadCloud className="h-4 w-4 text-emerald-500" />
                  <h3 className="text-sm font-semibold text-slate-900">Bulk import</h3>
                </div>
                <a
                  href="/samples/video-interviews/sample_video_candidates.csv"
                  download
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
                >
                  Sample CSV
                </a>
              </div>
              <div className="p-5">
                <p className="text-sm text-slate-500 mb-4">Required columns: <span className="font-semibold text-slate-700">name</span>, email, phone.</p>
                <div
                  className={`group flex flex-col items-center justify-center rounded-xl border-1.5 border-dashed border-slate-300 bg-slate-50/50 hover:bg-slate-50 transition-colors px-4 py-6 text-center cursor-pointer ${importFileName ? 'hidden' : 'flex'}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="h-10 w-10 flex items-center justify-center rounded-full bg-white border border-slate-200 shadow-sm mb-3 group-hover:scale-105 transition-transform">
                    <UploadCloud className="h-4 w-4 text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-700">Click or drag & drop</p>
                  <p className="text-[11px] text-slate-500 mt-1">Supports CSV, XLSX, or XLS files</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={handleImport}
                  />
                </div>

                {importFileName && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-3">
                      <div className="flex items-center gap-2 overflow-hidden pr-2">
                        <UploadCloud className="h-4 w-4 shrink-0 text-indigo-500" />
                        <p className="text-sm font-semibold text-slate-900 truncate">{importFileName}</p>
                      </div>
                      <span className="text-xs font-bold text-indigo-600 bg-white border border-slate-200 px-2 py-0.5 rounded-full shadow-sm">{importTotal} rows</span>
                    </div>
                    {importPreview.length > 0 && (
                      <div className="space-y-1 mb-4">
                        {importPreview.map((row, index) => (
                          <div key={index} className="flex justify-between items-center py-1">
                            <p className="text-xs font-medium text-slate-700 truncate pr-2">{row.name}</p>
                            <p className="text-[10px] text-slate-400 shrink-0">{(row.email || 'No email')}</p>
                          </div>
                        ))}
                        {importTotal > importPreview.length && (
                          <p className="text-[10px] text-slate-400 italic pt-1">+{importTotal - importPreview.length} more candidates</p>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation()
                          setImportFileName(null)
                          setImportPreview([])
                          setImportTotal(0)
                          setImportFile(null)
                          if (fileInputRef.current) fileInputRef.current.value = ''
                        }}
                        className="flex-1 bg-white"
                        disabled={importing}
                      >
                        Clear
                      </Button>
                      <Button
                        onClick={confirmImport}
                        disabled={importing || importTotal === 0}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 font-semibold shadow-sm"
                      >
                        {importing ? 'Importing...' : 'Confirm'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
