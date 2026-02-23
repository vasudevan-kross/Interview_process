'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileUpload } from '@/components/ui/file-upload'
import { Progress } from '@/components/ui/progress'
import { apiClient } from '@/lib/api/client'
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
      const formData = new FormData()
      resumeFiles.forEach((file) => {
        formData.append('files', file)
      })
      formData.append('job_id', jobId)
      formData.append('user_id', 'temp-user-id') // TODO: Get from auth

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
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Upload Candidate Resumes</h1>
        <p className="text-muted-foreground">
          Upload multiple resumes to match against the job description
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Resume Files</CardTitle>
          <CardDescription>
            Upload multiple resumes in PDF, DOCX, TXT, or image formats. Our AI will extract information and calculate match scores.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <FileUpload
            onFilesSelected={setResumeFiles}
            maxFiles={50}
            multiple={true}
            disabled={loading}
          />

          {resumeFiles.length > 0 && (
            <div className="flex gap-4">
              <Button onClick={handleUpload} disabled={loading} className="flex-1">
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

      {loading && (
        <Card>
          <CardHeader>
            <CardTitle>Processing Resumes</CardTitle>
            <CardDescription>
              Extracting information and calculating match scores...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={progress} className="mb-4" />
            <p className="text-sm text-center text-muted-foreground">
              This may take a few moments depending on the number of resumes
            </p>
          </CardContent>
        </Card>
      )}

      {uploadResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Results</CardTitle>
            <CardDescription>
              Status of each resume upload and processing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {uploadResults.map((result, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <div className="flex items-center gap-3 flex-1">
                    {result.status === 'success' && (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    )}
                    {result.status === 'error' && (
                      <XCircle className="h-5 w-5 text-red-600" />
                    )}
                    {result.status === 'pending' && (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium">{result.filename}</p>
                      {result.status === 'success' && result.match_score !== undefined && (
                        <p className="text-xs text-muted-foreground">
                          Match Score: {result.match_score.toFixed(1)}% | {result.candidate_name || 'Unknown'}
                        </p>
                      )}
                      {result.status === 'error' && (
                        <p className="text-xs text-red-600">{result.error}</p>
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
