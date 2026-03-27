'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  Download,
  FileText,
  ArrowLeft,
  BarChart3,
  Target,
  Trophy,
  Clock,
  CheckCircle2,
  Code,
  Phone,
  FileCheck,
  TrendingUp,
  Award
} from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { SkeletonPageHeader, SkeletonStatCards, SkeletonTable } from '@/components/ui/skeleton'
import { toast } from 'sonner'

interface CandidateStatistics {
  candidate: {
    id: string
    name: string
    email: string
    phone?: string
    current_stage: string
    recommendation: string
    final_decision: string
    decision_notes?: string
    created_at: string
    updated_at: string
  }
  job: {
    id: string
    title: string
    department?: string
    experience_required?: string
  }
  campaign?: {
    id: string
    name: string
    status: string
  }
  resume_screening: {
    completed: boolean
    match_score?: number
    screened_at?: string
    skills_found?: string[]
    skills_missing?: string[]
    total_experience_years?: number
    llm_analysis?: string
  }
  technical_assessment: {
    completed: boolean
    status?: string
    total_score?: number
    percentage?: number
    duration_seconds?: number
    duration_formatted?: string
    started_at?: string
    submitted_at?: string
    late_submission?: boolean
    suspicious_activity?: boolean
    questions?: {
      total: number
      attempted: number
      fully_correct: number
      attempt_rate: number
      accuracy_rate: number
      details: Array<{
        question_id: string
        title: string
        difficulty: string
        language: string
        marks_obtained: number
        max_marks: number
        percentage: number
        attempted: boolean
        fully_correct: boolean
      }>
    }
  }
  voice_screening: {
    completed: boolean
    status?: string
    recruiter_notes?: string
    calls?: {
      total: number
      completed: number
      total_duration_seconds: number
      total_duration_formatted: string
      total_cost: number
      average_duration: number
      details: Array<{
        call_id: string
        status: string
        started_at: string
        ended_at: string
        duration_seconds: number
        duration_formatted: string
        transcript?: string
        summary?: string
        cost: number
      }>
    }
  }
  timeline: Array<{
    stage: string
    event: string
    timestamp: string
    status: string
    score?: number
    duration?: number
    notes?: string
  }>
  overall_performance: {
    overall_score: number | null
    stages_completed: number
    stages_total: number
    completion_rate: number
    rating: string
    score_breakdown: {
      resume?: number
      technical?: number
      voice?: string
    }
  }
  comparative_analytics: {
    available: boolean
    reason?: string
    total_candidates?: number
    resume_screening?: {
      rank: number
      percentile: number
      average_score: number
      top_score: number
    }
    technical_assessment?: {
      rank: number
      percentile: number
      average_score: number
      top_score: number
      total_attempted: number
    }
    stage_distribution?: Record<string, number>
  }
}

export default function CandidateStatisticsPage() {
  const params = useParams()
  const router = useRouter()
  const candidateId = params.id as string
  const [stats, setStats] = useState<CandidateStatistics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStatistics()
  }, [candidateId])

  const loadStatistics = async () => {
    try {
      setLoading(true)
      const data = await apiClient.getCandidateStatistics(candidateId)
      setStats(data)
    } catch (error: any) {
      console.error('Error loading candidate statistics:', error)
      toast.error('Failed to load candidate statistics')
      // Redirect back after error
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
      const blob = await apiClient.downloadCandidateReport(candidateId)
      const candidateName = stats?.candidate?.name?.replace(/\s+/g, '_') || 'candidate'
      downloadBlob(blob, `${candidateName}_assessment_report.pdf`)
      toast.success('Report downloaded successfully')
    } catch (error: any) {
      console.error('Error downloading PDF:', error)
      toast.error('Failed to download PDF report')
    }
  }

  const getRecommendationColor = (recommendation: string) => {
    switch (recommendation) {
      case 'highly_recommended':
        return 'text-green-700 bg-green-50'
      case 'recommended':
        return 'text-blue-700 bg-blue-50'
      case 'not_recommended':
        return 'text-red-700 bg-red-50'
      default:
        return 'text-slate-700 bg-slate-50'
    }
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

  const getRatingColor = (rating: string) => {
    if (rating === 'Excellent') return 'text-green-700 bg-green-50'
    if (rating === 'Very Good') return 'text-blue-700 bg-blue-50'
    if (rating === 'Good') return 'text-indigo-700 bg-indigo-50'
    if (rating === 'Average') return 'text-yellow-700 bg-yellow-50'
    return 'text-slate-700 bg-slate-50'
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonPageHeader />
        <SkeletonStatCards count={4} />
        <SkeletonTable rows={6} cols={4} />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-500">Candidate not found</p>
      </div>
    )
  }

  const { candidate, job, campaign, resume_screening, technical_assessment, voice_screening, overall_performance, comparative_analytics, timeline } = stats

  return (
    <div className="space-y-6">
      {/* Header with back button and download */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="text-sm text-slate-600 hover:text-slate-900 inline-flex items-center"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </button>
        <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={handleDownloadPdf}>
          <FileText className="w-4 h-4 mr-2" />
          Download PDF Report
        </Button>
      </div>

      {/* Page Header */}
      <PageHeader
        title={`Assessment Report: ${candidate.name}`}
        description={`Comprehensive performance analysis for ${job.title}`}
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
              <p className="text-sm text-slate-500">Recommendation</p>
              <p className="text-sm font-medium text-slate-900 mt-1">
                {candidate.recommendation.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </p>
            </div>
            <Target className="w-10 h-10 text-green-500" />
          </div>
          <div className={`mt-3 inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${getRecommendationColor(candidate.recommendation)}`}>
            {candidate.recommendation.replace(/_/g, ' ')}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Final Decision</p>
              <p className="text-sm font-medium text-slate-900 mt-1">
                {candidate.final_decision.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
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
            <p className="text-xs text-slate-500 uppercase tracking-wider">Current Stage</p>
            <p className="text-sm text-slate-900 mt-1">
              {candidate.current_stage.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </p>
          </div>
        </div>
      </div>

      {/* Resume Screening Section */}
      {resume_screening.completed && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex items-center mb-4">
            <FileCheck className="w-5 h-5 text-indigo-600 mr-2" />
            <h2 className="text-lg font-semibold text-slate-900">1. Resume Screening Results</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider">Match Score</p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900 mt-1">
                {resume_screening.match_score}%
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider">Experience</p>
              <p className="text-sm text-slate-900 mt-1">
                {resume_screening.total_experience_years ? `${resume_screening.total_experience_years} years` : 'Not specified'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider">Screened On</p>
              <p className="text-sm text-slate-900 mt-1">
                {resume_screening.screened_at ? new Date(resume_screening.screened_at).toLocaleDateString() : 'N/A'}
              </p>
            </div>
          </div>

          {resume_screening.skills_found && resume_screening.skills_found.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Skills Matched</p>
              <div className="flex flex-wrap gap-2">
                {resume_screening.skills_found.slice(0, 15).map((skill, idx) => (
                  <span key={idx} className="px-2.5 py-0.5 rounded-md text-xs font-medium bg-green-50 text-green-700">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {resume_screening.skills_missing && resume_screening.skills_missing.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Skills Missing</p>
              <div className="flex flex-wrap gap-2">
                {resume_screening.skills_missing.slice(0, 8).map((skill, idx) => (
                  <span key={idx} className="px-2.5 py-0.5 rounded-md text-xs font-medium bg-red-50 text-red-700">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {resume_screening.llm_analysis && (
            <div className="mt-4 p-4 bg-slate-50 rounded-md">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Analysis</p>
              <p className="text-sm text-slate-700">{resume_screening.llm_analysis}</p>
            </div>
          )}
        </div>
      )}

      {/* Technical Assessment Section */}
      {technical_assessment.completed && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex items-center mb-4">
            <Code className="w-5 h-5 text-indigo-600 mr-2" />
            <h2 className="text-lg font-semibold text-slate-900">2. Technical Assessment Results</h2>
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
                    {technical_assessment.questions.details.map((q, idx) => (
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

      {/* Voice Screening Section */}
      {voice_screening.completed && voice_screening.calls && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex items-center mb-4">
            <Phone className="w-5 h-5 text-indigo-600 mr-2" />
            <h2 className="text-lg font-semibold text-slate-900">3. Voice Screening Results</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider">Total Calls</p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900 mt-1">{voice_screening.calls.total}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider">Completed</p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900 mt-1">{voice_screening.calls.completed}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider">Total Duration</p>
              <p className="text-sm text-slate-900 mt-1">{voice_screening.calls.total_duration_formatted}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider">Total Cost</p>
              <p className="text-sm text-slate-900 mt-1">${voice_screening.calls.total_cost.toFixed(2)}</p>
            </div>
          </div>

          {voice_screening.recruiter_notes && (
            <div className="mt-4 p-4 bg-slate-50 rounded-md">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Recruiter Notes</p>
              <p className="text-sm text-slate-700">{voice_screening.recruiter_notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Comparative Analytics */}
      {comparative_analytics.available && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex items-center mb-4">
            <TrendingUp className="w-5 h-5 text-indigo-600 mr-2" />
            <h2 className="text-lg font-semibold text-slate-900">Comparative Analysis</h2>
            <span className="ml-2 text-xs text-slate-500">
              vs {comparative_analytics.total_candidates} candidates for this position
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {comparative_analytics.resume_screening && (
              <div className="p-4 bg-blue-50 rounded-md">
                <p className="text-sm font-medium text-blue-900 mb-3">Resume Screening</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-blue-700">Rank:</span>
                    <span className="font-semibold text-blue-900">#{comparative_analytics.resume_screening.rank} of {comparative_analytics.total_candidates}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-blue-700">Percentile:</span>
                    <span className="font-semibold text-blue-900">{comparative_analytics.resume_screening.percentile}%ile</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-blue-700">Average Score:</span>
                    <span className="font-semibold text-blue-900">{comparative_analytics.resume_screening.average_score}%</span>
                  </div>
                </div>
              </div>
            )}

            {comparative_analytics.technical_assessment && (
              <div className="p-4 bg-green-50 rounded-md">
                <p className="text-sm font-medium text-green-900 mb-3">Technical Assessment</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-green-700">Rank:</span>
                    <span className="font-semibold text-green-900">#{comparative_analytics.technical_assessment.rank} of {comparative_analytics.technical_assessment.total_attempted}</span>
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
            )}
          </div>
        </div>
      )}

      {/* Decision Notes */}
      {candidate.decision_notes && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Decision Notes</h2>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{candidate.decision_notes}</p>
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
            {timeline.map((event, idx) => (
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
