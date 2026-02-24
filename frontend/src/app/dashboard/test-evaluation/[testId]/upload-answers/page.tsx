'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileUpload } from '@/components/ui/file-upload'
import { apiClient } from '@/lib/api/client'
import { toast } from 'sonner'
import { Loader2, Upload } from 'lucide-react'

export default function UploadAnswersPage() {
  const router = useRouter()
  const params = useParams()
  const testId = params.testId as string

  const [loading, setLoading] = useState(false)
  const [answerFile, setAnswerFile] = useState<File | null>(null)
  const [candidateName, setCandidateName] = useState('')
  const [candidateEmail, setCandidateEmail] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!answerFile) {
      toast.error('Please select an answer sheet file')
      return
    }

    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', answerFile)
      formData.append('test_id', testId)
      formData.append('candidate_name', candidateName)
      formData.append('candidate_email', candidateEmail || '')

      const result = await apiClient.uploadAnswerSheet(formData)

      toast.success(
        `Answer sheet evaluated! Score: ${result.percentage.toFixed(1)}%`
      )

      // Reset form
      setAnswerFile(null)
      setCandidateName('')
      setCandidateEmail('')

      // Show success and option to continue
      setTimeout(() => {
        router.push(`/dashboard/test-evaluation/${testId}/results`)
      }, 2000)
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to evaluate answer sheet')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Gradient Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-500/90 to-red-600 p-8 text-white shadow-xl">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <Upload className="h-6 w-6" />
            <span className="text-sm font-medium opacity-90">Answer Sheet Submission</span>
          </div>
          <h1 className="text-4xl font-bold mb-2">Upload Answer Sheet</h1>
          <p className="text-lg opacity-90">
            Upload candidate answer sheets for automated AI-powered evaluation
          </p>
        </div>
      </div>

      <Card className="border-0 shadow-lg overflow-hidden relative group hover:shadow-xl transition-all">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent"></div>
        <CardHeader className="relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 shadow-md">
              <Upload className="h-5 w-5 text-white" />
            </div>
            <CardTitle className="text-xl">Candidate Information</CardTitle>
          </div>
          <CardDescription className="text-base">
            Enter candidate details and upload their answer sheet for instant grading
          </CardDescription>
        </CardHeader>
        <CardContent className="relative">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="candidateName" className="text-sm font-semibold">Candidate Name *</Label>
                <Input
                  id="candidateName"
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  placeholder="John Doe"
                  required
                  disabled={loading}
                  className="border-slate-200 focus:border-orange-500 focus:ring-orange-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="candidateEmail" className="text-sm font-semibold">Candidate Email (Optional)</Label>
                <Input
                  id="candidateEmail"
                  type="email"
                  value={candidateEmail}
                  onChange={(e) => setCandidateEmail(e.target.value)}
                  placeholder="john@example.com"
                  disabled={loading}
                  className="border-slate-200 focus:border-orange-500 focus:ring-orange-500"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Answer Sheet File *</Label>
              <FileUpload
                onFilesSelected={(files) => setAnswerFile(files[0] || null)}
                maxFiles={1}
                multiple={false}
                disabled={loading}
              />
              {answerFile && (
                <div className="text-xs text-slate-600 flex items-center gap-1 bg-orange-50 px-3 py-2 rounded-md">
                  <Upload className="h-3 w-3" />
                  {answerFile.name}
                </div>
              )}
            </div>

            {loading && (
              <div className="p-4 rounded-lg bg-orange-50 border border-orange-200">
                <div className="flex items-center gap-3 mb-2">
                  <Loader2 className="h-5 w-5 animate-spin text-orange-600" />
                  <p className="font-semibold text-orange-900">Evaluating answer sheet...</p>
                </div>
                <p className="text-sm text-orange-700">
                  AI is analyzing the answers and calculating the score. This may take a few moments.
                </p>
              </div>
            )}

            <div className="flex gap-4">
              <Button
                type="submit"
                disabled={loading || !answerFile}
                className="flex-1 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-md hover:shadow-lg transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Evaluating...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload & Evaluate
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(`/dashboard/test-evaluation/${testId}/results`)}
                className="border-orange-200 text-orange-700 hover:bg-orange-50 hover:border-orange-300"
                disabled={loading}
              >
                View Results
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
