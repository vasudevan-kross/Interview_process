'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { 
  CheckCircle, 
  Terminal, 
  HardDrive, 
  ShieldCheck, 
  Zap, 
  Database, 
  Lock, 
  Eye, 
  ChevronDown,
  ChevronUp,
  FileCode
} from 'lucide-react'
import { joinInterview, type Interview } from '@/lib/api/coding-interviews'
import { Button } from '@/components/ui/button'

export default function ThankYouPage() {
  const params = useParams()
  const accessToken = params.token as string
  const [interview, setInterview] = useState<Interview | null>(null)
  const [showAnswers, setShowAnswers] = useState(false)
  const [submittedAnswers, setSubmittedAnswers] = useState<Record<string, string>>({})

  useEffect(() => {
    const data = localStorage.getItem(`ci_answers_${accessToken}`)
    if (data) {
      try {
        setSubmittedAnswers(JSON.parse(data))
      } catch (e) {
        console.error("Failed to parse submitted answers", e)
      }
    }
    
    // Load interview for question titles
    joinInterview(accessToken).then(setInterview).catch(console.error)
  }, [accessToken])

  return (
    <div className="min-h-screen bg-[#0A0A0B] cyber-grid text-white font-mono-tech flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Scanline Effect Overlay */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] z-50 bg-[length:100%_2px,3px_100%]"></div>
      
      <div className="max-w-2xl w-full text-center space-y-12 animate-in zoom-in duration-700 relative z-10">
        {/* Header Status */}
        <div className="flex flex-col items-center gap-6">
          <div className="relative inline-flex">
            <div className="absolute inset-0 bg-[#00E5FF] blur-3xl opacity-10"></div>
            <div className="relative inline-flex items-center justify-center w-24 h-24 bg-[#00E5FF]/5 border border-[#00E5FF]/20 rounded-full">
              <CheckCircle className="h-12 w-12 text-[#00E5FF]" />
            </div>
          </div>
          
          <div className="space-y-4">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white">
              Submitted
            </h1>
            <p className="text-gray-400 text-sm font-medium tracking-wide">
              Your submission has been received successfully.
            </p>
          </div>
        </div>

        <Card className="bg-[#141416]/50 border-[#ffffff08] backdrop-blur-xl text-left shadow-2xl">
          <CardContent className="p-8 md:p-12 space-y-10">
            <div className="space-y-10">
              <div className="flex gap-6">
                <div className="w-12 h-12 rounded-xl bg-[#00E5FF]/10 flex items-center justify-center shrink-0 border border-[#00E5FF]/20">
                  <ShieldCheck className="h-6 w-6 text-[#00E5FF]" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-white">Submitted Successfully</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    Your responses have been recorded. <span className="text-[#00E5FF] font-medium">Submissions are final.</span> You cannot view, edit, or recover your responses after transmission has completed.
                  </p>
                </div>
              </div>

              <div className="flex gap-6">
                <div className="w-12 h-12 rounded-xl bg-[#FF3D00]/10 flex items-center justify-center shrink-0 border border-[#FF3D00]/20">
                  <Zap className="h-6 w-6 text-[#FF3D00]" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-white">Evaluation Pending</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    Once evaluated, we will let you know the results via your registered email or phone number.
                  </p>
                </div>
              </div>
            </div>


          </CardContent>
        </Card>


      </div>

      {/* Decorative scanline bars */}
      <div className="absolute top-0 left-0 w-full h-[1px] bg-[#00E5FF]/20 animate-scanline"></div>
    </div>
  )
}
