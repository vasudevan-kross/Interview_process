'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileUpload } from '@/components/ui/file-upload'
import { apiClient } from '@/lib/api/client'
import { createClient } from '@/lib/supabase/client'
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
      // Get authenticated user
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        toast.error('Please login to continue')
        router.push('/login')
        return
      }

      // Get or create user record in users table
      const { data: userRecord } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      let userId = userRecord?.id

      // If user doesn't exist in users table, create it
      if (!userId) {
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert({
            auth_user_id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name || user.email?.split('@')[0]
          })
          .select('id')
          .single()

        if (createError) {
          console.error('Error creating user:', createError)
          toast.error('Failed to create user record')
          return
        }

        userId = newUser.id
      }

      const formData = new FormData()
      formData.append('file', questionFile)
      formData.append('test_title', testTitle)
      formData.append('test_type', testType || 'general')
      formData.append('total_marks', totalMarks)
      formData.append('duration_minutes', duration || '0')
      formData.append('user_id', userId)

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
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Gradient Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-500/90 to-red-600 p-8 text-white shadow-xl">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardCheck className="h-6 w-6" />
            <span className="text-sm font-medium opacity-90">AI-Powered Assessment</span>
          </div>
          <h1 className="text-4xl font-bold mb-2">Test Evaluation</h1>
          <p className="text-lg opacity-90">
            Upload a question paper and evaluate candidate answer sheets using advanced AI grading
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Upload Form Card */}
        <Card className="border-0 shadow-lg overflow-hidden relative group hover:shadow-xl transition-all">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent"></div>
          <CardHeader className="relative">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 shadow-md">
                <FileText className="h-5 w-5 text-white" />
              </div>
              <CardTitle className="text-xl">Upload Question Paper</CardTitle>
            </div>
            <CardDescription>
              Start the AI evaluation process by uploading your test questions
            </CardDescription>
          </CardHeader>
          <CardContent className="relative">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="testTitle" className="text-sm font-semibold">Test Title *</Label>
                <Input
                  id="testTitle"
                  value={testTitle}
                  onChange={(e) => setTestTitle(e.target.value)}
                  placeholder="e.g., Backend Developer Assessment"
                  required
                  disabled={loading}
                  className="border-slate-200 focus:border-orange-500 focus:ring-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="testType" className="text-sm font-semibold">Test Type *</Label>
                  <Input
                    id="testType"
                    value={testType}
                    onChange={(e) => setTestType(e.target.value)}
                    placeholder="e.g., Development"
                    required
                    disabled={loading}
                    className="border-slate-200 focus:border-orange-500 focus:ring-orange-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="duration" className="text-sm font-semibold">Duration (mins)</Label>
                  <Input
                    id="duration"
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="60"
                    disabled={loading}
                    className="border-slate-200 focus:border-orange-500 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="totalMarks" className="text-sm font-semibold">Total Marks *</Label>
                <Input
                  id="totalMarks"
                  type="number"
                  step="0.01"
                  value={totalMarks}
                  onChange={(e) => setTotalMarks(e.target.value)}
                  placeholder="100"
                  required
                  disabled={loading}
                  className="border-slate-200 focus:border-orange-500 focus:ring-orange-500"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Question Paper File *</Label>
                <FileUpload
                  onFilesSelected={(files) => setQuestionFile(files[0] || null)}
                  maxFiles={1}
                  multiple={false}
                  disabled={loading}
                />
                {questionFile && (
                  <div className="text-xs text-slate-600 flex items-center gap-1 bg-orange-50 px-3 py-2 rounded-md">
                    <FileText className="h-3 w-3" />
                    {questionFile.name}
                  </div>
                )}
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-md hover:shadow-lg transition-all"
                disabled={loading || !questionFile}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? 'Processing...' : 'Upload & Continue to Answer Sheets'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* How It Works Card */}
        <Card className="border-0 shadow-lg overflow-hidden relative group hover:shadow-xl transition-all">
          <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent"></div>
          <CardHeader className="relative">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 shadow-md">
                <ClipboardCheck className="h-5 w-5 text-white" />
              </div>
              <CardTitle className="text-xl">How It Works</CardTitle>
            </div>
            <CardDescription>
              AI-powered test evaluation in 3 simple steps
            </CardDescription>
          </CardHeader>
          <CardContent className="relative space-y-4">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-red-500 text-white text-sm font-bold shadow-md flex-shrink-0">
                1
              </div>
              <div>
                <h3 className="font-semibold mb-1 text-slate-900">Upload Question Paper</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Upload your test questions in PDF, DOCX, or image format. AI will parse all questions automatically.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-red-500 text-white text-sm font-bold shadow-md flex-shrink-0">
                2
              </div>
              <div>
                <h3 className="font-semibold mb-1 text-slate-900">Upload Answer Sheets</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Upload candidate answer sheets. Supports handwritten answers with OCR.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-red-500 text-white text-sm font-bold shadow-md flex-shrink-0">
                3
              </div>
              <div>
                <h3 className="font-semibold mb-1 text-slate-900">Get Automated Evaluations</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  AI evaluates each answer with partial credit and provides detailed feedback.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200">
              <Button
                variant="outline"
                className="w-full border-orange-200 text-orange-700 hover:bg-orange-50 hover:border-orange-300 transition-all"
                onClick={() => router.push('/dashboard/test-evaluation/tests')}
              >
                <FileText className="mr-2 h-4 w-4" />
                View Existing Tests
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
