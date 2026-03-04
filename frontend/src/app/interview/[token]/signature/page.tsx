'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { FileText, PenTool, CheckCircle, Loader2, AlertCircle, Trash2 } from 'lucide-react'
import { joinInterview, submitInterview, type Interview } from '@/lib/api/coding-interviews'
import { toast } from 'sonner'

// Dynamically import SignatureCanvas to avoid SSR issues
const SignatureCanvas = dynamic(() => import('react-signature-canvas'), { ssr: false })

export default function SignaturePage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const accessToken = params.token as string
  const submissionId = searchParams.get('submission_id') || ''

  const signatureRef = useRef<any>(null)
  const [hasSignature, setHasSignature] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [interview, setInterview] = useState<Interview | null>(null)

  // Load interview details
  useEffect(() => {
    loadInterview()
  }, [accessToken])

  const loadInterview = async () => {
    try {
      setLoading(true)
      const data = await joinInterview(accessToken)
      setInterview(data)
    } catch (error: any) {
      toast.error(error.message || 'Failed to load interview details')
    } finally {
      setLoading(false)
    }
  }

  const handleSignatureEnd = () => {
    if (signatureRef.current && !signatureRef.current.isEmpty()) {
      setHasSignature(true)
    }
  }

  const clearSignature = () => {
    if (signatureRef.current) {
      signatureRef.current.clear()
      setHasSignature(false)
    }
  }

  const handleSubmit = async () => {
    if (!signatureRef.current || signatureRef.current.isEmpty()) {
      toast.error('Please provide your signature')
      return
    }

    if (!termsAccepted) {
      toast.error('Please accept the terms and conditions')
      return
    }

    try {
      setSubmitting(true)

      // Get signature as base64
      const signatureData = signatureRef.current.toDataURL('image/png')

      // Submit interview with signature
      await submitInterview(submissionId, {
        signature_data: signatureData,
        terms_accepted: true,
      })

      toast.success('Signature submitted successfully!')
      router.push(`/interview/${accessToken}/thank-you`)
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit signature')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    )
  }

  if (!interview) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            <CardTitle className="text-center text-red-600">Interview Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-gray-600">
              The interview link is invalid or has expired.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50">
      <Card className="max-w-4xl w-full">
        <CardHeader>
          <div className="mx-auto w-16 h-16 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full flex items-center justify-center mb-4">
            <FileText className="h-10 w-10 text-white" />
          </div>
          <CardTitle className="text-3xl text-center bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
            Bond Agreement & Terms
          </CardTitle>
          <CardDescription className="text-center text-lg mt-2">
            Please review and accept the terms before completing your submission
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Terms and Conditions */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-amber-600" />
              <h3 className="font-semibold text-lg">Terms and Conditions</h3>
            </div>

            <div className="p-6 bg-white border-2 border-amber-200 rounded-lg max-h-96 overflow-y-auto">
              <div className="prose prose-sm max-w-none">
                {interview.bond_terms ? (
                  <div className="whitespace-pre-wrap text-gray-700">
                    {interview.bond_terms}
                  </div>
                ) : (
                  <div className="text-gray-700 space-y-4">
                    <p><strong>Service Bond Agreement</strong></p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>Service bond: {interview.bond_years || 2} years from joining date</li>
                      <li>Original certificates will be collected and returned after bond completion</li>
                      <li>Early exit penalty as per company policy</li>
                      <li>Non-compete clause for 6 months after exit</li>
                    </ul>
                    <p className="text-sm text-gray-600 mt-4">
                      By signing this document, you agree to abide by all the terms and conditions mentioned above.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {interview.bond_document_url && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <FileText className="h-4 w-4 text-blue-600" />
                <a
                  href={interview.bond_document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  View detailed bond document
                </a>
              </div>
            )}
          </div>

          {/* Digital Signature */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PenTool className="h-5 w-5 text-amber-600" />
                <h3 className="font-semibold text-lg">Digital Signature</h3>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={clearSignature}
                disabled={!hasSignature || submitting}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>

            <div className="border-2 border-dashed border-amber-300 rounded-lg bg-white overflow-hidden">
              <SignatureCanvas
                ref={signatureRef}
                onEnd={handleSignatureEnd}
                canvasProps={{
                  className: 'w-full h-48 cursor-crosshair',
                  style: { touchAction: 'none' }
                }}
                backgroundColor="rgb(255, 255, 255)"
                penColor="rgb(0, 0, 0)"
                minWidth={1}
                maxWidth={3}
                dotSize={2}
                throttle={16}
                velocityFilterWeight={0.7}
              />
            </div>
            <p className="text-xs text-gray-500 text-center">
              Sign above using your mouse or touch screen
            </p>
          </div>

          {/* Acceptance Checkbox */}
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <Checkbox
              id="terms"
              checked={termsAccepted}
              onCheckedChange={(checked) => setTermsAccepted(checked as boolean)}
              disabled={submitting}
            />
            <Label htmlFor="terms" className="cursor-pointer text-sm leading-relaxed">
              I have read and accept the above terms and conditions. I understand that this is a legally
              binding agreement and I agree to comply with all the terms mentioned.
            </Label>
          </div>

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={!hasSignature || !termsAccepted || submitting}
            className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-lg"
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <CheckCircle className="h-5 w-5 mr-2" />
                Accept & Complete Submission
              </>
            )}
          </Button>

          <p className="text-xs text-center text-gray-500">
            By clicking &quot;Accept & Complete Submission&quot;, you confirm that you have provided your
            genuine signature and accepted all terms and conditions.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
