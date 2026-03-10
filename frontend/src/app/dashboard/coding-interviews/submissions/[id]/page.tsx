'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  ChevronLeft,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Award,
  Clock,
  User,
  Mail,
  Phone,
  Calendar,
  RefreshCw,
  FileText,
  Download,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  Monitor,
  Copy,
  ClipboardPaste,
  EyeOff,
  TimerOff,
  ScanSearch,
  MousePointer2,
  Layers,
  Camera,
  Bot,
  Mouse,
  Maximize2,
  Save,
  Pencil,
} from 'lucide-react'
import { getSubmission, reevaluateSubmission, getResumeUrl, saveEvaluatorNotes, type Submission, type Answer, type Activity } from '@/lib/api/coding-interviews'
import CodeEditor from '@/components/coding/CodeEditor'
import { toast } from 'sonner'
import { format, formatDistanceToNow } from 'date-fns'

export default function SubmissionReviewPage() {
  const params = useParams()
  const router = useRouter()
  const submissionId = params.id as string

  const [submission, setSubmission] = useState<Submission | null>(null)
  const [loading, setLoading] = useState(true)
  const [reevaluating, setReevaluating] = useState(false)
  const [reevalDialogOpen, setReevalDialogOpen] = useState(false)
  const [resumeUrl, setResumeUrl] = useState<string | null>(null)
  const [resumeLoading, setResumeLoading] = useState(false)

  // Evaluator notes + score override state (keyed by answer.id)
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({})
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({})
  const [savingAnswer, setSavingAnswer] = useState<string | null>(null)

  useEffect(() => {
    fetchSubmission()
  }, [submissionId])

  // Initialise drafts whenever submission loads
  useEffect(() => {
    if (!submission?.answers) return
    const notes: Record<string, string> = {}
    const scores: Record<string, string> = {}
    submission.answers.forEach((a) => {
      notes[a.id] = a.evaluator_notes || ''
      scores[a.id] = a.marks_awarded != null ? String(a.marks_awarded) : ''
    })
    setNotesDrafts(notes)
    setScoreDrafts(scores)
  }, [submission?.id])

  const fetchSubmission = async () => {
    try {
      setLoading(true)
      const data = await getSubmission(submissionId)
      setSubmission(data)

      // Try to fetch resume URL if resume_path exists
      if (data.resume_path) {
        try {
          setResumeLoading(true)
          const resumeData = await getResumeUrl(submissionId)
          setResumeUrl(resumeData.resume_url)
        } catch {
          // No resume or fetch failed - that's okay
        } finally {
          setResumeLoading(false)
        }
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to load submission')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveNotes = async (answer: Answer) => {
    setSavingAnswer(answer.id)
    try {
      const notes = notesDrafts[answer.id] || undefined
      const scoreStr = scoreDrafts[answer.id]
      const marks_override =
        scoreStr !== '' && scoreStr !== String(answer.marks_awarded)
          ? parseFloat(scoreStr)
          : undefined

      await saveEvaluatorNotes(submissionId, answer.id, {
        notes,
        marks_override,
      })

      // Update local state
      setSubmission((prev) => {
        if (!prev) return prev
        const updatedAnswers = prev.answers?.map((a) =>
          a.id === answer.id
            ? {
              ...a,
              evaluator_notes: notes || '',
              marks_awarded: marks_override ?? a.marks_awarded,
            }
            : a
        )
        // Recalculate percentage locally when marks changed
        if (marks_override !== undefined && updatedAnswers) {
          const totalObtained = updatedAnswers.reduce(
            (sum, a) => sum + (a.marks_awarded || 0), 0
          )
          const totalMarks = updatedAnswers.reduce(
            (sum, a) => sum + (a.question_marks || 0), 0
          )
          return {
            ...prev,
            answers: updatedAnswers,
            total_marks_obtained: totalObtained,
            percentage: totalMarks > 0 ? (totalObtained / totalMarks) * 100 : 0,
          }
        }
        return { ...prev, answers: updatedAnswers }
      })
      toast.success('Notes saved')
    } catch (error: any) {
      toast.error(error.message || 'Failed to save notes')
    } finally {
      setSavingAnswer(null)
    }
  }

  const handleReevaluate = () => {
    setReevalDialogOpen(true)
  }

  const confirmReevaluate = async () => {
    setReevalDialogOpen(false)
    try {
      setReevaluating(true)
      await reevaluateSubmission(submissionId)
      toast.success('Re-evaluation started! Refresh in a few moments.')
      setTimeout(fetchSubmission, 3000)
    } catch (error: any) {
      toast.error(error.message || 'Failed to re-evaluate')
    } finally {
      setReevaluating(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      in_progress: 'bg-blue-100 text-blue-800',
      submitted: 'bg-green-100 text-green-800',
      auto_submitted: 'bg-yellow-100 text-yellow-800',
      abandoned: 'bg-red-100 text-red-800',
    }

    return (
      <Badge className={variants[status] || variants.submitted}>
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    )
  }

  // ── Anti-cheating helpers ──────────────────────────────────

  // Activity types that are pure noise — never shown in timeline
  const NOISE_TYPES = new Set([
    'code_change', 'window_focus', 'device_fingerprint', 'question_time', 'network_online',
  ])

  // Human-readable labels
  const ACTIVITY_LABELS: Record<string, string> = {
    tab_switch: 'Tab / App Switch',
    window_blur: 'Left Browser Window',
    window_focus: 'Returned to Window',
    copy: 'Copied Text',
    paste: 'Pasted Text',
    devtools: 'Opened DevTools',
    vm_detected: 'VM / Automation Detected',
    fullscreen_change: 'Exited Fullscreen',
    screenshot_attempt: 'Screenshot Attempt',
    ai_typing_detected: 'AI/Bot Typing Pattern',
    right_click_attempt: 'Right-Click (Inspect)',
    multiple_tabs_detected: 'Opened Multiple Tabs',
    mouse_leave: 'Cursor Left Window',
    idle_detected: 'Idle — No Activity',
    split_screen: 'Split-Screen Detected',
    network_offline: 'Went Offline',
    network_online: 'Came Back Online',
    text_selection: 'Selected Question Text',
    orientation_change: 'Screen Rotated',
    navigation_attempt: 'Tried to Leave Page',
    code_change: 'Code Edit',
    device_fingerprint: 'Device Fingerprint',
    question_time: 'Time on Question',
  }

  const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
    tab_switch: <EyeOff className="h-4 w-4" />,
    window_blur: <EyeOff className="h-4 w-4" />,
    copy: <Copy className="h-4 w-4" />,
    paste: <ClipboardPaste className="h-4 w-4" />,
    devtools: <Monitor className="h-4 w-4" />,
    vm_detected: <Bot className="h-4 w-4" />,
    fullscreen_change: <Maximize2 className="h-4 w-4" />,
    screenshot_attempt: <Camera className="h-4 w-4" />,
    ai_typing_detected: <Bot className="h-4 w-4" />,
    right_click_attempt: <ScanSearch className="h-4 w-4" />,
    multiple_tabs_detected: <Layers className="h-4 w-4" />,
    mouse_leave: <Mouse className="h-4 w-4" />,
    idle_detected: <TimerOff className="h-4 w-4" />,
    split_screen: <Layers className="h-4 w-4" />,
    network_offline: <EyeOff className="h-4 w-4" />,
    text_selection: <ScanSearch className="h-4 w-4" />,
    orientation_change: <Maximize2 className="h-4 w-4" />,
    navigation_attempt: <Mouse className="h-4 w-4" />,
  }

  // Severity colour classes for timeline rows
  const SEVERITY_ROW: Record<string, string> = {
    critical: 'bg-red-50 border-red-300',
    high: 'bg-orange-50 border-orange-300',
    medium: 'bg-yellow-50 border-yellow-300',
    low: 'bg-gray-50 border-gray-200',
  }
  const SEVERITY_BADGE: Record<string, string> = {
    critical: 'bg-red-100 text-red-800',
    high: 'bg-orange-100 text-orange-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-gray-100 text-gray-600',
  }

  // Per-type severity (matches backend risk scores)
  function getActivitySeverity(type: string): 'critical' | 'high' | 'medium' | 'low' {
    if (['vm_detected'].includes(type)) return 'critical'
    if (['ai_typing_detected', 'devtools', 'multiple_tabs_detected', 'split_screen'].includes(type)) return 'high'
    if (['screenshot_attempt', 'idle_detected', 'fullscreen_change', 'network_offline', 'navigation_attempt'].includes(type)) return 'medium'
    return 'low'
  }

  // Build summary counts from raw activities (exclude noise)
  function buildSummary(activities: Activity[]) {
    const counts: Record<string, number> = {}
    for (const a of activities) {
      if (NOISE_TYPES.has(a.activity_type)) continue
      counts[a.activity_type] = (counts[a.activity_type] ?? 0) + 1
    }
    return counts
  }

  // Filtered timeline — only events worth showing
  function buildTimeline(activities: Activity[]) {
    return activities.filter((a) => !NOISE_TYPES.has(a.activity_type))
  }

  // Overall risk level derived from activities
  const RISK_SCORES: Record<string, number> = {
    tab_switch: 5, window_blur: 3, copy: 10, paste: 10,
    devtools: 50, vm_detected: 100, fullscreen_change: 10,
    screenshot_attempt: 25, ai_typing_detected: 75,
    right_click_attempt: 5, multiple_tabs_detected: 50,
    mouse_leave: 4, idle_detected: 15,
    split_screen: 40, network_offline: 20, text_selection: 8,
    orientation_change: 5, navigation_attempt: 30,
  }

  function calcRisk(activities: Activity[]) {
    const total = activities.reduce((sum, a) => sum + (RISK_SCORES[a.activity_type] ?? 0), 0)
    const level = total >= 300 ? 'critical' : total >= 150 ? 'high' : total >= 50 ? 'medium' : 'low'
    return { total, level }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    )
  }

  if (!submission) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Submission not found</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Submission Review
            </h1>
            <p className="text-gray-600 mt-1">{submission.candidate_name}</p>
          </div>
        </div>
        <Button
          onClick={handleReevaluate}
          disabled={reevaluating}
          variant="outline"
        >
          {reevaluating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Re-evaluating...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Re-evaluate
            </>
          )}
        </Button>
      </div>

      {/* Candidate Info */}
      <Card>
        <CardHeader>
          <CardTitle>Candidate Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-600">Name</p>
                <p className="font-medium">{submission.candidate_name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-600">Email</p>
                <p className="font-medium">{submission.candidate_email}</p>
              </div>
            </div>
            {submission.candidate_phone && (
              <div className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-600">Phone</p>
                  <p className="font-medium">{submission.candidate_phone}</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-600">Submitted At</p>
                <p className="font-medium">
                  {submission.submitted_at
                    ? format(new Date(submission.submitted_at), 'MMM dd, yyyy HH:mm')
                    : 'In Progress'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resume */}
      {(submission.resume_path || resumeUrl) && (
        <Card className="border-l-4 border-l-teal-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Candidate Resume
            </CardTitle>
          </CardHeader>
          <CardContent>
            {resumeLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading resume...
              </div>
            ) : resumeUrl ? (
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-teal-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Resume uploaded</p>
                  <p className="text-xs text-gray-500">
                    {submission.resume_path?.split('/').pop() || 'resume'}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(resumeUrl, '_blank')}
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  View
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  asChild
                >
                  <a href={resumeUrl} download>
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </a>
                </Button>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Resume file not available</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Digital Signature & Bond Agreement */}
      {submission.signature_data && (
        <Card className="border-l-4 border-l-amber-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Bond Agreement Signature
            </CardTitle>
            <CardDescription>
              Candidate accepted terms and conditions with digital signature
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Signature Image */}
            <div className="border-2 border-amber-200 rounded-lg bg-white p-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Digital Signature:</p>
              <div className="bg-gray-50 border border-gray-200 rounded p-4 inline-block">
                <img
                  src={submission.signature_data}
                  alt="Candidate Signature"
                  className="max-w-md h-auto"
                />
              </div>
            </div>

            {/* Signature Details */}
            <div className="grid gap-4 md:grid-cols-2 text-sm">
              {submission.signature_accepted_at && (
                <div className="flex items-start gap-2">
                  <Calendar className="h-4 w-4 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-700">Signed At</p>
                    <p className="text-gray-600">
                      {format(new Date(submission.signature_accepted_at), 'MMM dd, yyyy HH:mm:ss')}
                    </p>
                  </div>
                </div>
              )}
              {submission.terms_ip_address && (
                <div className="flex items-start gap-2">
                  <svg className="h-4 w-4 text-amber-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <div>
                    <p className="font-medium text-gray-700">IP Address (Audit Trail)</p>
                    <p className="text-gray-600 font-mono">{submission.terms_ip_address}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Legal Notice */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
              <CheckCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-900">Terms Accepted</p>
                <p className="text-amber-800 mt-1">
                  Candidate has digitally signed and accepted the bond agreement and terms & conditions.
                  This signature is legally binding.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Score Summary */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Status</CardTitle>
          </CardHeader>
          <CardContent>{getStatusBadge(submission.status)}</CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-yellow-600" />
              <span className="text-2xl font-bold">
                {submission.total_marks_obtained?.toFixed(1) ?? 0}
              </span>
              {(() => {
                const total = submission.answers?.reduce((s, a) => s + (a.question_marks || 0), 0) ?? 0
                return total > 0 ? (
                  <span className="text-sm text-gray-500">/ {total} pts</span>
                ) : null
              })()}
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Duration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600" />
              <span className="text-2xl font-bold">
                {submission.session_duration_seconds
                  ? Math.floor(submission.session_duration_seconds / 60)
                  : 0}
                m
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Flags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {submission.late_submission && (
                <Badge variant="outline" className="text-orange-700 border-orange-300">
                  Late Submission
                </Badge>
              )}
              {submission.suspicious_activity && (
                <Badge variant="outline" className="text-red-700 border-red-300">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Suspicious Activity
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Answers */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Answers & Evaluations</h2>

        {submission.answers?.map((answer, index) => (
          <Card key={answer.id} className="border-l-4 border-l-indigo-500">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Question {index + 1}</CardTitle>
                <div className="flex items-center gap-2">
                  {answer.question_difficulty && (
                    <Badge variant="outline" className="capitalize">
                      {answer.question_difficulty}
                    </Badge>
                  )}
                  {answer.is_correct ? (
                    <Badge className="bg-green-600">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Correct
                    </Badge>
                  ) : (
                    <Badge variant="outline">Needs Review</Badge>
                  )}
                  <Badge variant="outline">
                    {answer.marks_awarded?.toFixed(1) || 0} / {answer.question_marks || 0} marks
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Question Text */}
              {answer.question_text && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <Label className="text-base font-semibold text-blue-900">Question</Label>
                  <p className="mt-2 text-sm text-blue-800 whitespace-pre-wrap">{answer.question_text}</p>
                  {answer.question_topics && answer.question_topics.length > 0 && (
                    <div className="flex gap-1 mt-3 flex-wrap">
                      {answer.question_topics.map((topic, i) => (
                        <Badge key={i} variant="outline" className="text-xs bg-blue-100 border-blue-300">{topic}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Submitted Answer */}
              <div>
                <Label className="text-base">Submitted Answer</Label>
                <div className="mt-2">
                  <CodeEditor
                    value={answer.submitted_code || '// No answer submitted'}
                    onChange={() => { }}
                    language={answer.programming_language}
                    readOnly
                    height="300px"
                  />
                </div>
              </div>

              {/* Evaluation Results */}
              {answer.feedback && (
                <div className="space-y-3">
                  <Label className="text-base">AI Evaluation</Label>
                  <div className="p-4 bg-gray-50 rounded-lg border">
                    <p className="text-sm whitespace-pre-wrap">{answer.feedback}</p>
                  </div>

                  {answer.code_quality_score && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Code Quality:</span>
                      <Badge variant="outline">{answer.code_quality_score}/100</Badge>
                    </div>
                  )}

                  {answer.similarity_score && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Similarity to Solution:</span>
                      <Badge variant="outline">{answer.similarity_score}%</Badge>
                    </div>
                  )}

                  {answer.key_points_covered && answer.key_points_covered.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-green-700 mb-2">
                        ✓ Covered Points:
                      </p>
                      <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                        {answer.key_points_covered.map((point, i) => (
                          <li key={i}>{point}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {answer.key_points_missed && answer.key_points_missed.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-red-700 mb-2">
                        ✗ Missed Points:
                      </p>
                      <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                        {answer.key_points_missed.map((point, i) => (
                          <li key={i}>{point}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Interviewer Notes + Score Override */}
              <div className="space-y-3 border rounded-lg p-4 bg-amber-50 border-amber-200">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold text-amber-900 flex items-center gap-2">
                    <Pencil className="h-4 w-4" />
                    Interviewer Notes &amp; Score Override
                  </Label>
                </div>
                <Textarea
                  placeholder="Add your notes about this answer..."
                  rows={3}
                  value={notesDrafts[answer.id] ?? ''}
                  onChange={(e) =>
                    setNotesDrafts((prev) => ({ ...prev, [answer.id]: e.target.value }))
                  }
                  className="bg-white"
                />
                <div className="flex items-center gap-3">
                  <Label className="text-sm text-amber-800 whitespace-nowrap">
                    Override Score:
                  </Label>
                  <input
                    type="number"
                    min={0}
                    max={answer.question_marks || 999}
                    step={0.5}
                    value={scoreDrafts[answer.id] ?? ''}
                    onChange={(e) =>
                      setScoreDrafts((prev) => ({ ...prev, [answer.id]: e.target.value }))
                    }
                    placeholder={`${answer.marks_awarded?.toFixed(1) ?? '0'}`}
                    className="w-24 h-8 rounded-md border border-amber-300 bg-white px-2 text-sm"
                  />
                  <span className="text-sm text-amber-800">/ {answer.question_marks ?? 0} marks</span>
                  <Button
                    size="sm"
                    onClick={() => handleSaveNotes(answer)}
                    disabled={savingAnswer === answer.id}
                    className="ml-auto bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    {savingAnswer === answer.id ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Save className="h-3 w-3 mr-1" />
                    )}
                    Save
                  </Button>
                </div>
                {answer.evaluator_notes && (
                  <p className="text-xs text-amber-700 italic">
                    Last saved: "{answer.evaluator_notes}"
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Anti-Cheating Panel */}
      {submission.activities && submission.activities.length > 0 && (() => {
        const summary = buildSummary(submission.activities)
        const timeline = buildTimeline(submission.activities)
        const { total: riskTotal, level: riskLevel } = calcRisk(submission.activities)

        const riskConfig = {
          critical: { bar: 'bg-red-500', text: 'text-red-700', label: 'Critical Risk', icon: <ShieldAlert className="h-5 w-5 text-red-600" /> },
          high: { bar: 'bg-orange-500', text: 'text-orange-700', label: 'High Risk', icon: <ShieldAlert className="h-5 w-5 text-orange-500" /> },
          medium: { bar: 'bg-yellow-400', text: 'text-yellow-700', label: 'Medium Risk', icon: <ShieldAlert className="h-5 w-5 text-yellow-500" /> },
          low: { bar: 'bg-green-400', text: 'text-green-700', label: 'Low Risk', icon: <ShieldCheck className="h-5 w-5 text-green-600" /> },
        }[riskLevel]!

        // Readable detail line per activity type
        function detailLine(type: string, metadata: any): string | null {
          if (!metadata) return null
          switch (type) {
            case 'paste': return `Pasted ${metadata.paste_length ?? '?'} characters`
            case 'copy': return metadata.selection_length ? `Selected ${metadata.selection_length} characters` : null
            case 'tab_switch': return metadata.action === 'blur' ? 'Left the exam tab' : 'Returned to exam tab'
            case 'idle_detected': return `Inactive for ${metadata.idle_seconds ?? '?'}s`
            case 'devtools': return metadata.is_open ? 'Developer tools opened' : 'Developer tools closed'
            case 'fullscreen_change': return metadata.is_fullscreen ? 'Entered fullscreen' : 'Exited fullscreen'
            case 'ai_typing_detected': return `Avg interval ${metadata.avg_interval?.toFixed(0)}ms, variance ${metadata.variance?.toFixed(0)}ms`
            case 'split_screen': return `Viewport ${metadata.viewport_width}px / Screen ${metadata.screen_width}px (${Math.round((metadata.ratio ?? 0) * 100)}%)`
            case 'network_offline': return 'Connection dropped'
            case 'network_online': return metadata.offline_duration_seconds != null ? `Was offline for ${metadata.offline_duration_seconds}s` : null
            case 'text_selection': return `${metadata.selected_length ?? '?'} characters selected`
            case 'orientation_change': return metadata.orientation ? `Switched to ${metadata.orientation}` : null
            case 'navigation_attempt': return 'Attempted to close or leave the page'
            default: return null
          }
        }

        return (
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {riskConfig.icon}
                    Integrity Report
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Monitoring signals collected during the session
                  </CardDescription>
                </div>
                <div className={`text-right`}>
                  <p className={`text-2xl font-bold ${riskConfig.text}`}>{riskTotal}</p>
                  <p className={`text-xs font-semibold uppercase tracking-wide ${riskConfig.text}`}>{riskConfig.label}</p>
                </div>
              </div>
              {/* Risk bar */}
              <div className="mt-3 h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${riskConfig.bar}`}
                  style={{ width: `${Math.min(100, (riskTotal / 300) * 100)}%` }}
                />
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Summary grid */}
              {Object.keys(summary).length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Signal Summary</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(summary)
                      .sort(([, a], [, b]) => b - a)
                      .map(([type, count]) => {
                        const sev = getActivitySeverity(type)
                        return (
                          <div key={type} className={`flex items-center gap-2 p-2.5 rounded-lg border ${SEVERITY_ROW[sev]}`}>
                            <span className={SEVERITY_BADGE[sev].replace('bg-', 'text-').replace('100', '600') + ' flex-shrink-0'}>
                              {ACTIVITY_ICONS[type] ?? <MousePointer2 className="h-4 w-4" />}
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs font-medium leading-tight truncate">{ACTIVITY_LABELS[type] ?? type}</p>
                              <p className="text-lg font-bold leading-tight">{count}×</p>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}

              {/* Timeline */}
              {timeline.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                    Event Timeline ({timeline.length} events)
                  </p>
                  <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                    {timeline.map((activity) => {
                      const sev = getActivitySeverity(activity.activity_type)
                      const detail = detailLine(activity.activity_type, activity.metadata)
                      return (
                        <div
                          key={activity.id}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm ${SEVERITY_ROW[sev]}`}
                        >
                          <span className={`flex-shrink-0 ${SEVERITY_BADGE[sev].replace('bg-', 'text-').replace('100', '600')}`}>
                            {ACTIVITY_ICONS[activity.activity_type] ?? <MousePointer2 className="h-4 w-4" />}
                          </span>
                          <div className="flex-1 min-w-0">
                            <span className="font-medium">{ACTIVITY_LABELS[activity.activity_type] ?? activity.activity_type}</span>
                            {detail && <span className="text-gray-500 ml-2 text-xs">{detail}</span>}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge className={`text-xs px-1.5 py-0 ${SEVERITY_BADGE[sev]}`}>{sev}</Badge>
                            <span className="text-xs text-gray-400 tabular-nums">
                              {format(new Date(activity.timestamp), 'HH:mm:ss')}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {timeline.length === 0 && Object.keys(summary).length === 0 && (
                <div className="flex items-center gap-2 text-green-700 text-sm">
                  <ShieldCheck className="h-5 w-5" />
                  No suspicious activity detected during this session.
                </div>
              )}
            </CardContent>
          </Card>
        )
      })()}

      <ConfirmDialog
        open={reevalDialogOpen}
        onOpenChange={setReevalDialogOpen}
        onConfirm={confirmReevaluate}
        title="Re-evaluate Submission"
        description="This will overwrite existing scores with a new AI evaluation. Are you sure you want to continue?"
        confirmText="Re-evaluate"
      />
    </div>
  )
}
