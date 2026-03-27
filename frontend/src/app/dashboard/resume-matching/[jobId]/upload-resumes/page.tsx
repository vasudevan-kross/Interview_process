'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileUpload } from '@/components/ui/file-upload'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { apiClient } from '@/lib/api/client'
import { toast } from 'sonner'
import { Loader2, Upload, CheckCircle2, XCircle } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { ImportCandidatesTab } from '@/components/pipeline/ImportCandidatesTab'
import { CreditCostBanner } from '@/components/credits/CreditCostBanner'
import { useQuery } from '@tanstack/react-query'
import { getCreditBalance, calculateResumeCost, isInsufficientCreditsError, getInsufficientCreditsDetails } from '@/lib/api/credits'

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
  const [currentIndex, setCurrentIndex] = useState(0)

  // Fetch credit balance
  const { data: balance } = useQuery({
    queryKey: ['credit-balance'],
    queryFn: getCreditBalance,
  })

  // Calculate cost for selected resumes
  const costInfo = resumeFiles.length > 0 ? calculateResumeCost(resumeFiles.length) : null

  const handleUpload = async () => {
    if (resumeFiles.length === 0) {
      toast.error('Please select at least one resume')
      return
    }

    setLoading(true)
    setCurrentIndex(0)

    // Initialize all as pending
    const initial: UploadResult[] = resumeFiles.map((file) => ({
      filename: file.name,
      status: 'pending',
    }))
    setUploadResults(initial)

    let processed = 0
    let failed = 0

    for (let i = 0; i < resumeFiles.length; i++) {
      const file = resumeFiles[i]
      setCurrentIndex(i)

      // Mark current file as uploading
      setUploadResults((prev) => {
        const next = [...prev]
        next[i] = { ...next[i], status: 'uploading' }
        return next
      })

      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('job_id', jobId)

        const res = await apiClient.uploadResume(formData)

        setUploadResults((prev) => {
          const next = [...prev]
          next[i] = {
            filename: file.name,
            status: 'success',
            resume_id: res.resume_id,
            candidate_name: res.candidate_name,
            match_score: res.match_score,
          }
          return next
        })
        processed++
      } catch (err: any) {
        // Check for insufficient credits error
        if (isInsufficientCreditsError(err)) {
          const details = getInsufficientCreditsDetails(err)
          toast.error(`Insufficient Credits: Need ${details?.required}, available ${details?.available}`)
          setLoading(false)
          return // Stop processing
        }

        const message = err.response?.data?.detail || 'Processing failed'
        setUploadResults((prev) => {
          const next = [...prev]
          next[i] = { filename: file.name, status: 'error', error: message }
          return next
        })
        failed++
      }
    }

    setCurrentIndex(resumeFiles.length)
    setLoading(false)

    if (failed === 0) {
      toast.success(`All ${processed} resume${processed !== 1 ? 's' : ''} processed successfully`)
    } else {
      toast.success(`${processed} processed, ${failed} failed`)
    }

    setTimeout(() => {
      router.push(`/dashboard/resume-matching/${jobId}/candidates`)
    }, 2000)
  }

  const doneCount = uploadResults.filter((r) => r.status === 'success' || r.status === 'error').length
  const progressPct = resumeFiles.length > 0 ? Math.round((doneCount / resumeFiles.length) * 100) : 0

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Add Candidates"
        description="Upload candidate resumes or import candidate lists directly to the pipeline."
        backHref="/dashboard/resume-matching/jobs"
      />

      {/* Credit Cost Banner */}
      {costInfo && balance && (
        <CreditCostBanner
          featureName="Resume Processing"
          cost={costInfo.total}
          currentBalance={balance.balance}
          breakdown={[costInfo.breakdown]}
          message="Each resume will be analyzed by AI to extract candidate information and calculate job match scores."
        />
      )}

      <Tabs defaultValue="upload-resumes" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-slate-100">
          <TabsTrigger value="upload-resumes">Upload Resumes</TabsTrigger>
          <TabsTrigger value="import-candidates">Import Candidates</TabsTrigger>
        </TabsList>

        <TabsContent value="upload-resumes" className="space-y-6 mt-6">
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
            Upload multiple resumes in PDF, DOCX, or TXT format. Our AI will extract information and calculate match scores automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <FileUpload
            onFilesSelected={setResumeFiles}
            maxFiles={50}
            multiple={true}
            disabled={loading}
          />

          {resumeFiles.length > 0 && !loading && uploadResults.length === 0 && (
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
              <p className="text-sm font-medium text-slate-900 mb-1">
                {resumeFiles.length} file{resumeFiles.length !== 1 ? 's' : ''} selected
              </p>
              <p className="text-xs text-slate-500">
                Ready to process and match against job requirements
              </p>
            </div>
          )}

          {resumeFiles.length > 0 && uploadResults.length === 0 && (
            <Button
              onClick={handleUpload}
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload & Process {resumeFiles.length} Resume{resumeFiles.length !== 1 ? 's' : ''}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Progress Card — visible while processing */}
      {loading && (
        <Card className="border border-slate-200 bg-white">
          <CardHeader>
            <div className="flex items-center gap-3 mb-1">
              <Loader2 className="h-5 w-5 text-indigo-500 animate-spin" />
              <CardTitle className="text-xl text-slate-900">Processing Resumes</CardTitle>
            </div>
            <CardDescription className="text-base">
              Processing file {Math.min(currentIndex + 1, resumeFiles.length)} of {resumeFiles.length} —&nbsp;
              <span className="font-medium text-slate-700 truncate">
                {resumeFiles[currentIndex]?.name}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="relative h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 text-right">{doneCount} / {resumeFiles.length} done</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results list — grows in real-time as files complete */}
      {uploadResults.some((r) => r.status === 'success' || r.status === 'error') && (
        <Card className="border border-slate-200 bg-white">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <CardTitle className="text-xl text-slate-900">Results</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {uploadResults.map((result, index) => {
                if (result.status === 'pending' || result.status === 'uploading') return null
                return (
                  <div
                    key={index}
                    className={`flex items-center justify-between p-4 rounded-lg border ${
                      result.status === 'success'
                        ? 'bg-green-50 border-green-200'
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex-shrink-0">
                        {result.status === 'success' ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-600" />
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
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
        </TabsContent>

        <TabsContent value="import-candidates" className="mt-6">
          <ImportCandidatesTab
            jobId={jobId}
            onImportComplete={() => {
              toast.success('Candidates imported! Redirecting to pipeline...')
              setTimeout(() => {
                router.push(`/dashboard/pipeline?job=${jobId}`)
              }, 1500)
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
