'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { importCandidatesFile } from '@/lib/api/pipeline'

interface ImportCandidatesTabProps {
  jobId: string
  onImportComplete?: () => void
}

export function ImportCandidatesTab({ jobId, onImportComplete }: ImportCandidatesTabProps) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      // Validate file type
      const validTypes = ['.csv', '.xlsx', '.xls']
      const fileExt = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase()

      if (!validTypes.includes(fileExt)) {
        toast.error('Please upload a CSV or Excel file')
        return
      }

      setFile(selectedFile)
      setResult(null)
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)
    try {
      const importResult = await importCandidatesFile(jobId, file)
      setResult(importResult)
      toast.success(importResult.message)

      // Clear file input
      setFile(null)
      const input = document.getElementById('candidate-file') as HTMLInputElement
      if (input) input.value = ''

      // Callback for parent to refresh data
      if (onImportComplete) {
        onImportComplete()
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to import candidates')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="text-xl text-slate-900">How to Import Candidates</CardTitle>
          <CardDescription className="text-base">
            Upload a CSV or Excel file containing candidate information to add them directly to the pipeline
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-medium">
                1
              </div>
              <p className="text-sm text-slate-700">
                Prepare your CSV or Excel file with candidate information
              </p>
            </div>
            <div className="flex items-start gap-2">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-medium">
                2
              </div>
              <p className="text-sm text-slate-700">
                Required columns: <span className="font-mono text-indigo-600 font-medium">Name</span> and{' '}
                <span className="font-mono text-indigo-600 font-medium">Email</span> (case-insensitive)
              </p>
            </div>
            <div className="flex items-start gap-2">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-medium">
                3
              </div>
              <p className="text-sm text-slate-700">
                Optional column: <span className="font-mono text-indigo-600 font-medium">Phone</span> or{' '}
                <span className="font-mono text-indigo-600 font-medium">Mobile</span>
              </p>
            </div>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs font-medium text-blue-900 mb-2">Supported column name variations:</p>
            <div className="text-xs text-blue-700 space-y-1">
              <p>• <strong>Name:</strong> "Name", "Full Name", "Candidate Name"</p>
              <p>• <strong>Email:</strong> "Email", "Email ID", "E-mail", "Email Address"</p>
              <p>• <strong>Phone:</strong> "Phone", "Mobile", "Phone Number", "Contact"</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* File Upload */}
      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="text-xl text-slate-900">Select File</CardTitle>
          <CardDescription className="text-base">
            Choose a CSV or Excel file to upload
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="candidate-file" className="text-sm font-medium text-slate-700">
              Upload File
            </Label>
            <Input
              id="candidate-file"
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileChange}
              disabled={uploading}
              className="mt-2 bg-white border-slate-300 text-slate-900 file:text-slate-600"
            />
          </div>

          {file && (
            <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <FileSpreadsheet className="h-5 w-5 text-indigo-600" />
              <span className="text-sm text-slate-900 font-medium">{file.name}</span>
              <span className="text-xs text-slate-500 ml-auto">
                {(file.size / 1024).toFixed(1)} KB
              </span>
            </div>
          )}

          <Button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Import Candidates
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <Card className="border border-slate-200 bg-white">
          <CardHeader>
            <CardTitle className="text-xl text-slate-900">Import Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="text-sm font-medium text-green-900">Successfully imported</span>
                </div>
                <span className="text-lg font-semibold text-green-600">{result.created}</span>
              </div>

              {result.skipped > 0 && (
                <div className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                    <span className="text-sm font-medium text-yellow-900">Skipped</span>
                  </div>
                  <span className="text-lg font-semibold text-yellow-600">{result.skipped}</span>
                </div>
              )}

              {result.errors && result.errors.length > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm font-medium text-red-900 mb-2">Errors:</p>
                  <ul className="text-xs text-red-700 space-y-1 max-h-40 overflow-y-auto">
                    {result.errors.map((error: string, idx: number) => (
                      <li key={idx}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
