'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileUpload } from '@/components/ui/file-upload'
import { apiClient } from '@/lib/api/client'
import { toast } from 'sonner'
import { Loader2, Upload, CheckCircle2, XCircle } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'

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
      const formData = new FormData()
      resumeFiles.forEach((file) => {
        formData.append('files', file)
      })
      formData.append('job_id', jobId)

      const result = await apiClient.uploadMultipleResumes(formData)

      // Update results
      const updatedResults: UploadResult[] = []

      result.results?.forEach((res: any, index: number) => {
        updatedResults.push({
          filename: resumeFiles[index]?.name || res.filename,
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
      <PageHeader
        title="Upload Resumes"
        description="Upload multiple candidate resumes for AI-powered matching and ranking."
        backHref="/dashboard/resume-matching/jobs"
      />

      {/* Upload Card */}
      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Upload className="h-5 w-5 text-slate-400" />
              <CardTitle className="text-xl text-slate-900">Select Resume Files</CardTitle>
            </div>
            <div className="flex gap-3">
              <a href="/samples/resume-matching/sample_resume_john_doe.txt" download className="text-xs text-indigo-600 hover:text-indigo-700 hover:underline">Download Sample 1</a>
              <a href="/samples/resume-matching/sample_resume_jane_smith.txt" download className="text-xs text-indigo-600 hover:text-indigo-700 hover:underline">Download Sample 2</a>
            </div>
          </div>
          <CardDescription className="text-base">
            Upload multiple resumes in PDF, DOCX, TXT, or image formats. Our AI will extract information and calculate match scores automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <FileUpload
            onFilesSelected={setResumeFiles}
            maxFiles={50}
            multiple={true}
            disabled={loading}
          />

          {resumeFiles.length > 0 && !loading && (
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
              <p className="text-sm font-medium text-slate-900 mb-1">
                {resumeFiles.length} file{resumeFiles.length !== 1 ? 's' : ''} selected
              </p>
              <p className="text-xs text-slate-500">
                Ready to process and match against job requirements
              </p>
            </div>
          )}

          {resumeFiles.length > 0 && (
            <div className="flex gap-4">
              <Button
                onClick={handleUpload}
                disabled={loading}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700"
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
              >
                Skip & View Results
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Processing Card */}
      {loading && (
        <Card className="border border-slate-200 bg-white">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className="h-5 w-5 text-slate-500 animate-spin" />
              <CardTitle className="text-xl text-slate-900">Processing Resumes</CardTitle>
            </div>
            <CardDescription className="text-base">
              Extracting information and calculating match scores with AI...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="relative h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-sm text-center text-slate-500">
                This may take a few moments depending on the number of resumes
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Card */}
      {uploadResults.length > 0 && (
        <Card className="border border-slate-200 bg-white">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <CardTitle className="text-xl text-slate-900">Upload Results</CardTitle>
            </div>
            <CardDescription className="text-base">
              Status of each resume upload and processing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {uploadResults.map((result, index) => (
                <div
                  key={index}
                  className={`flex items-center justify-between p-4 rounded-lg border transition-all ${result.status === 'success'
                      ? 'bg-green-50 border-green-200'
                      : result.status === 'error'
                        ? 'bg-red-50 border-red-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="flex-shrink-0">
                      {result.status === 'success' && (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      )}
                      {result.status === 'error' && (
                        <XCircle className="h-5 w-5 text-red-600" />
                      )}
                      {result.status === 'pending' && (
                        <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate text-slate-900">
                        {result.filename}
                      </p>
                      {result.status === 'success' && result.match_score !== undefined && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {(result.match_score || 0).toFixed(1)}% Match
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
