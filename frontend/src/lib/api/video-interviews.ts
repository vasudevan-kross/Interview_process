import { apiClient } from './client'

export interface VideoInterviewQuestion {
  question_text: string
  topic?: string
  difficulty?: string
  expected_duration_minutes?: number
}

export interface VideoInterviewCampaign {
  id: string
  org_id: string
  created_by?: string
  created_at: string
  updated_at?: string
  name: string
  job_role: string
  description?: string
  job_description_text?: string
  interview_style: 'structured' | 'adaptive' | 'conversational'
  interview_duration_minutes: number
  scheduled_start_time?: string
  scheduled_end_time?: string
  grace_period_minutes: number
  avatar_config: Record<string, any>
  questions: VideoInterviewQuestion[]
  llm_model?: string
  is_active: boolean
  candidate_count: number
}

export interface VideoInterviewCampaignCreate {
  name: string
  job_role: string
  description?: string
  job_description_text?: string
  interview_style?: 'structured' | 'adaptive' | 'conversational'
  interview_duration_minutes?: number
  scheduled_start_time?: string
  scheduled_end_time?: string
  grace_period_minutes?: number
  avatar_config?: Record<string, any>
  questions?: VideoInterviewQuestion[]
  llm_model?: string
  num_questions?: number
  question_difficulty?: 'low' | 'medium' | 'hard'
  question_basis?: string[]
}

export interface VideoInterviewCandidate {
  id: string
  org_id: string
  campaign_id: string
  interview_token: string
  name: string
  email?: string
  phone?: string
  status: string
  latest_session_id?: string
  created_at: string
  updated_at?: string
  started_at?: string
  ended_at?: string
  recruiter_notes?: string
}

export interface VideoInterviewCandidatePublic {
  id: string
  interview_token: string
  name: string
  email?: string
  status: string
  campaign_id: string
  campaign_name: string
  job_role: string
  interview_duration_minutes: number
  scheduled_start_time?: string
  scheduled_end_time?: string
  grace_period_minutes: number
  avatar_config: Record<string, any>
  questions: VideoInterviewQuestion[]
}

export interface VideoInterviewSessionStartResponse {
  session_id: string
  campaign_id: string
  candidate_id: string
  questions: VideoInterviewQuestion[]
  current_question?: VideoInterviewQuestion
  interview_duration_minutes: number
  avatar_config: Record<string, any>
  audio_base64?: string
  audio_content_type?: string
}

export interface VideoInterviewTurnResponse {
  session_id: string
  next_question?: VideoInterviewQuestion
  done: boolean
  summary?: string
  evaluation?: Record<string, any>
}

export interface VideoInterviewAudioTurnResponse {
  session_id: string
  transcript?: string
  next_question?: VideoInterviewQuestion
  done: boolean
  summary?: string
  evaluation?: Record<string, any>
  speech_detected: boolean
  audio_base64?: string
  audio_content_type?: string
}

export interface VideoInterviewSession {
  id: string
  campaign_id: string
  candidate_id: string
  status: string
  started_at: string
  ended_at?: string
  duration_seconds?: number
  questions: VideoInterviewQuestion[]
  transcript: Array<Record<string, any>>
  interview_summary?: string
  evaluation: Record<string, any>
  recording_path?: string
  recording_bucket?: string
  recording_content_type?: string
  recording_duration_seconds?: number
  signed_recording_url?: string
  candidate?: { first_name: string; last_name: string }
}

// Campaigns
export async function createVideoCampaign(data: VideoInterviewCampaignCreate): Promise<VideoInterviewCampaign> {
  const response = await apiClient['client'].post('/api/v1/video-interviews/campaigns', data)
  return response.data
}

export async function generateVideoQuestions(data: VideoInterviewCampaignCreate): Promise<VideoInterviewQuestion[]> {
  const response = await apiClient['client'].post('/api/v1/video-interviews/campaigns/generate-questions', data)
  return response.data.questions
}

export async function listVideoCampaigns(params?: { is_active?: boolean }): Promise<VideoInterviewCampaign[]> {
  const response = await apiClient['client'].get('/api/v1/video-interviews/campaigns', { params })
  return response.data
}

export async function getVideoCampaign(campaignId: string): Promise<VideoInterviewCampaign> {
  const response = await apiClient['client'].get(`/api/v1/video-interviews/campaigns/${campaignId}`)
  return response.data
}

export async function updateVideoCampaign(campaignId: string, updates: Partial<VideoInterviewCampaignCreate>): Promise<VideoInterviewCampaign> {
  const response = await apiClient['client'].patch(`/api/v1/video-interviews/campaigns/${campaignId}`, updates)
  return response.data
}

export async function deleteVideoCampaign(campaignId: string): Promise<VideoInterviewCampaign> {
  const response = await apiClient['client'].delete(`/api/v1/video-interviews/campaigns/${campaignId}`)
  return response.data
}

// Candidates
export async function createVideoCandidate(data: {
  campaign_id: string
  name: string
  email?: string
  phone?: string
}): Promise<VideoInterviewCandidate> {
  const response = await apiClient['client'].post('/api/v1/video-interviews/candidates', data)
  return response.data
}

export async function importVideoCandidates(campaignId: string, file: File): Promise<{ imported: number; candidates: VideoInterviewCandidate[] }> {
  const formData = new FormData()
  formData.append('campaign_id', campaignId)
  formData.append('file', file)
  const response = await apiClient['client'].post('/api/v1/video-interviews/candidates/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data
}

export async function listVideoCandidates(params?: { campaign_id?: string }): Promise<VideoInterviewCandidate[]> {
  const response = await apiClient['client'].get('/api/v1/video-interviews/candidates', { params })
  return response.data
}

export async function deleteVideoCandidate(candidateId: string): Promise<VideoInterviewCandidate> {
  const response = await apiClient['client'].delete(`/api/v1/video-interviews/candidates/${candidateId}`)
  return response.data
}

// Public candidate flow
export async function getVideoCandidateByToken(token: string): Promise<VideoInterviewCandidatePublic> {
  const response = await fetch(`/api/v1/video-interviews/candidates/token/${token}`)
  if (!response.ok) throw new Error('Failed to load interview')
  return response.json()
}

export async function startVideoSession(token: string): Promise<VideoInterviewSessionStartResponse> {
  const response = await fetch(`/api/v1/video-interviews/candidates/token/${token}/session/start`, {
    method: 'POST',
  })
  if (!response.ok) throw new Error('Failed to start interview')
  return response.json()
}

export async function submitVideoTurn(sessionId: string, answerText: string): Promise<VideoInterviewTurnResponse> {
  const response = await fetch('/api/v1/video-interviews/sessions/turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, answer_text: answerText }),
  })
  if (!response.ok) throw new Error('Failed to submit answer')
  return response.json()
}

export async function submitVideoAudioTurn(sessionId: string, audio: Blob): Promise<VideoInterviewAudioTurnResponse> {
  const formData = new FormData()
  formData.append('session_id', sessionId)
  formData.append('audio', audio, 'answer.webm')

  const response = await fetch('/api/v1/video-interviews/sessions/turn/audio', {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) throw new Error('Failed to submit audio answer')
  return response.json()
}

export async function uploadVideoRecording(sessionId: string, file: File, durationSeconds?: number): Promise<VideoInterviewSession> {
  const formData = new FormData()
  formData.append('recording', file)
  if (durationSeconds !== undefined) formData.append('duration_seconds', String(durationSeconds))

  const response = await fetch(`/api/v1/video-interviews/sessions/${sessionId}/recording`, {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) throw new Error('Failed to upload recording')
  return response.json()
}

export async function getVideoSession(sessionId: string): Promise<VideoInterviewSession> {
  const response = await apiClient['client'].get(`/api/v1/video-interviews/sessions/${sessionId}`)
  return response.data
}

export async function listVideoSessions(params?: { campaign_id?: string; candidate_id?: string }): Promise<VideoInterviewSession[]> {
  const response = await apiClient['client'].get('/api/v1/video-interviews/sessions', { params })
  return response.data
}

/**
 * Returns the WebSocket URL for a video interview session.
 * Derives from window.location so it works through ngrok, reverse proxies,
 * and local dev without any env var config. The Next.js dev server forwards
 * WS upgrade requests through rewrites() just like HTTP.
 * Set NEXT_PUBLIC_WS_URL to override (e.g. for separate backend domains).
 */
export function getVideoInterviewWSUrl(token: string): string {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return `${process.env.NEXT_PUBLIC_WS_URL}/api/v1/video-interviews/ws/${token}`
  }
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.host}/api/v1/video-interviews/ws/${token}`
  }
  return `ws://localhost:8000/api/v1/video-interviews/ws/${token}`
}
