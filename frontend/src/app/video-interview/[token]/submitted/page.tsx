'use client'

import { useParams } from 'next/navigation'
import { CheckCircle2, Navigation, Mail, Eye } from 'lucide-react'

export default function VideoInterviewSubmittedPage() {
  const params = useParams()
  const token = params?.token as string

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white selection:bg-[#00E5FF]/30 flex items-center justify-center p-6">
      <div className="max-w-xl w-full text-center space-y-10">
        
        <div className="space-y-6">
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-[#00E5FF] blur-2xl opacity-20 animate-pulse rounded-full" />
            <div className="relative h-24 w-24 rounded-3xl bg-gradient-to-tr from-[#00E5FF]/20 to-[#00E5FF]/5 border border-[#00E5FF]/30 flex items-center justify-center mx-auto shadow-[0_0_40px_rgba(0,229,255,0.1)]">
              <CheckCircle2 className="h-10 w-10 text-[#00E5FF]" />
            </div>
          </div>
          
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-widest text-[#00E5FF] font-semibold">Interview Completed</p>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white">
              Thank you for your time.
            </h1>
            <p className="text-base text-gray-400 max-w-sm mx-auto leading-relaxed">
              Your responses have been securely recorded and shared directly with the hiring team.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-8 backdrop-blur-md max-w-md mx-auto relative overflow-hidden text-left">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#00E5FF]/5 blur-3xl" />
          
          <h3 className="text-xs font-bold tracking-widest text-gray-500 uppercase mb-6 flex items-center gap-2">
            <Navigation className="h-4 w-4" />
            What happens next
          </h3>
          
          <ul className="space-y-5">
            <li className="flex items-start gap-4">
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/5 border border-white/10">
                <Eye className="h-4 w-4 text-gray-300" />
              </div>
              <div>
                <p className="text-sm border-b border-transparent font-medium text-gray-200">The team reviews your responses</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">Your recorded technical answers will be evaluated by our engineers.</p>
              </div>
            </li>
            
            <li className="flex items-start gap-4">
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/5 border border-white/10">
                <Mail className="h-4 w-4 text-gray-300" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-200">Keep an eye on your inbox</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">You will be contacted directly regarding next steps in the process.</p>
              </div>
            </li>
          </ul>
        </div>

        <div className="pt-8 flex justify-center">
          <p className="text-xs text-gray-600 uppercase tracking-widest font-medium">
            You may now close this tab
          </p>
        </div>

      </div>
    </div>
  )
}

