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
      // Get authenticated user
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        toast.error('Please login to continue')
        router.push('/login')
        return
      }

      // Get or create user record in users table
      const { data: userRecord, error: userError } = await supabase
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
      formData.append('file', jobFile)
      formData.append('title', title)
      formData.append('department', department || '')
      formData.append('user_id', userId)

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
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Gradient Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-500/90 to-pink-600 p-8 text-white shadow-xl">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-6 w-6" />
            <span className="text-sm font-medium opacity-90">AI-Powered Recruitment</span>
          </div>
          <h1 className="text-4xl font-bold mb-2">Resume Matching</h1>
          <p className="text-lg opacity-90">
            Upload a job description and match it with candidate resumes using advanced AI algorithms
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Upload Form Card */}
        <Card className="border-0 shadow-lg overflow-hidden relative group hover:shadow-xl transition-all">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent"></div>
          <CardHeader className="relative">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 shadow-md">
                <Briefcase className="h-5 w-5 text-white" />
              </div>
              <CardTitle className="text-xl">Upload Job Description</CardTitle>
            </div>
            <CardDescription>
              Start the AI matching process by uploading your job requirements
            </CardDescription>
          </CardHeader>
          <CardContent className="relative">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title" className="text-sm font-semibold">Job Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Senior Software Engineer"
                  required
                  disabled={loading}
                  className="border-slate-200 focus:border-purple-500 focus:ring-purple-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="department" className="text-sm font-semibold">Department (Optional)</Label>
                <Input
                  id="department"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g., Engineering"
                  disabled={loading}
                  className="border-slate-200 focus:border-purple-500 focus:ring-purple-500"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Job Description File *</Label>
                <FileUpload
                  onFilesSelected={(files) => setJobFile(files[0] || null)}
                  maxFiles={1}
                  multiple={false}
                  disabled={loading}
                />
                {jobFile && (
                  <div className="text-xs text-slate-600 flex items-center gap-1 bg-purple-50 px-3 py-2 rounded-md">
                    <Briefcase className="h-3 w-3" />
                    {jobFile.name}
                  </div>
                )}
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-md hover:shadow-lg transition-all"
                disabled={loading || !jobFile}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? 'Processing...' : 'Upload & Continue to Resumes'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* How It Works Card */}
        <Card className="border-0 shadow-lg overflow-hidden relative group hover:shadow-xl transition-all">
          <div className="absolute inset-0 bg-gradient-to-br from-pink-500/5 to-transparent"></div>
          <CardHeader className="relative">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-pink-500 to-purple-500 shadow-md">
                <Users className="h-5 w-5 text-white" />
              </div>
              <CardTitle className="text-xl">How It Works</CardTitle>
            </div>
            <CardDescription>
              AI-powered resume matching in 3 simple steps
            </CardDescription>
          </CardHeader>
          <CardContent className="relative space-y-4">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 text-white text-sm font-bold shadow-md flex-shrink-0">
                1
              </div>
              <div>
                <h3 className="font-semibold mb-1 text-slate-900">Upload Job Description</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Upload your JD in PDF, DOCX, or TXT format. Our AI will extract required skills and qualifications.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 text-white text-sm font-bold shadow-md flex-shrink-0">
                2
              </div>
              <div>
                <h3 className="font-semibold mb-1 text-slate-900">Upload Candidate Resumes</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Upload multiple resumes at once. Supports PDF, DOCX, and even scanned documents with OCR.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 text-white text-sm font-bold shadow-md flex-shrink-0">
                3
              </div>
              <div>
                <h3 className="font-semibold mb-1 text-slate-900">Get Ranked Results</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  View candidates ranked by match score with detailed skill analysis and recommendations.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200">
              <Button
                variant="outline"
                className="w-full border-purple-200 text-purple-700 hover:bg-purple-50 hover:border-purple-300 transition-all"
                onClick={() => router.push('/dashboard/resume-matching/jobs')}
              >
                <Briefcase className="mr-2 h-4 w-4" />
                View Existing Jobs
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
