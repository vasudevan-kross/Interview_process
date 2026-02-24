'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { apiClient } from '@/lib/api/client'
import { toast } from 'sonner'
import { Loader2, ArrowLeft, Award, User, Mail, Calendar, CheckCircle2, XCircle, MinusCircle } from 'lucide-react'
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

  const getScoreColor = (percentage: number) => {
    if (percentage >= 80) return 'from-green-500 to-emerald-500'
    if (percentage >= 60) return 'from-blue-500 to-cyan-500'
    if (percentage >= 40) return 'from-orange-500 to-yellow-500'
    return 'from-red-500 to-pink-500'
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
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
      {/* Gradient Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-500/90 to-red-600 p-8 text-white shadow-xl">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10"></div>
        <div className="relative z-10">
          <Button
            variant="ghost"
            onClick={() => router.push(`/dashboard/test-evaluation/${answerSheet.test_id}/results`)}
            className="mb-4 text-white hover:bg-white/20 -ml-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Results
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Award className="h-6 w-6" />
                <span className="text-sm font-medium opacity-90">Detailed Evaluation</span>
              </div>
              <h1 className="text-4xl font-bold mb-2">{answerSheet.candidate_name}</h1>
              <p className="text-lg opacity-90">
                {answerSheet.test_title}
              </p>
            </div>
            <div className="text-right">
              <div className={`inline-block px-6 py-3 rounded-2xl bg-gradient-to-r ${getScoreColor(answerSheet.percentage)} text-white shadow-xl`}>
                <div className="text-4xl font-bold">{answerSheet.percentage.toFixed(1)}%</div>
                <div className="text-sm opacity-90 mt-1">
                  {answerSheet.total_marks_obtained} / {answerSheet.evaluations.reduce((sum, e) => sum + e.max_marks, 0)} marks
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Candidate Information */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="border-0 shadow-lg overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent"></div>
          <CardHeader className="pb-3 relative">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 shadow-md">
                <User className="h-4 w-4 text-white" />
              </div>
              <CardTitle className="text-sm font-medium">Candidate Name</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="relative">
            <p className="text-lg font-semibold text-slate-900">{answerSheet.candidate_name}</p>
            {answerSheet.candidate_id && (
              <p className="text-xs text-slate-600 mt-1">ID: {answerSheet.candidate_id}</p>
            )}
          </CardContent>
        </Card>

        {answerSheet.candidate_email && (
          <Card className="border-0 shadow-lg overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent"></div>
            <CardHeader className="pb-3 relative">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 shadow-md">
                  <Mail className="h-4 w-4 text-white" />
                </div>
                <CardTitle className="text-sm font-medium">Email</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="relative">
              <p className="text-lg font-semibold text-slate-900 break-all">{answerSheet.candidate_email}</p>
            </CardContent>
          </Card>
        )}

        <Card className="border-0 shadow-lg overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent"></div>
          <CardHeader className="pb-3 relative">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 shadow-md">
                <Calendar className="h-4 w-4 text-white" />
              </div>
              <CardTitle className="text-sm font-medium">Submitted</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="relative">
            <p className="text-lg font-semibold text-slate-900">
              {answerSheet.submitted_at ? formatDateTime(answerSheet.submitted_at) : 'N/A'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Question-by-Question Evaluation */}
      <Card className="border-0 shadow-lg overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent"></div>
        <CardHeader className="relative">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 shadow-md">
              <Award className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl">Question-by-Question Evaluation</CardTitle>
              <CardDescription>AI-powered assessment with detailed feedback</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative">
          <div className="space-y-6">
            {answerSheet.evaluations.length === 0 ? (
              <div className="text-center py-16">
                <div className="p-6 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 mb-4 inline-block shadow-lg">
                  <Award className="h-12 w-12 text-white" />
                </div>
                <p className="text-lg font-medium text-slate-900 mb-2">No evaluations found</p>
                <p className="text-slate-600">This answer sheet hasn't been evaluated yet</p>
              </div>
            ) : (
              answerSheet.evaluations.map((evaluation, index) => {
                const percentage = (evaluation.marks_awarded / evaluation.max_marks) * 100
                return (
                  <div
                    key={evaluation.id}
                    className="border border-slate-200 rounded-xl p-6 hover:border-orange-300 hover:bg-orange-50/30 transition-all"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white font-bold shadow-md flex-shrink-0">
                          {evaluation.question_number || index + 1}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-slate-900 mb-2 text-lg">
                            {evaluation.question_text}
                          </h3>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 ml-4">
                        {getStatusIcon(evaluation.is_correct, percentage)}
                        <div className="text-right">
                          <div className="font-bold text-lg bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                            {evaluation.marks_awarded} / {evaluation.max_marks}
                          </div>
                          <div className="text-xs text-slate-600">
                            {percentage.toFixed(0)}%
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 ml-13">
                      {/* Candidate's Answer */}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="h-1 w-1 rounded-full bg-orange-500"></div>
                          <p className="text-sm font-semibold text-slate-700">Candidate's Answer:</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                          <p className="text-slate-800 whitespace-pre-wrap">
                            {evaluation.candidate_answer || <span className="text-slate-400 italic">No answer provided</span>}
                          </p>
                        </div>
                      </div>

                      {/* AI Feedback */}
                      {evaluation.feedback && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="h-1 w-1 rounded-full bg-orange-500"></div>
                            <p className="text-sm font-semibold text-slate-700">AI Feedback:</p>
                          </div>
                          <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-lg p-4 border border-orange-200">
                            <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">
                              {evaluation.feedback}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Similarity Score */}
                      {evaluation.similarity_score !== null && (
                        <div className="flex items-center gap-2">
                          <div className="h-1 w-1 rounded-full bg-orange-500"></div>
                          <p className="text-sm text-slate-600">
                            Similarity Score: <span className="font-semibold text-slate-900">{(evaluation.similarity_score * 100).toFixed(1)}%</span>
                          </p>
                        </div>
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
          className="border-orange-200 text-orange-700 hover:bg-orange-50 hover:border-orange-300"
        >
          Back to Results
        </Button>
      </div>
    </div>
  )
}
