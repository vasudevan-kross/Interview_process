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
import { Loader2, FileText, ClipboardCheck, ChevronRight, Zap, Clock, Award, Users } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'

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
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        toast.error('Please login to continue')
        router.push('/login')
        return
      }

      const { data: userRecord } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      let userId = userRecord?.id

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
    <div className="space-y-6">
      <PageHeader
        title="Test Evaluation"
        description="Upload a question paper and evaluate candidate answer sheets using AI grading."
        action={
          <Button variant="outline" onClick={() => router.push('/dashboard/test-evaluation/tests')}>
            <FileText className="mr-2 h-4 w-4" />
            View Tests
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* Left — Upload form (3/5 width) */}
        <div className="lg:col-span-3">
          <Card className="border border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Upload Question Paper</CardTitle>
              <CardDescription>
                Start the AI evaluation process by uploading your test questions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="testTitle" className="text-sm font-medium">Test Title *</Label>
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
                    <Label htmlFor="testType" className="text-sm font-medium">Test Type *</Label>
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
                    <Label htmlFor="duration" className="text-sm font-medium">Duration (mins)</Label>
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
                  <Label htmlFor="totalMarks" className="text-sm font-medium">Total Marks *</Label>
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
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Question Paper File *</Label>
                    <a href="/samples/test-evaluation/sample_question_paper.txt" download className="text-xs text-indigo-600 hover:text-indigo-700 hover:underline">Download Sample Paper</a>
                  </div>
                  <FileUpload
                    onFilesSelected={(files) => setQuestionFile(files[0] || null)}
                    maxFiles={1}
                    multiple={false}
                    disabled={loading}
                  />
                  {questionFile && (
                    <div className="text-xs text-slate-600 flex items-center gap-1.5 bg-slate-50 px-3 py-2 rounded-md border border-slate-100">
                      <FileText className="h-3 w-3 text-slate-400" />
                      {questionFile.name}
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || !questionFile}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {loading ? 'Processing...' : 'Upload & Continue to Answer Sheets'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right — Info panel (2/5 width) */}
        <div className="lg:col-span-2 space-y-4">
          {/* How it works */}
          <Card className="border border-slate-200 bg-white">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Zap className="h-4 w-4 text-indigo-500" />
                How It Works
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                {
                  step: '1',
                  title: 'Upload Question Paper',
                  desc: 'Upload your question paper as PDF, DOCX, or TXT. AI parses each question and its mark allocation.',
                },
                {
                  step: '2',
                  title: 'Upload Answer Sheets',
                  desc: 'Add candidate answer sheets in bulk — printed or handwritten. OCR reads them automatically.',
                },
                {
                  step: '3',
                  title: 'AI Grades Each Answer',
                  desc: 'LLM evaluates answers with partial credit, generates per-question feedback, and assigns scores.',
                },
                {
                  step: '4',
                  title: 'Review Results',
                  desc: 'See ranked candidates, detailed score breakdowns, and AI feedback for every answer.',
                },
              ].map((item) => (
                <div key={item.step} className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-600 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">
                    {item.step}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{item.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: Users, value: '50+', sub: 'sheets/batch' },
              { icon: Clock, value: '80%', sub: 'time saved' },
              { icon: Award, value: '95%', sub: 'accuracy' },
            ].map(({ icon: Icon, value, sub }) => (
              <Card key={sub} className="border border-slate-200 bg-white">
                <CardContent className="pt-4 pb-3 px-3 text-center">
                  <Icon className="h-4 w-4 text-slate-400 mx-auto mb-1.5" />
                  <p className="text-base font-bold text-slate-900 tabular-nums">{value}</p>
                  <p className="text-[10px] text-slate-500 leading-tight">{sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Supported formats */}
          <Card className="border border-slate-200 bg-white">
            <CardContent className="pt-4 pb-4 px-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Supported Formats</p>
              <div className="space-y-2">
                {[
                  { label: 'Question Papers', formats: 'PDF, DOCX, TXT' },
                  { label: 'Answer Sheets', formats: 'PDF, JPG, PNG' },
                  { label: 'Handwriting', formats: 'OCR supported' },
                ].map(({ label, formats }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-xs text-slate-600">{label}</span>
                    <span className="text-xs font-medium text-slate-800 bg-slate-100 px-2 py-0.5 rounded">{formats}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Quick link */}
          <button
            onClick={() => router.push('/dashboard/test-evaluation/tests')}
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-indigo-200 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center">
                <ClipboardCheck className="h-4 w-4 text-slate-500" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-slate-800">View existing tests</p>
                <p className="text-xs text-slate-500">Browse all uploaded question papers</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
          </button>
        </div>
      </div>
    </div>
  )
}
