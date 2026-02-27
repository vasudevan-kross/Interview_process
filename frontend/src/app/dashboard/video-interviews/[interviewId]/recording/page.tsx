'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Loader2, PlayCircle, Download } from 'lucide-react'
import { getRecordingUrl, getInterviewDetails } from '@/lib/api/video-interviews'
import { toast } from 'sonner'
import { format } from 'date-fns'

export default function RecordingPage() {
  const params = useParams()
  const router = useRouter()
  const interviewId = params?.interviewId as string

  const [recordingUrl, setRecordingUrl] = useState<string | null>(null)
  const [interview, setInterview] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (interviewId) {
      fetchRecording()
    }
  }, [interviewId])

  const fetchRecording = async () => {
    try {
      setLoading(true)

      // Fetch interview details
      const interviewData = await getInterviewDetails(interviewId)
      setInterview(interviewData)

      if (!interviewData.recording_path) {
        setError('Recording not available yet. Please check back later.')
        return
      }

      // Fetch recording URL
      const { recording_url } = await getRecordingUrl(interviewId)
      setRecordingUrl(recording_url)
    } catch (error: any) {
      setError(error.message || 'Failed to load recording')
      toast.error(error.message || 'Failed to load recording')
    } finally {
      setLoading(false)
    }
  }

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`
    } else {
      return `${secs}s`
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-cyan-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading recording...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto mt-12">
        <Button variant="ghost" onClick={() => router.back()} className="mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Card>
          <CardContent className="pt-12 pb-12">
            <div className="text-center">
              <PlayCircle className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-900 mb-2">{error}</h3>
              <p className="text-slate-600 mb-6">
                Recordings are processed after the interview ends. This may take a few minutes.
              </p>
              <div className="flex items-center justify-center gap-4">
                <Button variant="outline" onClick={() => router.back()}>
                  Go Back
                </Button>
                <Button onClick={fetchRecording} className="bg-cyan-600 hover:bg-cyan-700">
                  Retry
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Button
          variant="ghost"
          onClick={() => router.push(`/dashboard/video-interviews/${interviewId}`)}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Interview Details
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Interview Recording</h1>
            <p className="text-slate-600 mt-1">{interview?.title}</p>
          </div>
          {recordingUrl && (
            <Button
              variant="outline"
              onClick={() => window.open(recordingUrl, '_blank')}
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          )}
        </div>
      </div>

      {/* Video Player */}
      <Card>
        <CardContent className="p-0">
          <div className="bg-black rounded-t-lg">
            {recordingUrl ? (
              <video
                controls
                className="w-full aspect-video rounded-t-lg"
                src={recordingUrl}
                controlsList="nodownload"
              >
                Your browser does not support the video tag.
              </video>
            ) : (
              <div className="aspect-video flex items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-white" />
              </div>
            )}
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-600">Duration</label>
                <p className="mt-1 text-slate-900 font-medium">
                  {interview?.recording_duration_seconds
                    ? formatDuration(interview.recording_duration_seconds)
                    : 'N/A'}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600">Recorded On</label>
                <p className="mt-1 text-slate-900 font-medium">
                  {interview?.completed_at
                    ? format(new Date(interview.completed_at), 'MMM dd, yyyy')
                    : 'N/A'}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600">Candidate</label>
                <p className="mt-1 text-slate-900 font-medium">
                  {interview?.candidate_name || 'N/A'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transcript (if available) */}
      {interview?.transcript_text && (
        <Card>
          <CardHeader>
            <CardTitle>Transcript</CardTitle>
            <CardDescription>
              Auto-generated transcript of the interview
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-50 rounded-lg p-4 max-h-96 overflow-y-auto">
              <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                {interview.transcript_text}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Participants */}
      {interview?.participants && interview.participants.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Participants ({interview.participants.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {interview.participants.map((participant: any) => (
                <div
                  key={participant.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-50"
                >
                  <div>
                    <p className="font-medium text-slate-900">{participant.name}</p>
                    <p className="text-sm text-slate-600">{participant.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-600 capitalize">{participant.role}</p>
                    {participant.duration_seconds && (
                      <p className="text-sm text-slate-500">
                        {formatDuration(participant.duration_seconds)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Next Steps</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() =>
                router.push(`/dashboard/video-interviews/${interviewId}/evaluate`)
              }
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              Evaluate Interview
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/dashboard/video-interviews/${interviewId}`)}
            >
              View Full Details
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
