'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { FileText, PenTool, CheckCircle, Loader2, AlertCircle, Trash2, ChevronRight, ChevronLeft, Clock, Code, Send } from 'lucide-react'
import { joinInterview, submitInterview, type Interview } from '@/lib/api/coding-interviews'
import { toast } from 'sonner'
import { format } from 'date-fns'

// Dynamically import SignatureCanvas to avoid SSR issues
const SignatureCanvas = dynamic(() => import('react-signature-canvas'), { ssr: false }) as any

export default function SignaturePage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const accessToken = params.token as string
  const submissionId = searchParams.get('submission_id') || ''

  const signatureRef = useRef<any>(null)
  const sigContainerRef = useRef<HTMLDivElement>(null)
  const [sigWidth, setSigWidth] = useState(600)
  const [hasSignature, setHasSignature] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [interview, setInterview] = useState<Interview | null>(null)

  // Measure signature container so canvas pixel width matches displayed width
  useEffect(() => {
    const container = sigContainerRef.current
    if (!container || loading) return

    const measure = () => {
      // clientWidth includes padding, we want the inner width
      const width = container.clientWidth
      // p-2 is 8px each side = 16px. Ensure at least some width.
      setSigWidth(Math.max(width - 16, 280))
    }

    // Initial measure
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [loading])

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

  useEffect(() => {
    if (accessToken) {
      loadInterview()
    }
  }, [accessToken])

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
      toast.error('Please accept the terms to proceed')
      return
    }

    try {
      setSubmitting(true)
      const signatureData = signatureRef.current.toDataURL('image/png')
      await submitInterview(submissionId, {
        signature_data: signatureData,
        terms_accepted: true,
      })
      toast.success('Submitted successfully!')
      router.push(`/interview/${accessToken}/thank-you`)
    } catch (error: any) {
      toast.error(error.message || 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] flex flex-col items-center justify-center font-sans">
        <Loader2 className="h-10 w-10 animate-spin text-[#FF3D00] mb-4" />
        <p className="text-gray-500 text-sm animate-pulse">Loading...</p>
      </div>
    )
  }

  if (!interview) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#141416] border border-white/5 p-8 text-center space-y-6 rounded-3xl">
          <div className="mx-auto w-12 h-12 bg-red-500/10 flex items-center justify-center rounded-2xl">
            <AlertCircle className="h-6 w-6 text-red-500" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-white">Access Denied</h1>
            <p className="text-gray-500 text-sm">
              This link is invalid or has expired.
            </p>
          </div>
          <Button
            onClick={() => router.push('/')}
            variant="outline"
            className="w-full border-white/10 text-white hover:bg-white/5 rounded-xl h-10"
          >
            Go Back
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white font-sans flex flex-col items-center justify-center p-4 py-12 relative overflow-hidden">
      {/* Subtle Background Decoration */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(20,20,25,1)_0%,rgba(10,10,11,1)_100%)] z-0" />
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#FF3D00]/5 blur-[120px] rounded-full z-0" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#00E5FF]/5 blur-[120px] rounded-full z-0" />

      <div className="max-w-3xl w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 relative z-10">
        {/* Header Section */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/5 border border-white/10 rounded-2xl mb-2 backdrop-blur-sm">
            <PenTool className="h-8 w-8 text-[#FF3D00]" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">Final Step</h1>
          <p className="text-gray-400 text-sm max-w-md mx-auto">
            Please sign below to confirm your interview submission.
          </p>
        </div>

        <Card className="bg-[#141416]/80 border-white/5 backdrop-blur-xl shadow-2xl rounded-3xl overflow-hidden">
          <CardContent className="p-6 md:p-10 space-y-8">
            {/* Section 1: Terms */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-6 bg-[#FF3D00] rounded-full shadow-[0_0_12px_rgba(255,61,0,0.4)]"></div>
                <h2 className="text-lg font-semibold text-white">Important Notes</h2>
              </div>

              <div className="bg-black/40 border border-white/5 p-6 rounded-2xl max-h-[240px] overflow-y-auto custom-scrollbar text-sm text-gray-400 leading-relaxed font-sans">
                <div className="prose prose-invert prose-sm max-w-none">
                  {interview.bond_terms ? (
                    <div className="whitespace-pre-wrap">
                      {interview.bond_terms}
                    </div>
                  ) : (
                    <ul className="space-y-3 list-disc pl-4">
                      <li>
                        By signing, you confirm that these answers are your own.
                      </li>
                      <li>
                        All information provided in this assessment is accurate to your best knowledge.
                      </li>
                      <li>
                        You agree to the confidentiality of the interview process.
                      </li>
                    </ul>
                  )}
                </div>
              </div>

              {interview.bond_document_url && (
                <a
                  href={interview.bond_document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all group"
                >
                  <FileText className="h-4 w-4 text-gray-400 group-hover:text-[#00E5FF]" />
                  <span className="text-xs font-medium text-gray-400 group-hover:text-white">View Full Terms</span>
                  <ChevronRight className="ml-auto h-4 w-4 text-gray-600 group-hover:text-white transition-transform group-hover:translate-x-1" />
                </a>
              )}
            </div>

            {/* Section 2: Signature */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-6 bg-[#00E5FF] rounded-full shadow-[0_0_12px_rgba(0,229,255,0.4)]"></div>
                  <h2 className="text-lg font-semibold text-white">Your Signature</h2>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-xl px-3 h-8"
                  onClick={clearSignature}
                  disabled={!hasSignature || submitting}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Clear
                </Button>
              </div>

              <div className="group relative">
                <div ref={sigContainerRef} className="bg-white p-2 rounded-2xl overflow-hidden border-2 border-white/5 transition-all group-hover:border-white/10 shadow-inner">
                  <SignatureCanvas
                    ref={signatureRef}
                    onEnd={handleSignatureEnd}
                    canvasProps={{
                      width: sigWidth,
                      height: 180,
                      style: { display: 'block', touchAction: 'none', cursor: 'crosshair' }
                    }}
                    backgroundColor="#FFFFFF"
                    penColor="#000000"
                    minWidth={1.5}
                    maxWidth={4}
                  />
                  {!hasSignature && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-20 transition-opacity group-hover:opacity-30">
                      <PenTool className="h-10 w-10 mb-2 text-black" />
                      <p className="text-xs text-black font-semibold">Sign here</p>
                    </div>
                  )}
                </div>
                <p className="text-[10px] mt-3 text-center text-gray-500 font-medium">Please sign inside the box using your mouse or touch</p>
              </div>
            </div>

            {/* Acceptance */}
            <label className="flex items-start gap-4 p-5 bg-white/5 border border-white/5 rounded-2xl cursor-pointer group hover:bg-white/10 transition-all">
              <Checkbox
                id="terms"
                checked={termsAccepted}
                onCheckedChange={(checked) => setTermsAccepted(checked as boolean)}
                disabled={submitting}
                className="mt-1 border-white/20 data-[state=checked]:bg-[#FF3D00] data-[state=checked]:border-[#FF3D00] rounded-md"
              />
              <span className="text-sm text-gray-400 group-hover:text-gray-300 leading-snug">
                I agree to the terms mentioned above and confirm my submission.
              </span>
            </label>

            {/* Action */}
            <div className="space-y-4">
              <Button
                onClick={handleSubmit}
                disabled={!hasSignature || !termsAccepted || submitting}
                className="w-full h-14 bg-white text-black hover:bg-gray-200 font-bold text-base rounded-2xl transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] active:scale-[0.98]"
              >
                {submitting ? (
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Submitting...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5" />
                    <span>I Agree and Submit</span>
                  </div>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
