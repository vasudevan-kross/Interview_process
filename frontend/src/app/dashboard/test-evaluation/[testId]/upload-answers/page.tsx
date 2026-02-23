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
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Upload Answer Sheet</h1>
        <p className="text-muted-foreground">
          Upload candidate answer sheets for automated evaluation
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Candidate Information</CardTitle>
          <CardDescription>
            Enter candidate details and upload their answer sheet
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="candidateName">Candidate Name *</Label>
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
                <Label htmlFor="candidateEmail">Candidate Email</Label>
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
              <Label>Answer Sheet File *</Label>
              <FileUpload
                onFilesSelected={(files) => setAnswerFile(files[0] || null)}
                maxFiles={1}
                multiple={false}
                disabled={loading}
              />
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={loading || !answerFile} className="flex-1">
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
