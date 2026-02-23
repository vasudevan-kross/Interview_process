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
import { Loader2, Briefcase, Users } from 'lucide-react'

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
      formData.append('user_id', 'temp-user-id') // TODO: Get from auth

      const result = await apiClient.uploadJobDescription(formData)

      toast.success('Job description uploaded successfully!')
      router.push(`/dashboard/resume-matching/${result.job_id}/upload-resumes`)
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to upload job description')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Resume Matching</h1>
        <p className="text-muted-foreground">
          Upload a job description and match it with candidate resumes using AI
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <Briefcase className="h-8 w-8 text-primary mb-2" />
            <CardTitle>Step 1: Upload Job Description</CardTitle>
            <CardDescription>
              Upload the job description file to start the matching process
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Job Title *</Label>
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
                <Label htmlFor="department">Department (Optional)</Label>
                <Input
                  id="department"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g., Engineering"
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label>Job Description File *</Label>
                <FileUpload
                  onFilesSelected={(files) => setJobFile(files[0] || null)}
                  maxFiles={1}
                  multiple={false}
                  disabled={loading}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading || !jobFile}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Upload & Continue to Resumes
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Users className="h-8 w-8 text-primary mb-2" />
            <CardTitle>How It Works</CardTitle>
            <CardDescription>
              AI-powered resume matching in 3 simple steps
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                1
              </div>
              <div>
                <h3 className="font-semibold mb-1">Upload Job Description</h3>
                <p className="text-sm text-muted-foreground">
                  Upload your JD in PDF, DOCX, or TXT format. Our AI will extract required skills and qualifications.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                2
              </div>
              <div>
                <h3 className="font-semibold mb-1">Upload Candidate Resumes</h3>
                <p className="text-sm text-muted-foreground">
                  Upload multiple resumes at once. Supports PDF, DOCX, and even scanned documents with OCR.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                3
              </div>
              <div>
                <h3 className="font-semibold mb-1">Get Ranked Results</h3>
                <p className="text-sm text-muted-foreground">
                  View candidates ranked by match score with detailed skill analysis and recommendations.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push('/dashboard/resume-matching/jobs')}
              >
                View Existing Jobs
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
