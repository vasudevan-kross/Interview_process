'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  BarChart3,
  Trophy,
  Target,
  CheckCircle2,
  Code,
  FileText,
  Clock,
  Award,
} from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { SkeletonPageHeader, SkeletonStatCards, SkeletonTable } from '@/components/ui/skeleton'
import { toast } from 'sonner'

export default function SubmissionStatisticsPage() {
  const params = useParams()
  const router = useRouter()
  const submissionId = params.id as string
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStatistics()
  }, [submissionId])

  const loadStatistics = async () => {
    try {
      setLoading(true)
      const data = await apiClient.getSubmissionStatistics(submissionId)
      setStats(data)
    } catch (error: any) {
      console.error('Error loading submission statistics:', error)
      toast.error('Failed to load submission statistics')
      setTimeout(() => router.back(), 2000)
    } finally {
      setLoading(false)
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

  const handleDownloadPdf = async () => {
    try {
      const blob = await apiClient.downloadSubmissionReport(submissionId)
      const candidateName = stats?.candidate?.name?.replace(/\s+/g, '_') || 'candidate'
      downloadBlob(blob, `${candidateName}_technical_assessment.pdf`)
      toast.success('Report downloaded successfully')
    } catch (error: any) {
      console.error('Error downloading PDF:', error)
      toast.error('Failed to download PDF report')
    }
  }

  const getRatingColor = (rating: string) => {
    if (rating === 'Excellent') return 'text-green-700 bg-green-50'
    if (rating === 'Very Good') return 'text-blue-700 bg-blue-50'
    if (rating === 'Good') return 'text-indigo-700 bg-indigo-50'
    if (rating === 'Average') return 'text-yellow-700 bg-yellow-50'
    return 'text-slate-700 bg-slate-50'
  }

  const getDecisionColor = (decision: string) => {
    switch (decision) {
      case 'selected':
        return 'text-green-700 bg-green-50'
      case 'rejected':
        return 'text-red-700 bg-red-50'
      case 'hold':
        return 'text-yellow-700 bg-yellow-50'
      default:
        return 'text-slate-700 bg-slate-50'
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonPageHeader />
        <SkeletonStatCards />
        <SkeletonTable rows={6} cols={4} />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-500">Submission not found</p>
      </div>
    )
  }

  const { candidate, job, technical_assessment, overall_performance, comparative_analytics, timeline } = stats

  return (
    <div className="space-y-6">
      {/* Header with back button and download */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="text-sm text-slate-600 hover:text-slate-900 inline-flex items-center"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Submissions
        </button>
        <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={handleDownloadPdf}>
          <FileText className="w-4 h-4 mr-2" />
          Download PDF Report
        </Button>
      </div>

      {/* Page Header */}
      <PageHeader
        title={`Technical Assessment: ${candidate.name}`}
        description={`Performance report for ${job.title}`}
      />

      {/* Overall Performance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Overall Score</p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900 mt-1">
                {overall_performance.overall_score ? `${overall_performance.overall_score}%` : 'N/A'}
              </p>
            </div>
            <Trophy className="w-10 h-10 text-indigo-500" />
          </div>
          <div className={`mt-3 inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${getRatingColor(overall_performance.rating)}`}>
            {overall_performance.rating}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Completion Rate</p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900 mt-1">
                {overall_performance.completion_rate}%
              </p>
            </div>
            <BarChart3 className="w-10 h-10 text-blue-500" />
          </div>
          <p className="text-xs text-slate-500 mt-3">
            {overall_performance.stages_completed}/{overall_performance.stages_total} stages completed
          </p>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Current Stage</p>
              <p className="text-sm font-medium text-slate-900 mt-1">
                {candidate.current_stage.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
              </p>
            </div>
            <Target className="w-10 h-10 text-green-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Status</p>
              <p className="text-sm font-medium text-slate-900 mt-1">
                {candidate.final_decision.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
              </p>
            </div>
            <CheckCircle2 className="w-10 h-10 text-purple-500" />
          </div>
          <div className={`mt-3 inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${getDecisionColor(candidate.final_decision)}`}>
            {candidate.final_decision.replace(/_/g, ' ')}
          </div>
        </div>
      </div>

      {/* Contact Information */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Contact Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">Email</p>
            <p className="text-sm text-slate-900 mt-1">{candidate.email}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">Phone</p>
            <p className="text-sm text-slate-900 mt-1">{candidate.phone || 'Not provided'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">Assessment</p>
            <p className="text-sm text-slate-900 mt-1">{job.title}</p>
          </div>
        </div>
      </div>

      {/* Technical Assessment Section */}
      {technical_assessment.completed && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex items-center mb-4">
            <Code className="w-5 h-5 text-indigo-600 mr-2" />
            <h2 className="text-lg font-semibold text-slate-900">Technical Assessment Results</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider">Score</p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900 mt-1">
                {technical_assessment.percentage}%
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider">Status</p>
              <p className="text-sm text-slate-900 mt-1">{technical_assessment.status}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider">Duration</p>
              <p className="text-sm text-slate-900 mt-1">{technical_assessment.duration_formatted}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider">Submitted</p>
              <p className="text-sm text-slate-900 mt-1">
                {technical_assessment.submitted_at ? new Date(technical_assessment.submitted_at).toLocaleDateString() : 'N/A'}
              </p>
            </div>
          </div>

          {(technical_assessment.late_submission || technical_assessment.suspicious_activity) && (
            <div className="mb-4 flex gap-2">
              {technical_assessment.late_submission && (
                <span className="px-2.5 py-0.5 rounded-md text-xs font-medium bg-yellow-50 text-yellow-700">
                  Late Submission
                </span>
              )}
              {technical_assessment.suspicious_activity && (
                <span className="px-2.5 py-0.5 rounded-md text-xs font-medium bg-red-50 text-red-700">
                  Suspicious Activity Flagged
                </span>
              )}
            </div>
          )}

          {technical_assessment.questions && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 p-4 bg-slate-50 rounded-md">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Total Questions</p>
                  <p className="text-lg font-semibold text-slate-900 mt-1">{technical_assessment.questions.total}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Attempted</p>
                  <p className="text-lg font-semibold text-slate-900 mt-1">{technical_assessment.questions.attempted}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Fully Correct</p>
                  <p className="text-lg font-semibold text-slate-900 mt-1">{technical_assessment.questions.fully_correct}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Accuracy Rate</p>
                  <p className="text-lg font-semibold text-slate-900 mt-1">{technical_assessment.questions.accuracy_rate.toFixed(1)}%</p>
                </div>
              </div>

              {/* Questions table */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Question</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Difficulty</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Language</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Score</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {technical_assessment.questions.details.map((q: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm text-slate-900">{q.title}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                            q.difficulty === 'easy' ? 'bg-green-50 text-green-700' :
                            q.difficulty === 'medium' ? 'bg-yellow-50 text-yellow-700' :
                            'bg-red-50 text-red-700'
                          }`}>
                            {q.difficulty}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">{q.language}</td>
                        <td className="px-4 py-3 text-sm tabular-nums text-slate-900">
                          {q.marks_obtained}/{q.max_marks} ({q.percentage.toFixed(0)}%)
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {q.fully_correct ? (
                            <span className="text-green-700">✓ Correct</span>
                          ) : q.attempted ? (
                            <span className="text-yellow-700">Attempted</span>
                          ) : (
                            <span className="text-slate-500">Skipped</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Comparative Analytics */}
      {comparative_analytics.available && comparative_analytics.technical_assessment && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex items-center mb-4">
            <Award className="w-5 h-5 text-indigo-600 mr-2" />
            <h2 className="text-lg font-semibold text-slate-900">Performance Ranking</h2>
            <span className="ml-2 text-xs text-slate-500">
              vs {comparative_analytics.total_candidates} candidates
            </span>
          </div>

          <div className="p-4 bg-green-50 rounded-md">
            <p className="text-sm font-medium text-green-900 mb-3">Technical Assessment Ranking</p>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-green-700">Rank:</span>
                <span className="font-semibold text-green-900">
                  #{comparative_analytics.technical_assessment.rank} of {comparative_analytics.technical_assessment.total_attempted}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-green-700">Percentile:</span>
                <span className="font-semibold text-green-900">{comparative_analytics.technical_assessment.percentile}%ile</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-green-700">Average Score:</span>
                <span className="font-semibold text-green-900">{comparative_analytics.technical_assessment.average_score}%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      {timeline && timeline.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex items-center mb-4">
            <Clock className="w-5 h-5 text-indigo-600 mr-2" />
            <h2 className="text-lg font-semibold text-slate-900">Assessment Timeline</h2>
          </div>
          <div className="space-y-4">
            {timeline.map((event: any, idx: number) => (
              <div key={idx} className="flex gap-4">
                <div className="flex-shrink-0 w-2 h-2 mt-2 rounded-full bg-indigo-600"></div>
                <div className="flex-1 pb-4 border-b border-slate-100 last:border-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{event.event}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {new Date(event.timestamp).toLocaleString()}
                      </p>
                      {event.score !== undefined && (
                        <p className="text-xs text-slate-600 mt-1">Score: {event.score}%</p>
                      )}
                    </div>
                    <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                      event.status === 'completed' ? 'bg-green-50 text-green-700' : 'bg-slate-50 text-slate-700'
                    }`}>
                      {event.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
