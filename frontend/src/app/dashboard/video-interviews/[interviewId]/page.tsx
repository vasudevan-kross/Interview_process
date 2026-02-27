'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft,
  Calendar,
  Clock,
  Users,
  Video,
  PlayCircle,
  FileText,
  Loader2,
  Eye,
  CheckCircle,
} from 'lucide-react'
import { getInterviewDetails, type InterviewDetails } from '@/lib/api/video-interviews'
import { toast } from 'sonner'
import { format } from 'date-fns'

export default function InterviewDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const interviewId = params?.interviewId as string

  const [interview, setInterview] = useState<InterviewDetails | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (interviewId) {
      fetchInterview()
    }
  }, [interviewId])

  const fetchInterview = async () => {
    try {
      setLoading(true)
      const data = await getInterviewDetails(interviewId)
      setInterview(data)
    } catch (error: any) {
      toast.error(error.message || 'Failed to load interview details')
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { className: string }> = {
      scheduled: { className: 'bg-blue-600 text-white' },
      in_progress: { className: 'bg-green-600 text-white' },
      completed: { className: 'bg-gray-600 text-white' },
      cancelled: { className: 'bg-red-600 text-white' },
    }

    const config = variants[status] || variants.scheduled

    return (
      <Badge className={config.className}>
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    )
  }

  const canJoinInterview = () => {
    if (!interview) return false

    const now = new Date()
    const scheduledTime = new Date(interview.scheduled_at)
    const endTime = new Date(scheduledTime.getTime() + interview.duration_minutes * 60000)

    // Can join 15 minutes before and during the interview
    const diffMinutes = (scheduledTime.getTime() - now.getTime()) / (1000 * 60)

    return diffMinutes <= 15 && now < endTime && interview.status !== 'completed'
  }

  const hasRecording = () => {
    return interview?.status === 'completed' && interview?.recording_path
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-cyan-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading interview details...</p>
        </div>
      </div>
    )
  }

  if (!interview) {
    return (
      <div className="max-w-4xl mx-auto mt-12">
        <Card>
          <CardContent className="pt-12 pb-12">
            <div className="text-center">
              <Video className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                Interview not found
              </h3>
              <Button variant="outline" onClick={() => router.back()}>
                Go Back
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Button
          variant="ghost"
          onClick={() => router.push('/dashboard/video-interviews')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Interviews
        </Button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <Video className="h-8 w-8 text-cyan-600" />
              {interview.title}
            </h1>
            <p className="text-slate-600 mt-1">{interview.description}</p>
          </div>
          <div>{getStatusBadge(interview.status)}</div>
        </div>
      </div>

      {/* Quick Actions */}
      <Card className="bg-gradient-to-r from-cyan-50 to-blue-50 border-cyan-200">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            {canJoinInterview() && (
              <Button
                onClick={() =>
                  router.push(`/dashboard/video-interviews/${interviewId}/live`)
                }
                className="bg-cyan-600 hover:bg-cyan-700"
                size="lg"
              >
                <Video className="h-5 w-5 mr-2" />
                Join Interview
              </Button>
            )}
            {hasRecording() && (
              <Button
                onClick={() =>
                  router.push(`/dashboard/video-interviews/${interviewId}/recording`)
                }
                variant="outline"
                size="lg"
              >
                <PlayCircle className="h-5 w-5 mr-2" />
                Watch Recording
              </Button>
            )}
            {interview.status === 'completed' && (
              <Button
                onClick={() =>
                  router.push(`/dashboard/video-interviews/${interviewId}/evaluate`)
                }
                variant="outline"
                size="lg"
              >
                <CheckCircle className="h-5 w-5 mr-2" />
                Evaluate
              </Button>
            )}
          </div>
          {canJoinInterview() && (
            <p className="text-sm text-slate-600 mt-3">
              💡 You can join the interview up to 15 minutes before the scheduled time
            </p>
          )}
        </CardContent>
      </Card>

      {/* Interview Details */}
      <Card>
        <CardHeader>
          <CardTitle>Interview Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Scheduled Date & Time
              </label>
              <p className="mt-1 text-slate-900 font-medium">
                {format(new Date(interview.scheduled_at), 'MMMM dd, yyyy')}
              </p>
              <p className="text-slate-600">
                {format(new Date(interview.scheduled_at), 'h:mm a')}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Duration
              </label>
              <p className="mt-1 text-slate-900 font-medium">
                {interview.duration_minutes} minutes
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-600">
                Interview Type
              </label>
              <p className="mt-1 text-slate-900 font-medium capitalize">
                {interview.interview_type.replace('_', ' ')}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-600">
                Candidate
              </label>
              <p className="mt-1 text-slate-900 font-medium">
                {interview.candidate_name || 'N/A'}
              </p>
              <p className="text-sm text-slate-600">{interview.candidate_email}</p>
            </div>

            {interview.started_at && (
              <div>
                <label className="text-sm font-medium text-slate-600">
                  Started At
                </label>
                <p className="mt-1 text-slate-900 font-medium">
                  {format(new Date(interview.started_at), 'MMM dd, yyyy h:mm a')}
                </p>
              </div>
            )}

            {interview.completed_at && (
              <div>
                <label className="text-sm font-medium text-slate-600">
                  Completed At
                </label>
                <p className="mt-1 text-slate-900 font-medium">
                  {format(new Date(interview.completed_at), 'MMM dd, yyyy h:mm a')}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Participants */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Participants ({interview.participants.length})
          </CardTitle>
          <CardDescription>
            Interviewers and observers for this session
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {interview.participants.map((participant) => (
              <div
                key={participant.id}
                className="flex items-center justify-between p-4 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-cyan-600 flex items-center justify-center text-white font-semibold">
                    {participant.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">{participant.name}</p>
                    <p className="text-sm text-slate-600">{participant.email}</p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="outline" className="capitalize">
                    {participant.role}
                  </Badge>
                  {participant.joined_at && (
                    <p className="text-xs text-slate-500 mt-1">
                      Joined at {format(new Date(participant.joined_at), 'h:mm a')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Questions */}
      {interview.questions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Interview Questions ({interview.questions.length})
            </CardTitle>
            <CardDescription>
              Pre-loaded questions for this interview
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {interview.questions.map((question) => (
                <div
                  key={question.id}
                  className="p-4 border border-slate-200 rounded-lg"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Q{question.question_number}</Badge>
                      <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">
                        {question.question_type}
                      </Badge>
                      {question.difficulty && (
                        <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">
                          {question.difficulty}
                        </Badge>
                      )}
                    </div>
                    {question.expected_duration_minutes && (
                      <span className="text-sm text-slate-500">
                        {question.expected_duration_minutes} min
                      </span>
                    )}
                  </div>
                  <p className="text-slate-900">{question.question_text}</p>
                  {question.skills_assessed.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {question.skills_assessed.map((skill, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Evaluations */}
      {interview.evaluations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Evaluations ({interview.evaluations.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {interview.evaluations.map((evaluation) => (
                <div
                  key={evaluation.id}
                  className="p-4 border border-slate-200 rounded-lg"
                >
                  <div className="flex items-center justify-between mb-3">
                    <Badge className="capitalize">
                      {evaluation.evaluation_type}
                    </Badge>
                    <span className="text-2xl font-bold text-cyan-600">
                      {evaluation.overall_score}/100
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    <div>
                      <label className="text-xs text-slate-600">Communication</label>
                      <p className="font-semibold">{evaluation.communication_score}</p>
                    </div>
                    <div>
                      <label className="text-xs text-slate-600">Technical</label>
                      <p className="font-semibold">{evaluation.technical_score}</p>
                    </div>
                    <div>
                      <label className="text-xs text-slate-600">Problem Solving</label>
                      <p className="font-semibold">{evaluation.problem_solving_score}</p>
                    </div>
                    <div>
                      <label className="text-xs text-slate-600">Cultural Fit</label>
                      <p className="font-semibold">{evaluation.cultural_fit_score}</p>
                    </div>
                  </div>
                  {evaluation.recommendation && (
                    <div className="mb-2">
                      <Badge
                        className={
                          evaluation.recommendation.includes('hire')
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }
                      >
                        {evaluation.recommendation.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </div>
                  )}
                  {evaluation.key_highlights && (
                    <p className="text-sm text-slate-700 mt-2">
                      {evaluation.key_highlights}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
