'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  Upload,
  FileText,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download
} from 'lucide-react'
import { testEvaluationApi } from '@/lib/api/test-evaluation'

interface BatchUploadProps {
  testId: string
  onComplete?: () => void
}

interface FileWithPreview extends File {
  preview?: string
  status?: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
  candidateName?: string
}

export function BatchUpload({ testId, onComplete }: BatchUploadProps) {
  const [files, setFiles] = useState<FileWithPreview[]>([])
  const [uploading, setUploading] = useState(false)
  const [batchId, setBatchId] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<any>(null)

  // Extract candidate name from filename
  const extractCandidateName = (filename: string): string => {
    // Remove extension
    const nameWithoutExt = filename.replace(/\.(pdf|png|jpg|jpeg)$/i, '')

    // Replace underscores, hyphens, dots with spaces
    let name = nameWithoutExt.replace(/[_\-\.]/g, ' ')

    // Capitalize each word
    name = name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')

    return name
  }

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map(file => {
      // Log file details for debugging
      console.log('File:', file.name, 'Size:', file.size, 'Type:', file.type)

      const fileWithMetadata = file as FileWithPreview
      fileWithMetadata.preview = URL.createObjectURL(file)
      fileWithMetadata.status = 'pending'
      fileWithMetadata.candidateName = extractCandidateName(file.name)
      return fileWithMetadata
    })
    setFiles(prev => [...prev, ...newFiles])
    toast.success(`${acceptedFiles.length} files added`)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg']
    },
    maxSize: 10485760, // 10MB
    disabled: uploading
  })

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleUpload = async () => {
    if (files.length === 0) {
      toast.error('Please add at least one file')
      return
    }

    if (files.length > 50) {
      toast.error('Maximum 50 files per batch')
      return
    }

    setUploading(true)
    setProgress(0)

    try {
      // Upload batch
      const response = await testEvaluationApi.uploadBatch(testId, files)
      setBatchId(response.batch_id)
      toast.success(`Processing ${response.total_papers} answer sheets...`)

      // Poll for progress
      const pollInterval = setInterval(async () => {
        try {
          const status = await testEvaluationApi.getBatchStatus(response.batch_id)
          setProgress(status.progress_percentage)

          if (status.status === 'completed') {
            clearInterval(pollInterval)
            // Get final results
            const results = await testEvaluationApi.getBatchResults(response.batch_id)
            setResults(results)
            toast.success(
              `Batch complete! ${results.successful}/${results.total_papers} papers evaluated successfully`
            )
            setUploading(false)
            onComplete?.()
          } else if (status.status === 'error') {
            clearInterval(pollInterval)
            toast.error('Batch processing failed')
            setUploading(false)
          }
        } catch (error) {
          console.error('Error polling status:', error)
        }
      }, 2000) // Poll every 2 seconds

      // Cleanup after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval)
        if (uploading) {
          setUploading(false)
          toast.error('Processing timeout - please check results manually')
        }
      }, 300000)

    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to upload batch')
      setUploading(false)
    }
  }

  const handleReset = () => {
    setFiles([])
    setBatchId(null)
    setProgress(0)
    setResults(null)
    setUploading(false)
  }

  const exportResults = () => {
    if (!results) return

    const csv = [
      ['Filename', 'Status', 'Score', 'Percentage', 'Candidate Name'].join(','),
      ...results.results.map((r: any) =>
        [
          r.filename,
          r.status,
          r.score || 'N/A',
          r.percentage ? `${r.percentage.toFixed(1)}%` : 'N/A',
          r.candidate_name || 'N/A'
        ].join(',')
      )
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `batch-results-${batchId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {!results ? (
        <>
          {/* Dropzone */}
          <Card className="border-2 border-dashed border-slate-300 bg-white hover:border-orange-400 transition-colors">
            <CardContent className="pt-6">
              <div
                {...getRootProps()}
                className="cursor-pointer text-center py-12"
              >
                <input {...getInputProps()} />
                <div className="flex flex-col items-center gap-4">
                  <div className="p-4 rounded-full bg-orange-100">
                    <Upload className="h-8 w-8 text-orange-600" />
                  </div>
                  {isDragActive ? (
                    <p className="text-lg font-medium text-orange-600">
                      Drop files here...
                    </p>
                  ) : (
                    <>
                      <div>
                        <p className="text-lg font-semibold text-slate-900 mb-1">
                          Drop answer sheets here or click to browse
                        </p>
                        <p className="text-sm text-slate-600">
                          Supports PDF, PNG, JPG • Max 10MB per file • Up to 50 files
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-orange-300 text-orange-600 hover:bg-orange-50"
                      >
                        Choose Files
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* File List */}
          {files.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Selected Files ({files.length})</CardTitle>
                    <CardDescription>
                      Review your files before processing
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFiles([])}
                    disabled={uploading}
                  >
                    Clear All
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {files.map((file, index) => {
                    const sizeInBytes = file.size || 0
                    let fileSize = '0 KB'
                    if (sizeInBytes >= 1024 * 1024) {
                      fileSize = (sizeInBytes / 1024 / 1024).toFixed(2) + ' MB'
                    } else if (sizeInBytes >= 1024) {
                      fileSize = (sizeInBytes / 1024).toFixed(2) + ' KB'
                    } else if (sizeInBytes > 0) {
                      fileSize = sizeInBytes + ' B'
                    }
                    return (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 rounded-lg border bg-slate-50 hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <FileText className="h-5 w-5 text-orange-600 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-900 truncate">
                              {file.name}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <span>{fileSize}</span>
                              {file.candidateName && (
                                <>
                                  <span>•</span>
                                  <span className="text-orange-600 font-medium">
                                    {file.candidateName}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(index)}
                          disabled={uploading}
                          className="flex-shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Progress */}
          {uploading && (
            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-orange-600" />
                    <div className="flex-1">
                      <p className="font-semibold text-orange-900">
                        Processing batch... {Math.round(progress)}%
                      </p>
                      <p className="text-sm text-orange-700">
                        Evaluating {files.length} answer sheets in parallel
                      </p>
                    </div>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex gap-4">
            <Button
              onClick={handleUpload}
              disabled={files.length === 0 || uploading}
              className="flex-1 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white"
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Process {files.length} {files.length === 1 ? 'Paper' : 'Papers'}
                </>
              )}
            </Button>
          </div>
        </>
      ) : (
        /* Results */
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">Batch Results</CardTitle>
                <CardDescription>
                  Processed {results.total_papers} answer sheets
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportResults}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                >
                  New Batch
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Statistics */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="p-4 rounded-lg bg-slate-50 border">
                <p className="text-sm text-slate-600 mb-1">Total</p>
                <p className="text-2xl font-bold text-slate-900">
                  {results.total_papers}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-green-50 border border-green-200">
                <p className="text-sm text-green-600 mb-1">Successful</p>
                <p className="text-2xl font-bold text-green-700">
                  {results.successful}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm text-red-600 mb-1">Failed</p>
                <p className="text-2xl font-bold text-red-700">
                  {results.failed}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-orange-50 border border-orange-200">
                <p className="text-sm text-orange-600 mb-1">Avg Score</p>
                <p className="text-2xl font-bold text-orange-700">
                  {results.average_score.toFixed(1)}%
                </p>
              </div>
            </div>

            {/* Results List */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {results.results.map((result: any, index: number) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 rounded-lg border bg-white hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    {result.status === 'success' ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-red-600" />
                    )}
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">
                        {result.filename}
                      </p>
                      {result.candidate_name && (
                        <p className="text-sm text-slate-600">
                          {result.candidate_name}
                        </p>
                      )}
                      {result.error && (
                        <p className="text-sm text-red-600">{result.error}</p>
                      )}
                    </div>
                  </div>
                  {result.status === 'success' && (
                    <Badge
                      variant="secondary"
                      className="bg-orange-100 text-orange-700 hover:bg-orange-200"
                    >
                      {result.percentage?.toFixed(1)}% ({result.score})
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
