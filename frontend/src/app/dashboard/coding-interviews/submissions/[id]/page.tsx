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
} from 'lucide-react'
import { getSubmission, reevaluateSubmission, getResumeUrl, type Submission } from '@/lib/api/coding-interviews'
import CodeEditor from '@/components/coding/CodeEditor'
import { toast } from 'sonner'
import { format } from 'date-fns'

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

  useEffect(() => {
    fetchSubmission()
  }, [submissionId])

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

  const getActivityTypeIcon = (type: string) => {
    switch (type) {
      case 'tab_switch':
        return '🔄'
      case 'copy':
        return '📋'
      case 'paste':
        return '📝'
      case 'window_blur':
        return '👁️'
      case 'window_focus':
        return '✅'
      case 'code_change':
        return '⌨️'
      default:
        return '•'
    }
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
                {submission.percentage?.toFixed(1) || 0}%
              </span>
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

              {/* Interviewer Notes */}
              <div className="space-y-2">
                <Label className="text-base">Interviewer Notes (optional)</Label>
                <Textarea
                  placeholder="Add your notes or override evaluation..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Anti-Cheating Timeline */}
      {submission.activities && submission.activities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Activity Timeline</CardTitle>
            <CardDescription>
              {submission.suspicious_activity && (
                <span className="text-red-600 font-medium">
                  ⚠️ This submission has been flagged for suspicious activity
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {submission.activities.map((activity) => (
                <div
                  key={activity.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${activity.flagged
                    ? 'bg-red-50 border-red-200'
                    : 'bg-gray-50 border-gray-200'
                    }`}
                >
                  <span className="text-2xl">{getActivityTypeIcon(activity.activity_type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">
                        {activity.activity_type.replace('_', ' ').toUpperCase()}
                      </p>
                      <span className="text-xs text-gray-500">
                        {format(new Date(activity.timestamp), 'HH:mm:ss')}
                      </span>
                    </div>
                    {activity.metadata && (
                      <p className="text-xs text-gray-600 mt-1">
                        {JSON.stringify(activity.metadata, null, 2)}
                      </p>
                    )}
                  </div>
                  {activity.flagged && (
                    <Badge variant="outline" className="text-red-700 border-red-300">
                      {activity.severity}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
