'use client'

import React from 'react'

interface AvatarInterviewerProps {
  mouthOpen: number
  speaking: boolean
  label?: string
  subtitle?: string
}

export default function AvatarInterviewer({ mouthOpen, speaking, label, subtitle }: AvatarInterviewerProps) {
  const mouthHeight = Math.max(6, 6 + mouthOpen * 14)
  const mouthWidth = Math.max(28, 28 + mouthOpen * 10)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600/15">
          <div className="h-8 w-8 rounded-full bg-indigo-600/30" />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-900">{label || 'Avatar Interviewer'}</p>
          <p className="text-xs text-slate-500">{subtitle || 'AI-guided interview'}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center rounded-lg bg-slate-50 p-6">
        <div className="relative flex h-36 w-36 items-center justify-center rounded-full bg-gradient-to-br from-slate-100 to-slate-200">
          <div className="absolute left-10 top-12 h-3 w-3 rounded-full bg-slate-700" />
          <div className="absolute right-10 top-12 h-3 w-3 rounded-full bg-slate-700" />
          <div
            className={`absolute bottom-10 rounded-full bg-slate-700 transition-all duration-100 ${
              speaking ? 'opacity-100' : 'opacity-70'
            }`}
            style={{ width: `${mouthWidth}px`, height: `${mouthHeight}px` }}
          />
        </div>
      </div>
    </div>
  )
}
