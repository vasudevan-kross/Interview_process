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
import { Loader2, Briefcase, FileText, Users, Award, ChevronRight, Zap } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'

export default function ResumeMatchingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [jobFile, setJobFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [department, setDepartment] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!jobFile) {
      toast.error('Please select a job description file')
      return
    }

    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', jobFile)
      formData.append('title', title)
      formData.append('department', department || '')

      await apiClient.uploadJobDescription(formData)

      toast.success('Job description uploaded successfully!')
      router.push('/dashboard/resume-matching/jobs')
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to upload job description')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resume Matching"
        description="Upload a job description to start AI-powered candidate matching."
        action={
          <Button variant="outline" onClick={() => router.push('/dashboard/resume-matching/jobs')}>
            <Briefcase className="mr-2 h-4 w-4" />
            View Jobs
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* Left — Upload form (3/5 width) */}
        <div className="lg:col-span-3">
          <Card className="border border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Upload Job Description</CardTitle>
              <CardDescription>
                Upload your JD in PDF, DOCX, or TXT format. AI will extract required skills.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title" className="text-sm font-medium">Job Title *</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Senior Software Engineer"
                    required
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="department" className="text-sm font-medium">Department (Optional)</Label>
                  <Input
                    id="department"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="e.g., Engineering"
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Job Description File *</Label>
                    <a href="/samples/resume-matching/sample_job_description.txt" download className="text-xs text-indigo-600 hover:text-indigo-700 hover:underline">Download Sample JD</a>
                  </div>
                  <FileUpload
                    onFilesSelected={(files) => setJobFile(files[0] || null)}
                    maxFiles={1}
                    multiple={false}
                    disabled={loading}
                  />
                  {jobFile && (
                    <div className="text-xs text-slate-600 flex items-center gap-1.5 bg-slate-50 px-3 py-2 rounded-md border border-slate-100">
                      <FileText className="h-3 w-3 text-slate-400" />
                      {jobFile.name}
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || !jobFile}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {loading ? 'Processing...' : 'Upload & Continue to Resumes'}
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
                  title: 'Upload Job Description',
                  desc: 'Upload your JD as PDF, DOCX, or TXT. AI extracts required skills and qualifications automatically.',
                },
                {
                  step: '2',
                  title: 'Upload Resumes',
                  desc: 'Add candidate resumes in bulk. Supports PDF and DOCX formats, up to 50 resumes at once.',
                },
                {
                  step: '3',
                  title: 'AI Ranks Candidates',
                  desc: 'Hybrid semantic + keyword matching scores each resume against your requirements.',
                },
                {
                  step: '4',
                  title: 'Review Rankings',
                  desc: 'See ranked candidates with match scores, extracted skills, and side-by-side comparisons.',
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
              { icon: Users, label: 'Candidates', value: '50+', sub: 'per batch' },
              { icon: Award, label: 'Accuracy', value: '95%', sub: 'match rate' },
              { icon: FileText, label: 'Formats', value: 'PDF', sub: 'DOCX · TXT' },
            ].map(({ icon: Icon, label, value, sub }) => (
              <Card key={label} className="border border-slate-200 bg-white">
                <CardContent className="pt-4 pb-3 px-3 text-center">
                  <Icon className="h-4 w-4 text-slate-400 mx-auto mb-1.5" />
                  <p className="text-base font-bold text-slate-900 tabular-nums">{value}</p>
                  <p className="text-[10px] text-slate-500 leading-tight">{sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Quick link */}
          <button
            onClick={() => router.push('/dashboard/resume-matching/jobs')}
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-indigo-200 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center">
                <Briefcase className="h-4 w-4 text-slate-500" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-slate-800">View existing jobs</p>
                <p className="text-xs text-slate-500">Browse all uploaded job descriptions</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
          </button>
        </div>
      </div>
    </div>
  )
}
