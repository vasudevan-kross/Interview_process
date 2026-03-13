'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FileUpload } from '@/components/ui/file-upload'
import { BatchUpload } from '@/components/test/BatchUpload'
import { apiClient } from '@/lib/api/client'
import { toast } from 'sonner'
import { Loader2, Upload, FileStack } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'

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
      <PageHeader
        title="Upload Answer Sheets"
        description="Upload single or multiple candidate answer sheets for automated AI-powered evaluation."
      />

      {/* Tabs for Single/Batch */}
      <Tabs defaultValue="single" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="single" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Single Upload
          </TabsTrigger>
          <TabsTrigger value="batch" className="flex items-center gap-2">
            <FileStack className="h-4 w-4" />
            Batch Upload (20+ papers)
          </TabsTrigger>
        </TabsList>

        {/* Single Upload Tab */}
        <TabsContent value="single" className="mt-6">
          <Card className="border border-slate-200 bg-white">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <Upload className="h-5 w-5 text-slate-400" />
                <CardTitle className="text-xl text-slate-900">Candidate Information</CardTitle>
              </div>
              <CardDescription className="text-base">
                Enter candidate details and upload their answer sheet for instant grading
              </CardDescription>
            </CardHeader>
            <CardContent>
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
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Answer Sheet File *</Label>
                    <a href="/samples/test-evaluation/sample_answer_sheet.txt" download className="text-xs text-indigo-600 hover:text-indigo-700 hover:underline">Download Sample Answer</a>
                  </div>
                  <FileUpload
                    onFilesSelected={(files) => setAnswerFile(files[0] || null)}
                    maxFiles={1}
                    multiple={false}
                    disabled={loading}
                  />
                  {answerFile && (
                    <div className="text-xs text-slate-600 flex items-center gap-1 bg-slate-50 px-3 py-2 rounded-md border border-slate-100">
                      <Upload className="h-3 w-3 text-slate-400" />
                      {answerFile.name}
                    </div>
                  )}
                </div>

                {loading && (
                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex items-center gap-3 mb-2">
                      <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
                      <p className="font-semibold text-slate-900">Evaluating answer sheet...</p>
                    </div>
                    <p className="text-sm text-slate-600">
                      AI is analyzing the answers and calculating the score. This may take a few moments.
                    </p>
                  </div>
                )}

                <div className="flex gap-4">
                  <Button
                    type="submit"
                    disabled={loading || !answerFile}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700"
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
                    disabled={loading}
                  >
                    View Results
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Batch Upload Tab */}
        <TabsContent value="batch" className="mt-6">
          <BatchUpload
            testId={testId}
            onComplete={() => {
              toast.success('Batch processing complete!')
              router.push(`/dashboard/test-evaluation/${testId}/results`)
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
