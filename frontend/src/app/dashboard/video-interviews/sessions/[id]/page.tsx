'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { SkeletonPageHeader, SkeletonTable } from '@/components/ui/skeleton'
import { getVideoSession, type VideoInterviewSession } from '@/lib/api/video-interviews'
import { toast } from 'sonner'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ChevronLeft, PlayCircle, FileText, BrainCircuit, Clock, CheckCircle2, UserCircle2 } from 'lucide-react'

export default function VideoInterviewSessionPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = params?.id as string
  const [session, setSession] = useState<VideoInterviewSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (sessionId) fetchSession()
  }, [sessionId])

  const fetchSession = async () => {
    try {
      setLoading(true)
      const data = await getVideoSession(sessionId)
      setSession(data)
    } catch {
      toast.error('Failed to load session')
    } finally {
      setLoading(false)
    }
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '—'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-[1400px] mx-auto pb-12">
        <SkeletonPageHeader />
        <SkeletonTable />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] rounded-2xl border border-dashed border-slate-300 bg-slate-50/50">
        <UserCircle2 className="h-10 w-10 text-slate-400 mb-4" />
        <h3 className="text-sm font-semibold text-slate-900">Session not found</h3>
        <p className="mt-1 text-sm text-slate-500">The session you are looking for does not exist or has been removed.</p>
        <Button onClick={() => router.back()} variant="outline" className="mt-6">
          Go Back
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-slate-200 pb-6">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-full" onClick={() => router.back()}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {session.candidate?.first_name} {session.candidate?.last_name}
            </h1>
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              session.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {session.status === 'completed' && <CheckCircle2 className="h-3 w-3" />}
              {session.status === 'completed' ? 'Completed' : 'In Progress'}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">Video interview submission review.</p>
        </div>
        <div className="flex items-center gap-6 px-6 py-2 bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Duration</span>
            <span className="text-sm font-semibold text-slate-900 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-indigo-500"/> {formatDuration(session.duration_seconds)}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr] items-start">
        
        {/* Left Pane: Video & Summary */}
        <div className="space-y-6">
          {/* Video Player Card */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
            <div className="bg-slate-50/50 border-b border-slate-100 px-6 py-4 flex items-center gap-2">
              <PlayCircle className="h-4 w-4 text-indigo-500" />
              <h2 className="text-sm font-semibold text-slate-900">Session Recording</h2>
            </div>
            <div className="p-6 bg-slate-50 flex-1 flex flex-col items-center justify-center">
              {session.signed_recording_url ? (
                <div className="w-full max-w-4xl mx-auto overflow-hidden rounded-xl border border-slate-200 shadow-sm bg-black group relative">
                  <div className="aspect-video w-full">
                    <video controls className="h-full w-full object-contain bg-black">
                      <source src={session.signed_recording_url} />
                    </video>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                    <PlayCircle className="h-6 w-6 text-slate-300" />
                  </div>
                  <p className="text-sm font-medium text-slate-900">No recording available</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-[250px]">The video file might still be processing, or the session was incomplete.</p>
                </div>
              )}
            </div>
          </div>

          {/* AI Summary Card */}
          {(() => {
            let summary: Record<string, any> | null = null
            if (session.interview_summary) {
              try {
                summary = typeof session.interview_summary === 'string'
                  ? JSON.parse(session.interview_summary)
                  : session.interview_summary as Record<string, any>
              } catch { summary = null }
            }
            const scoreColor = summary?.overall_score >= 75 ? 'text-emerald-600' : summary?.overall_score >= 50 ? 'text-amber-600' : 'text-red-500'
            const recColor = summary?.recommendation === 'Strong recommend' ? 'bg-emerald-100 text-emerald-700' : summary?.recommendation === 'Recommend' ? 'bg-blue-100 text-blue-700' : summary?.recommendation === 'Consider' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
            return (
              <div className="rounded-2xl border border-indigo-100 bg-gradient-to-b from-indigo-50/50 to-white shadow-sm overflow-hidden relative">
                <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
                  <BrainCircuit className="h-32 w-32" />
                </div>
                <div className="border-b border-indigo-100/50 px-6 py-4 flex items-center gap-2">
                  <BrainCircuit className="h-4 w-4 text-indigo-600" />
                  <h2 className="text-sm font-semibold text-slate-900">AI Analysis & Summary</h2>
                </div>
                <div className="p-6 relative space-y-5">
                  {!summary ? (
                    <p className="text-sm text-slate-500 italic">Analysis is currently unavailable or still processing.</p>
                  ) : (
                    <>
                      {/* Score + recommendation */}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Recommendation</p>
                          <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ${recColor}`}>{summary.recommendation}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Score</p>
                          <span className={`text-3xl font-bold tabular-nums ${scoreColor}`}>{summary.overall_score}<span className="text-lg text-slate-400">/100</span></span>
                        </div>
                      </div>
                      {/* Strengths */}
                      {summary.strengths?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Strengths</p>
                          <ul className="space-y-1">
                            {(summary.strengths as string[]).map((s, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                                <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[10px] font-bold">✓</span>
                                {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {/* Weaknesses */}
                      {summary.weaknesses?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Areas to Improve</p>
                          <ul className="space-y-1">
                            {(summary.weaknesses as string[]).map((w, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                                <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-[10px] font-bold">!</span>
                                {w}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })()}
        </div>

        {/* Right Pane: Transcript */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col h-[calc(100vh-12rem)] min-h-[600px] sticky top-6">
          <div className="bg-slate-50/50 border-b border-slate-100 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-emerald-500" />
              <h2 className="text-sm font-semibold text-slate-900">Interview Transcript</h2>
            </div>
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
              {session.transcript.length} Responses
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-slate-50/30">
            {session.transcript.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <FileText className="h-8 w-8 text-slate-300 mb-3" />
                <p className="text-sm font-medium text-slate-900">No transcript captured</p>
                <p className="text-xs text-slate-500 mt-1">Dialogue will appear here once processed.</p>
              </div>
            ) : (
              session.transcript.map((entry, index) => (
                <div key={index} className="flex gap-4 group">
                  <div className="flex flex-col items-center shrink-0">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white shadow-sm ring-4 ring-white">
                      Q{entry.question_index + 1}
                    </div>
                    {index !== session.transcript.length - 1 && (
                      <div className="w-px h-full bg-slate-200 mt-2 group-hover:bg-indigo-200 transition-colors" />
                    )}
                  </div>
                  <div className="flex-1 pb-2">
                    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden transition-all group-hover:border-indigo-200 group-hover:shadow-md">
                      <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-100">
                        <p className="text-sm font-medium text-slate-900 leading-snug">
                          {entry.question?.question_text || 'Question not available'}
                        </p>
                      </div>
                      <div className="p-4 bg-white relative">
                        <div className="absolute top-4 left-4 text-slate-200">
                          <svg className="h-6 w-6 transform -scale-x-100" fill="currentColor" viewBox="0 0 32 32" aria-hidden="true"><path d="M9.352 4C4.456 7.456 1 13.12 1 19.36c0 5.088 3.072 8.064 6.624 8.064 3.36 0 5.856-2.688 5.856-5.856 0-3.168-2.208-5.472-5.088-5.472-.576 0-1.344.096-1.536.192.48-3.264 3.552-7.104 6.624-9.024L9.352 4zm16.512 0c-4.896 3.456-8.352 9.12-8.352 15.36 0 5.088 3.072 8.064 6.624 8.064 3.264 0 5.856-2.688 5.856-5.856 0-3.168-2.304-5.472-5.184-5.472-.576 0-1.248.096-1.44.192.48-3.264 3.456-7.104 6.528-9.024L25.864 4z" /></svg>
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed relative z-10 pl-8 pt-1 text-justify">
                          {entry.answer}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
