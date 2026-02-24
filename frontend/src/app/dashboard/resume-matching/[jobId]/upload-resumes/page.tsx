'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileUpload } from '@/components/ui/file-upload'
import { apiClient } from '@/lib/api/client'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Loader2, Upload, CheckCircle2, XCircle } from 'lucide-react'

interface UploadResult {
  filename: string
  status: 'pending' | 'uploading' | 'success' | 'error'
  resume_id?: string
  candidate_name?: string
  match_score?: number
  error?: string
}

export default function UploadResumesPage() {
  const router = useRouter()
  const params = useParams()
  const jobId = params.jobId as string

  const [loading, setLoading] = useState(false)
  const [resumeFiles, setResumeFiles] = useState<File[]>([])
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([])
  const [progress, setProgress] = useState(0)

  const handleUpload = async () => {
    if (resumeFiles.length === 0) {
      toast.error('Please select at least one resume')
      return
    }

    setLoading(true)
    setProgress(0)

    // Initialize results
    const results: UploadResult[] = resumeFiles.map((file) => ({
      filename: file.name,
      status: 'pending',
    }))
    setUploadResults(results)

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
      resumeFiles.forEach((file) => {
        formData.append('files', file)
      })
      formData.append('job_id', jobId)
      formData.append('user_id', userId)

      // For batch upload
      const result = await apiClient.uploadMultipleResumes(formData)

      // Update results
      const updatedResults: UploadResult[] = []

      result.results?.forEach((res: any, index: number) => {
        updatedResults.push({
          filename: resumeFiles[index].name,
          status: 'success',
          resume_id: res.resume_id,
          candidate_name: res.candidate_name,
          match_score: res.match_score,
        })
      })

      result.failed?.forEach((fail: any) => {
        updatedResults.push({
          filename: fail.filename,
          status: 'error',
          error: fail.error,
        })
      })

      setUploadResults(updatedResults)
      setProgress(100)

      toast.success(
        `Successfully processed ${result.total_processed} out of ${resumeFiles.length} resumes`
      )

      // Navigate to results after a short delay
      setTimeout(() => {
        router.push(`/dashboard/resume-matching/${jobId}/candidates`)
      }, 2000)
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to upload resumes')
      setUploadResults(
        resumeFiles.map((file) => ({
          filename: file.name,
          status: 'error',
          error: 'Upload failed',
        }))
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Gradient Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-500/90 to-pink-600 p-8 text-white shadow-xl">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <Upload className="h-6 w-6" />
            <span className="text-sm font-medium opacity-90">Candidate Upload</span>
          </div>
          <h1 className="text-4xl font-bold mb-2">Upload Resumes</h1>
          <p className="text-lg opacity-90">
            Upload multiple candidate resumes for AI-powered matching and ranking
          </p>
        </div>
      </div>

      {/* Upload Card */}
      <Card className="border-0 shadow-lg overflow-hidden relative group hover:shadow-xl transition-all">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent"></div>
        <CardHeader className="relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 shadow-md">
              <Upload className="h-5 w-5 text-white" />
            </div>
            <CardTitle className="text-xl">Select Resume Files</CardTitle>
          </div>
          <CardDescription className="text-base">
            Upload multiple resumes in PDF, DOCX, TXT, or image formats. Our AI will extract information and calculate match scores automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="relative space-y-6">
          <FileUpload
            onFilesSelected={setResumeFiles}
            maxFiles={50}
            multiple={true}
            disabled={loading}
          />

          {resumeFiles.length > 0 && !loading && (
            <div className="p-4 rounded-lg bg-purple-50 border border-purple-100">
              <p className="text-sm font-medium text-purple-900 mb-1">
                {resumeFiles.length} file{resumeFiles.length !== 1 ? 's' : ''} selected
              </p>
              <p className="text-xs text-purple-700">
                Ready to process and match against job requirements
              </p>
            </div>
          )}

          {resumeFiles.length > 0 && (
            <div className="flex gap-4">
              <Button
                onClick={handleUpload}
                disabled={loading}
                className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-md hover:shadow-lg transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing {resumeFiles.length} resumes...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload & Process {resumeFiles.length} Resume{resumeFiles.length !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push(`/dashboard/resume-matching/${jobId}/candidates`)}
                disabled={loading}
                className="border-purple-200 text-purple-700 hover:bg-purple-50 hover:border-purple-300"
              >
                Skip & View Results
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Processing Card */}
      {loading && (
        <Card className="border-0 shadow-lg overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-pink-500/5"></div>
          <CardHeader className="relative">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 shadow-md animate-pulse">
                <Loader2 className="h-5 w-5 text-white animate-spin" />
              </div>
              <CardTitle className="text-xl">Processing Resumes</CardTitle>
            </div>
            <CardDescription className="text-base">
              Extracting information and calculating match scores with AI...
            </CardDescription>
          </CardHeader>
          <CardContent className="relative">
            <div className="space-y-4">
              <div className="relative h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-sm text-center text-muted-foreground">
                This may take a few moments depending on the number of resumes
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Card */}
      {uploadResults.length > 0 && (
        <Card className="border-0 shadow-lg overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent"></div>
          <CardHeader className="relative">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 shadow-md">
                <CheckCircle2 className="h-5 w-5 text-white" />
              </div>
              <CardTitle className="text-xl">Upload Results</CardTitle>
            </div>
            <CardDescription className="text-base">
              Status of each resume upload and processing
            </CardDescription>
          </CardHeader>
          <CardContent className="relative">
            <div className="space-y-2">
              {uploadResults.map((result, index) => (
                <div
                  key={index}
                  className={`flex items-center justify-between p-4 rounded-lg border transition-all ${
                    result.status === 'success'
                      ? 'bg-green-50 border-green-200 hover:border-green-300'
                      : result.status === 'error'
                      ? 'bg-red-50 border-red-200 hover:border-red-300'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="flex-shrink-0">
                      {result.status === 'success' && (
                        <div className="p-1.5 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500">
                          <CheckCircle2 className="h-4 w-4 text-white" />
                        </div>
                      )}
                      {result.status === 'error' && (
                        <div className="p-1.5 rounded-lg bg-gradient-to-br from-red-500 to-pink-500">
                          <XCircle className="h-4 w-4 text-white" />
                        </div>
                      )}
                      {result.status === 'pending' && (
                        <Loader2 className="h-5 w-5 animate-spin text-purple-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate text-slate-900">
                        {result.filename}
                      </p>
                      {result.status === 'success' && result.match_score !== undefined && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r from-purple-500 to-pink-500 text-white">
                            {result.match_score.toFixed(1)}% Match
                          </span>
                          <span className="text-xs text-slate-600">
                            {result.candidate_name || 'Unknown Candidate'}
                          </span>
                        </div>
                      )}
                      {result.status === 'error' && (
                        <p className="text-xs text-red-600 mt-1">{result.error}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
