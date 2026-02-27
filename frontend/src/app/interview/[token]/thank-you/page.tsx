'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, Upload, Loader2, FileText } from 'lucide-react'
import { joinInterview, type Interview } from '@/lib/api/coding-interviews'
import { toast } from 'sonner'

export default function ThankYouPage() {
  const params = useParams()
  const accessToken = params.token as string

  const [interview, setInterview] = useState<Interview | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [resumeUploaded, setResumeUploaded] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  useEffect(() => {
    fetchInterview()
  }, [accessToken])

  const fetchInterview = async () => {
    try {
      setLoading(true)
      const data = await joinInterview(accessToken)
      setInterview(data)

      // If resume is disabled, skip upload screen
      if (data.resume_required === 'disabled') {
        setResumeUploaded(true)
      }
    } catch (error: any) {
      console.error('Failed to load interview:', error)
      toast.error('Failed to load interview details')
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file type
      const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
      if (!validTypes.includes(file.type)) {
        toast.error('Please upload a PDF or DOCX file')
        return
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size must be less than 5MB')
        return
      }

      setSelectedFile(file)
    }
  }

  const handleUploadResume = async () => {
    if (!selectedFile) {
      toast.error('Please select a file first')
      return
    }

    try {
      setUploading(true)

      // TODO: Implement resume upload API call
      // For now, just simulate upload
      await new Promise((resolve) => setTimeout(resolve, 2000))

      setResumeUploaded(true)
      toast.success('Resume uploaded successfully!')
    } catch (error) {
      toast.error('Failed to upload resume. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const handleSkip = () => {
    if (interview?.resume_required === 'mandatory') {
      toast.error('Resume upload is mandatory for this interview')
      return
    }
    setResumeUploaded(true)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    )
  }

  const isMandatory = interview?.resume_required === 'mandatory'
  const isOptional = interview?.resume_required === 'optional'
  const isDisabled = interview?.resume_required === 'disabled'

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
      <Card className="max-w-2xl w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="h-10 w-10 text-white" />
          </div>
          <CardTitle className="text-3xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Interview Submitted Successfully!
          </CardTitle>
          <CardDescription className="text-lg mt-2">
            Thank you for taking the time to complete this interview
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!resumeUploaded && !isDisabled ? (
            <>
              <div className={`p-6 border rounded-lg ${
                isMandatory
                  ? 'bg-orange-50 border-orange-200'
                  : 'bg-blue-50 border-blue-200'
              }`}>
                <h3 className={`font-semibold mb-2 ${
                  isMandatory ? 'text-orange-900' : 'text-blue-900'
                }`}>
                  {isMandatory ? 'Resume Upload Required!' : 'One More Step!'}
                </h3>
                <p className={`text-sm ${
                  isMandatory ? 'text-orange-800' : 'text-blue-800'
                }`}>
                  {isMandatory
                    ? 'You must upload your resume to complete this interview application.'
                    : 'Upload your resume to complete your application and increase your chances of being considered for the role.'
                  }
                </p>
              </div>

              <div className="space-y-4">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-indigo-500 transition-colors">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="resume-upload"
                  />
                  <label
                    htmlFor="resume-upload"
                    className="cursor-pointer flex flex-col items-center"
                  >
                    {selectedFile ? (
                      <>
                        <FileText className="h-12 w-12 text-indigo-600 mb-3" />
                        <p className="font-medium text-gray-900">{selectedFile.name}</p>
                        <p className="text-sm text-gray-600 mt-1">
                          {(selectedFile.size / 1024).toFixed(2)} KB
                        </p>
                        <Button variant="outline" className="mt-4" type="button">
                          Change File
                        </Button>
                      </>
                    ) : (
                      <>
                        <Upload className="h-12 w-12 text-gray-400 mb-3" />
                        <p className="font-medium text-gray-900">Click to upload resume</p>
                        <p className="text-sm text-gray-600 mt-1">PDF or DOCX, max 5MB</p>
                      </>
                    )}
                  </label>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={handleUploadResume}
                    disabled={!selectedFile || uploading}
                    className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Upload Resume
                      </>
                    )}
                  </Button>
                  {isOptional && (
                    <Button
                      variant="outline"
                      onClick={handleSkip}
                      className="flex-1"
                    >
                      Skip for Now
                    </Button>
                  )}
                </div>

                {isMandatory && (
                  <p className="text-center text-sm text-gray-600">
                    Resume upload is required to complete your application
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="p-6 bg-green-50 border border-green-200 rounded-lg text-center">
                <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-3" />
                <h3 className="font-semibold text-green-900 mb-2">Application Complete!</h3>
                <p className="text-green-800 text-sm">
                  {resumeUploaded && !isDisabled
                    ? "Your interview submission and resume have been received. We'll review your application and get back to you soon."
                    : "Your interview submission has been received. We'll review your answers and get back to you soon."
                  }
                </p>
              </div>

              <div className="text-center space-y-2">
                <p className="text-gray-600 text-sm">
                  You can now close this tab. We'll contact you at the email address you provided.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
