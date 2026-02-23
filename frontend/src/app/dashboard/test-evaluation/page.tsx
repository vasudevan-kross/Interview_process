'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileUpload } from '@/components/ui/file-upload'
import { apiClient } from '@/lib/api/client'
import { toast } from 'sonner'
import { Loader2, FileText, ClipboardCheck } from 'lucide-react'

export default function TestEvaluationPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [questionFile, setQuestionFile] = useState<File | null>(null)
  const [testTitle, setTestTitle] = useState('')
  const [testType, setTestType] = useState('')
  const [totalMarks, setTotalMarks] = useState('')
  const [duration, setDuration] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!questionFile) {
      toast.error('Please select a question paper file')
      return
    }

    if (!totalMarks || parseFloat(totalMarks) <= 0) {
      toast.error('Please enter valid total marks')
      return
    }

    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', questionFile)
      formData.append('test_title', testTitle)
      formData.append('test_type', testType || 'general')
      formData.append('total_marks', totalMarks)
      formData.append('duration_minutes', duration || '0')
      formData.append('user_id', 'temp-user-id') // TODO: Get from auth

      const result = await apiClient.uploadQuestionPaper(formData)

      toast.success('Question paper uploaded successfully!')
      router.push(`/dashboard/test-evaluation/${result.test_id}/upload-answers`)
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to upload question paper')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Test Evaluation</h1>
        <p className="text-muted-foreground">
          Upload a question paper and evaluate candidate answer sheets using AI
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <FileText className="h-8 w-8 text-primary mb-2" />
            <CardTitle>Step 1: Upload Question Paper</CardTitle>
            <CardDescription>
              Upload the test question paper to start the evaluation process
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="testTitle">Test Title *</Label>
                <Input
                  id="testTitle"
                  value={testTitle}
                  onChange={(e) => setTestTitle(e.target.value)}
                  placeholder="e.g., Backend Developer Assessment"
                  required
                  disabled={loading}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="testType">Test Type *</Label>
                  <Input
                    id="testType"
                    value={testType}
                    onChange={(e) => setTestType(e.target.value)}
                    placeholder="e.g., Development"
                    required
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="duration">Duration (mins)</Label>
                  <Input
                    id="duration"
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="60"
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="totalMarks">Total Marks *</Label>
                <Input
                  id="totalMarks"
                  type="number"
                  step="0.01"
                  value={totalMarks}
                  onChange={(e) => setTotalMarks(e.target.value)}
                  placeholder="100"
                  required
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label>Question Paper File *</Label>
                <FileUpload
                  onFilesSelected={(files) => setQuestionFile(files[0] || null)}
                  maxFiles={1}
                  multiple={false}
                  disabled={loading}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading || !questionFile}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Upload & Continue to Answer Sheets
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <ClipboardCheck className="h-8 w-8 text-primary mb-2" />
            <CardTitle>How It Works</CardTitle>
            <CardDescription>
              AI-powered test evaluation in 3 simple steps
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                1
              </div>
              <div>
                <h3 className="font-semibold mb-1">Upload Question Paper</h3>
                <p className="text-sm text-muted-foreground">
                  Upload your test questions in PDF, DOCX, or image format. AI will parse all questions automatically.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                2
              </div>
              <div>
                <h3 className="font-semibold mb-1">Upload Answer Sheets</h3>
                <p className="text-sm text-muted-foreground">
                  Upload candidate answer sheets. Supports handwritten answers with OCR.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                3
              </div>
              <div>
                <h3 className="font-semibold mb-1">Get Automated Evaluations</h3>
                <p className="text-sm text-muted-foreground">
                  AI evaluates each answer with partial credit and provides detailed feedback.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push('/dashboard/test-evaluation/tests')}
              >
                View Existing Tests
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
