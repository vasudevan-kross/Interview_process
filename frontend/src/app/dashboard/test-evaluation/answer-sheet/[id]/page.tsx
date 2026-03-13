'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { apiClient } from '@/lib/api/client'
import { toast } from 'sonner'
import { ArrowLeft, Award, User, Mail, Calendar, CheckCircle2, XCircle, MinusCircle } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { SkeletonPageHeader } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/utils'

interface QuestionEvaluation {
  id: string
  question_id: string
  question_number: number
  question_text: string
  candidate_answer: string
  marks_awarded: number
  max_marks: number
  feedback: string
  is_correct: boolean | null
  similarity_score: number | null
}

interface AnswerSheetDetail {
  id: string
  test_id: string
  test_title: string
  candidate_name: string
  candidate_email: string
  candidate_id: string
  total_marks_obtained: number
  percentage: number
  status: string
  submitted_at: string
  evaluations: QuestionEvaluation[]
}

export default function AnswerSheetDetailPage() {
  const params = useParams()
  const router = useRouter()
  const answerId = params.id as string
  const [loading, setLoading] = useState(true)
  const [answerSheet, setAnswerSheet] = useState<AnswerSheetDetail | null>(null)

  useEffect(() => {
    fetchAnswerSheetDetails()
  }, [answerId])

  const fetchAnswerSheetDetails = async () => {
    try {
      setLoading(true)
      const response = await apiClient.getAnswerSheetEvaluation(answerId)
      setAnswerSheet(response)
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to load answer sheet details')
    } finally {
      setLoading(false)
    }
  }

  const getScoreStyle = (percentage: number) => {
    if (percentage >= 80) return 'bg-green-50 text-green-700 border border-green-200'
    if (percentage >= 60) return 'bg-blue-50 text-blue-700 border border-blue-200'
    if (percentage >= 40) return 'bg-orange-50 text-orange-700 border border-orange-200'
    return 'bg-red-50 text-red-700 border border-red-200'
  }

  const getStatusIcon = (isCorrect: boolean | null, percentage: number) => {
    if (isCorrect === null) {
      return <MinusCircle className="h-5 w-5 text-slate-400" />
    }
    if (percentage >= 80) {
      return <CheckCircle2 className="h-5 w-5 text-green-600" />
    }
    if (percentage >= 40) {
      return <MinusCircle className="h-5 w-5 text-orange-600" />
    }
    return <XCircle className="h-5 w-5 text-red-600" />
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <SkeletonPageHeader />
      </div>
    )
  }

  if (!answerSheet) {
    return (
      <div className="max-w-7xl mx-auto">
        <Card>
          <CardContent className="text-center py-16">
            <p className="text-lg text-muted-foreground">Answer sheet not found</p>
            <Button
              onClick={() => router.back()}
              className="mt-4"
            >
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title={answerSheet.candidate_name}
        description={answerSheet.test_title}
        action={
          <div className="flex items-center gap-3">
            <div className={`px-4 py-2 rounded-md text-sm font-semibold ${getScoreStyle(answerSheet.percentage)}`}>
              {answerSheet.percentage.toFixed(1)}% — {answerSheet.total_marks_obtained} / {answerSheet.evaluations.reduce((sum, e) => sum + e.max_marks, 0)} marks
            </div>
            <Button
              variant="outline"
              onClick={() => router.push(`/dashboard/test-evaluation/${answerSheet.test_id}/results`)}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Results
            </Button>
          </div>
        }
      />

      {/* Candidate Information */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="border border-slate-200 bg-white">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-slate-500">Candidate Name</CardTitle>
              <User className="h-4 w-4 text-slate-300" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-base font-semibold text-slate-900">{answerSheet.candidate_name}</p>
            {answerSheet.candidate_id && (
              <p className="text-xs text-slate-500 mt-1">ID: {answerSheet.candidate_id}</p>
            )}
          </CardContent>
        </Card>

        {answerSheet.candidate_email && (
          <Card className="border border-slate-200 bg-white">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-500">Email</CardTitle>
                <Mail className="h-4 w-4 text-slate-300" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-base font-semibold text-slate-900 break-all">{answerSheet.candidate_email}</p>
            </CardContent>
          </Card>
        )}

        <Card className="border border-slate-200 bg-white">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-slate-500">Submitted</CardTitle>
              <Calendar className="h-4 w-4 text-slate-300" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-base font-semibold text-slate-900">
              {answerSheet.submitted_at ? formatDateTime(answerSheet.submitted_at) : 'N/A'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Question-by-Question Evaluation */}
      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Question-by-Question Evaluation</CardTitle>
          <CardDescription>AI-powered assessment with detailed feedback</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {answerSheet.evaluations.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-sm font-medium text-slate-900 mb-1">No evaluations found</p>
                <p className="text-sm text-slate-400">This answer sheet hasn't been evaluated yet</p>
              </div>
            ) : (
              answerSheet.evaluations.map((evaluation, index) => {
                const percentage = (evaluation.marks_awarded / evaluation.max_marks) * 100
                return (
                  <div
                    key={evaluation.id}
                    className="border border-slate-200 rounded-lg p-5 hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-7 h-7 rounded-md bg-slate-100 text-slate-600 font-semibold text-xs flex items-center justify-center flex-shrink-0">
                          {evaluation.question_number || index + 1}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-slate-900 mb-2">
                            {evaluation.question_text}
                          </h3>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 ml-4">
                        {getStatusIcon(evaluation.is_correct, percentage)}
                        <div className="text-right">
                          <div className="font-semibold text-slate-900">
                            {evaluation.marks_awarded} / {evaluation.max_marks}
                          </div>
                          <div className="text-xs text-slate-500">
                            {percentage.toFixed(0)}%
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 ml-10">
                      {/* Candidate's Answer */}
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Candidate's Answer</p>
                        <div className="bg-slate-50 rounded-md p-3 border border-slate-200">
                          <p className="text-sm text-slate-800 whitespace-pre-wrap">
                            {evaluation.candidate_answer || <span className="text-slate-400 italic">No answer provided</span>}
                          </p>
                        </div>
                      </div>

                      {/* AI Feedback */}
                      {evaluation.feedback && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">AI Feedback</p>
                          <div className="bg-indigo-50/50 rounded-md p-3 border border-indigo-100">
                            <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                              {evaluation.feedback}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Similarity Score */}
                      {evaluation.similarity_score !== null && (
                        <p className="text-xs text-slate-500">
                          Similarity Score: <span className="font-semibold text-slate-700">{(evaluation.similarity_score * 100).toFixed(1)}%</span>
                        </p>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-4 justify-end">
        <Button
          variant="outline"
          onClick={() => router.push(`/dashboard/test-evaluation/${answerSheet.test_id}/results`)}
        >
          Back to Results
        </Button>
      </div>
    </div>
  )
}
